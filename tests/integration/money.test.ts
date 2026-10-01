import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { auditLog, expensePayers, expenses, expenseShares, notifications } from "@/db/schema";
import { toAppError } from "@/server/errors";
import { changeEventStatus, createEvent } from "@/server/events";
import { createExpense, createRefund, deleteExpense, updateExpense } from "@/server/expenses";
import { addGuestMember, createGroupInvite, acceptInvite } from "@/server/groups";
import { getBalanceExplanation, getEventView, getGroupView } from "@/server/queries";
import { createSettlement, decideSettlement } from "@/server/settlements";
import { equalExpense, key, makeGroup, makeUser, memberIdOf, today } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const balancesOf = async (actor: { userId: string }, groupId: string) => (await getGroupView(actor, groupId)).balances;

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => toAppError(e).code === code);
}

describe("scenario 1 — trip with unequal presence", () => {
  it("weighted nights, a skipped activity and two fuel payers match the hand calculation", async () => {
    const ali = await makeUser("Ali");
    const { groupId, ids } = await makeGroup(ali, ["sara", "reza", "mina"]);
    const { eventId } = await createEvent(ali, {
      groupId,
      title: "سفر شمال",
      type: "trip",
      startDate: "2026-09-01",
      endDate: "2026-09-04",
      participantMemberIds: Object.values(ids),
    });

    await createExpense(
      ali,
      {
        ...equalExpense(groupId, 11_000_000n, ids.owner, []),
        eventId,
        title: "ویلا",
        category: "accommodation",
        splitType: "shares",
        shares: [
          { memberId: ids.owner, value: "300" },
          { memberId: ids.sara, value: "300" },
          { memberId: ids.reza, value: "300" },
          { memberId: ids.mina, value: "200" },
        ],
      },
      key(),
    );
    await createExpense(
      ali,
      { ...equalExpense(groupId, 3_000_000n, ids.sara, [ids.owner, ids.sara, ids.mina]), eventId, title: "رفتینگ" },
      key(),
    );
    await createExpense(
      ali,
      {
        ...equalExpense(groupId, 2_000_000n, ids.reza, Object.values(ids)),
        eventId,
        title: "بنزین",
        category: "fuel",
        payers: [
          { memberId: ids.reza, amount: "1200000" },
          { memberId: ids.mina, amount: "800000" },
        ],
      },
      key(),
    );

    const view = await getGroupView(ali, groupId);
    expect(view.balances.get(ids.owner)).toBe(6_500_000n);
    expect(view.balances.get(ids.sara)).toBe(-1_500_000n);
    expect(view.balances.get(ids.reza)).toBe(-2_300_000n);
    expect(view.balances.get(ids.mina)).toBe(-2_700_000n);

    // Settle with the suggestions. Ali (owner/admin) records them on behalf of the guests.
    for (const t of view.suggestions) {
      await createSettlement(
        ali,
        { groupId, fromMemberId: t.fromMemberId, toMemberId: t.toMemberId, amount: t.amount.toString(), method: "bank_transfer" },
        key(),
      );
    }
    for (const v of (await balancesOf(ali, groupId)).values()) expect(v).toBe(0n);
    const ev = await getEventView(ali, groupId, eventId);
    expect(ev.closable).toBe(true);
    await changeEventStatus(ali, eventId, "close");

    const explained = await getBalanceExplanation(ali, groupId, ids.mina);
    expect(explained.total).toBe(0n);
    expect(explained.lines.reduce((a, l) => a + l.effect, 0n)).toBe(0n);
  });
});

describe("scenario 2 — partial payment with confirmation", () => {
  it("pending changes nothing, confirm applies, reject never applies, only the receiver decides", async () => {
    const ali = await makeUser("Ali");
    const sara = await makeUser("Sara");
    const { groupId, ids } = await makeGroup(ali, []);
    const { token } = await createGroupInvite(ali, groupId);
    await acceptInvite(sara, token);
    const saraId = await memberIdOf(groupId, sara);

    await createExpense(ali, equalExpense(groupId, 1_000_000n, ids.owner, [ids.owner, saraId]), key());
    expect((await balancesOf(ali, groupId)).get(saraId)).toBe(-500_000n);

    const pay = await createSettlement(
      sara,
      { groupId, fromMemberId: saraId, toMemberId: ids.owner, amount: "200000", method: "bank_transfer" },
      key(),
    );
    expect(pay.status).toBe("pending");
    expect((await balancesOf(ali, groupId)).get(saraId)).toBe(-500_000n);
    const notes = await getDb().select().from(notifications).where(eq(notifications.userId, ali.userId));
    expect(notes.some((n) => n.type === "settlement_pending")).toBe(true);

    await expectAppError(decideSettlement(sara, pay.settlementId, "confirm"), "FORBIDDEN");
    await decideSettlement(ali, pay.settlementId, "confirm");
    expect((await balancesOf(ali, groupId)).get(saraId)).toBe(-300_000n);
    await expectAppError(decideSettlement(ali, pay.settlementId, "reject"), "VALIDATION");

    const second = await createSettlement(
      sara,
      { groupId, fromMemberId: saraId, toMemberId: ids.owner, amount: "100000", method: "cash" },
      key(),
    );
    await decideSettlement(ali, second.settlementId, "reject");
    expect((await balancesOf(ali, groupId)).get(saraId)).toBe(-300_000n);

    // The receiver recording a payment is itself the confirmation.
    const direct = await createSettlement(
      ali,
      { groupId, fromMemberId: saraId, toMemberId: ids.owner, amount: "300000", method: "cash" },
      key(),
    );
    expect(direct.status).toBe("confirmed");
    expect((await balancesOf(ali, groupId)).get(saraId)).toBe(0n);
  });
});

describe("scenario 3 — refunds", () => {
  it("partial then full refund, cap enforced, replay does not duplicate", async () => {
    const ali = await makeUser("Ali");
    const { groupId, ids } = await makeGroup(ali, ["sara", "reza"]);
    const { expenseId } = await createExpense(
      ali,
      equalExpense(groupId, 900_000n, ids.owner, [ids.owner, ids.sara, ids.reza]),
      key(),
    );

    const k1 = key();
    const partial = { expenseId, amount: "300000", date: today };
    const r1 = await createRefund(ali, partial, k1);
    const r1again = await createRefund(ali, partial, k1);
    expect(r1again).toEqual({ expenseId: r1.expenseId, replayed: true });
    await expectAppError(createRefund(ali, { ...partial, amount: "1" }, k1), "IDEMPOTENCY_CONFLICT");

    let b = await balancesOf(ali, groupId);
    expect(b.get(ids.sara)).toBe(-200_000n);

    await expectAppError(createRefund(ali, { expenseId, amount: "600001", date: today }, key()), "VALIDATION");
    await createRefund(ali, { expenseId, amount: "600000", date: today }, key());
    b = await balancesOf(ali, groupId);
    for (const v of b.values()) expect(v).toBe(0n);
    await expectAppError(createRefund(ali, { expenseId, amount: "1", date: today }, key()), "VALIDATION");

    const refunds = await getDb().select().from(expenses).where(eq(expenses.refundOfExpenseId, expenseId));
    expect(refunds).toHaveLength(2);
    // The original cannot be deleted while it has refunds, nor shrunk below the refunded sum.
    const [orig] = await getDb().select().from(expenses).where(eq(expenses.id, expenseId));
    await expectAppError(deleteExpense(ali, expenseId, orig.version), "VALIDATION");
  });

  it("cancelling an event keeps its expenses; refunds bring the money back", async () => {
    const ali = await makeUser("Ali");
    const { groupId, ids } = await makeGroup(ali, ["sara"]);
    const { eventId } = await createEvent(ali, {
      groupId,
      title: "کنسرت",
      type: "gathering",
      startDate: null,
      endDate: null,
      participantMemberIds: [],
    });
    const { expenseId } = await createExpense(
      ali,
      { ...equalExpense(groupId, 400_000n, ids.owner, [ids.owner, ids.sara]), eventId },
      key(),
    );
    await changeEventStatus(ali, eventId, "cancel");
    await expectAppError(
      createExpense(ali, { ...equalExpense(groupId, 1000n, ids.owner, [ids.owner]), eventId }, key()),
      "VALIDATION",
    );
    expect((await balancesOf(ali, groupId)).get(ids.sara)).toBe(-200_000n);
    await createRefund(ali, { expenseId, amount: "400000", date: today }, key());
    expect((await balancesOf(ali, groupId)).get(ids.sara)).toBe(0n);
  });
});

describe("scenario 4 — editing keeps history and notifies affected people", () => {
  it("records before/after, notifies a removed participant, rejects stale versions", async () => {
    const ali = await makeUser("Ali");
    const sara = await makeUser("Sara");
    const reza = await makeUser("Reza");
    const { groupId, ids } = await makeGroup(ali, []);
    const { token } = await createGroupInvite(ali, groupId);
    await acceptInvite(sara, token);
    await acceptInvite(reza, token);
    const saraId = await memberIdOf(groupId, sara);
    const rezaId = await memberIdOf(groupId, reza);

    const { expenseId } = await createExpense(
      sara,
      equalExpense(groupId, 600_000n, saraId, [ids.owner, saraId, rezaId]),
      key(),
    );
    // A regular member cannot edit someone else's expense.
    await expectAppError(
      updateExpense(reza, expenseId, 1, equalExpense(groupId, 1n, rezaId, [rezaId])),
      "FORBIDDEN",
    );

    const { version } = await updateExpense(
      sara,
      expenseId,
      1,
      equalExpense(groupId, 800_000n, saraId, [ids.owner, saraId]),
    );
    expect(version).toBe(2);
    await expectAppError(
      updateExpense(sara, expenseId, 1, equalExpense(groupId, 900_000n, saraId, [saraId])),
      "VERSION_CONFLICT",
    );

    const history = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, expenseId), eq(auditLog.action, "update")));
    expect(history).toHaveLength(1);
    expect((history[0].before as { expense: { totalAmount: string } }).expense.totalAmount).toBe("600000");
    expect((history[0].after as { expense: { totalAmount: string } }).expense.totalAmount).toBe("800000");

    const rezaNotes = await getDb().select().from(notifications).where(eq(notifications.userId, reza.userId));
    expect(rezaNotes.map((n) => n.type)).toContain("expense_updated");
    const b = await balancesOf(ali, groupId);
    expect(b.get(rezaId) ?? 0n).toBe(0n);

    await deleteExpense(sara, expenseId, 2);
    for (const v of (await balancesOf(ali, groupId)).values()) expect(v).toBe(0n);
    const [row] = await getDb().select().from(expenses).where(eq(expenses.id, expenseId));
    expect(row.deletedAt).not.toBeNull();
  });
});

describe("scenario 5 — a settlement covering several events", () => {
  it("auto-allocates oldest event first; each event closes only when its own balance is zero", async () => {
    const ali = await makeUser("Ali");
    const { groupId, ids } = await makeGroup(ali, ["sara"]);
    const mk = (title: string, startDate: string) =>
      createEvent(ali, { groupId, title, type: "gathering", startDate, endDate: null, participantMemberIds: [] });
    const { eventId: trip } = await mk("سفر", "2026-08-01");
    const { eventId: bday } = await mk("تولد", "2026-09-01");
    await createExpense(ali, { ...equalExpense(groupId, 1_000_000n, ids.owner, [ids.owner, ids.sara]), eventId: bday }, key());
    await createExpense(ali, { ...equalExpense(groupId, 600_000n, ids.owner, [ids.owner, ids.sara]), eventId: trip }, key());

    // sara owes 300k (trip) + 500k (birthday) = 800k; she pays 400k.
    await createSettlement(
      ali,
      { groupId, fromMemberId: ids.sara, toMemberId: ids.owner, amount: "400000", method: "cash" },
      key(),
    );
    const tripView = await getEventView(ali, groupId, trip);
    const bdayView = await getEventView(ali, groupId, bday);
    expect(tripView.closable).toBe(true);
    expect(bdayView.closable).toBe(false);
    expect(bdayView.balances.get(ids.sara)).toBe(-400_000n);
    await changeEventStatus(ali, trip, "close");
    await expectAppError(changeEventStatus(ali, bday, "close"), "VALIDATION");

    // Expenses of a closed event are frozen until it is reopened.
    await expectAppError(
      createExpense(ali, { ...equalExpense(groupId, 1000n, ids.owner, [ids.owner]), eventId: trip }, key()),
      "VALIDATION",
    );

    // Explicit allocations must add up and belong to this group.
    await expectAppError(
      createSettlement(
        ali,
        {
          groupId,
          fromMemberId: ids.sara,
          toMemberId: ids.owner,
          amount: "400000",
          method: "cash",
          allocations: [{ eventId: bday, amount: "300000" }],
        },
        key(),
      ),
      "VALIDATION",
    );
    await createSettlement(
      ali,
      {
        groupId,
        fromMemberId: ids.sara,
        toMemberId: ids.owner,
        amount: "400000",
        method: "cash",
        allocations: [{ eventId: bday, amount: "400000" }],
      },
      key(),
    );
    await changeEventStatus(ali, bday, "close");
  });
});

describe("database integrity triggers", () => {
  it("refuses to commit an expense whose shares do not add up, even if a service forgot to check", async () => {
    const ali = await makeUser("Ali");
    const { groupId, ids } = await makeGroup(ali, ["sara"]);
    const attempt = getDb().transaction(async (tx) => {
      const [e] = await tx
        .insert(expenses)
        .values({ groupId, title: "x", totalAmount: 1000n, date: today, splitType: "exact", createdBy: ali.userId })
        .returning();
      await tx.insert(expensePayers).values({ expenseId: e.id, memberId: ids.owner, amount: 1000n });
      await tx.insert(expenseShares).values({ expenseId: e.id, memberId: ids.sara, amount: 999n });
    });
    await expect(attempt).rejects.toThrow();
  });

  it("refuses members from another group", async () => {
    const ali = await makeUser("Ali");
    const a = await makeGroup(ali, []);
    const b = await makeGroup(ali, []);
    const stranger = await addGuestMember(ali, b.groupId, "غریبه");
    await expectAppError(
      createExpense(ali, equalExpense(a.groupId, 1000n, a.ids.owner, [a.ids.owner, stranger.memberId]), key()),
      "FORBIDDEN",
    );
  });
});
