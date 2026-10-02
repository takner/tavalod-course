import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { auditLog, expenses, notifications, pollVotes, polls, privateSpaceMembers, wishlistReservations } from "@/db/schema";
import { getExpenseRecord, createExpense, createRefund } from "@/server/expenses";
import { toAppError } from "@/server/errors";
import { createBirthday } from "@/server/birthdays";
import { getEventPlan } from "@/server/event-plan";
import { setRsvp, updateEventDetails } from "@/server/event-planning";
import { readFile, saveImage } from "@/server/files";
import {
  cancelGift,
  createGift,
  getGiftView,
  recordPurchase,
  respondPledge,
} from "@/server/gift-plans";
import { acceptInvite, addGuestMember, createGroupInvite } from "@/server/groups";
import { closePoll, createPoll, decidePoll, getPollView, listPolls, vote } from "@/server/polls";
import { getActivity, getGroupView, getMyAccount, listNotifications } from "@/server/queries";
import { createSettlement, decideSettlement } from "@/server/settlements";
import { getSpaceView } from "@/server/spaces";
import {
  addItem,
  createWishlist,
  enableShareLink,
  getOwnWishlist,
  getSharedWishlist,
  getWishlistInGroup,
  reserveItem,
} from "@/server/wishlists";
import { equalExpense, key, makeGroup, makeUser, memberIdOf, today } from "./helpers";

afterAll(async () => {
  await closeDb();
});

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => toAppError(e).code === code);
}

/** Owner (organiser) + `n` real users who joined through the group link. */
async function bigGroup(names: string[]) {
  const owner = await makeUser("Owner");
  const { groupId, ids } = await makeGroup(owner, []);
  const { token } = await createGroupInvite(owner, groupId);
  const users: Record<string, { userId: string; email: string; memberId: string }> = {};
  for (const n of names) {
    const u = await makeUser(n);
    await acceptInvite(u, token);
    users[n] = { ...u, memberId: await memberIdOf(groupId, u) };
  }
  return { owner: { ...owner, memberId: ids.owner }, groupId, users };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);

describe("birthday: 10 guests, 7 gift contributors, cake for guests, gift only for contributors", async () => {
  const c = ["c1", "c2", "c3", "c4", "c5", "c6"]; // + owner = 7 contributors
  const { owner, groupId, users } = await bigGroup(["celebrant", ...c, "g1", "g2", "g3"]);
  const celebrant = users.celebrant;
  const { eventId, spaceId } = await createBirthday(owner, {
    groupId,
    celebrantMemberId: celebrant.memberId,
    date: "2026-10-20",
    time: "19:30",
    createSurprise: true,
    addChecklist: true,
  });

  it("creates the event with the celebrant invited and a surprise space without them", async () => {
    expect(spaceId).toBeTruthy();
    const members = await getDb().select().from(privateSpaceMembers).where(eq(privateSpaceMembers.spaceId, spaceId!));
    expect(members.map((m) => m.memberId)).not.toContain(celebrant.memberId);
    expect(members).toHaveLength(10);
    const plan = await getEventPlan(owner, groupId, eventId);
    expect(plan.event.startsAt?.toISOString()).toBe("2026-10-20T16:00:00.000Z");
    expect(plan.waitingFor).toContain(celebrant.memberId);
  });

  it("headcount comes from RSVPs (companions are statistical) and drives the cake estimate", async () => {
    // 10 guests: 9 members going (owner already going) … set RSVPs so 10 adults + 2 children attend.
    for (const n of [...c, "g1", "g2"]) await setRsvp(users[n], eventId, { status: "going", adultCompanions: 0, childCompanions: 0 });
    await setRsvp(users.g3, eventId, { status: "going", adultCompanions: 0, childCompanions: 2 });
    await setRsvp(celebrant, eventId, { status: "declined", adultCompanions: 0, childCompanions: 0 });
    const plan = await getEventPlan(owner, groupId, eventId);
    expect(plan.headcount.adults).toBe(10);
    expect(plan.headcount.children).toBe(2);
    expect(plan.cake).toEqual({ baseGrams: 1700, withMarginGrams: 1870, suggestedGrams: 2000 });
  });

  it("gift shares are split among the 7 contributors only; the public group ledger is untouched", async () => {
    const contributors = [owner.memberId, ...c.map((n) => users[n].memberId)];
    const { giftId } = await createGift(owner, {
      spaceId: spaceId!,
      title: "هدفون",
      budget: "1400000",
      buyerMemberId: owner.memberId,
      contributorIds: contributors,
    });
    const view = await getGiftView(owner, giftId);
    expect(view.suggestedShares.map((s) => s.amount)).toEqual(Array(7).fill(200_000n));
    await respondPledge(owner, giftId, { decision: "pledge", amount: "200000" });
    for (const n of c) await respondPledge(users[n], giftId, { decision: "pledge", amount: "200000" });

    await recordPurchase(owner, giftId, { total: "1330000", date: today });
    const after = await getGiftView(owner, giftId);
    expect(after.ledger.perMember.filter((m) => m.share > 0n)).toHaveLength(7);
    expect(after.ledger.perMember.every((m) => m.share === 0n || m.share === 190_000n)).toBe(true);

    const pub = await getGroupView(owner, groupId);
    for (const v of pub.balances.values()) expect(v).toBe(0n);
    const space = await getSpaceView(owner, spaceId!);
    expect(space.balances.get(owner.memberId)).toBe(1_330_000n - 190_000n);
  });
});

describe("surprise privacy: the celebrant and outsiders learn nothing through any server path", async () => {
  const { owner, groupId, users } = await bigGroup(["celebrant", "a", "b"]);
  const outsider = await makeUser("Outsider");
  const celebrant = users.celebrant;
  const { eventId, spaceId } = await createBirthday(owner, {
    groupId,
    celebrantMemberId: celebrant.memberId,
    date: "2026-11-01",
    time: null,
    createSurprise: true,
    addChecklist: true,
  });
  const { giftId } = await createGift(owner, {
    spaceId: spaceId!,
    title: "ساعت مخفی",
    budget: "900000",
    buyerMemberId: owner.memberId,
    contributorIds: [owner.memberId, users.a.memberId, users.b.memberId],
  });
  for (const u of [owner, users.a, users.b]) await respondPledge(u, giftId, { decision: "pledge", amount: "300000" });
  const receipt = await saveImage(owner, "receipt", new File([PNG], "r.png", { type: "image/png" }));
  const { expenseId } = await recordPurchase(owner, giftId, { total: "900000", date: today, receiptFileId: receipt.fileId });
  await createSettlement(users.a, { groupId, spaceId, giftId, purpose: "collection", fromMemberId: users.a.memberId, toMemberId: owner.memberId, amount: "300000", method: "cash" }, key());
  const { pollId } = await createPoll(owner, {
    groupId,
    eventId: null,
    spaceId: spaceId!,
    kind: "gift",
    question: "کدام هدیه؟",
    multi: false,
    resultsMode: "public",
    deadlineDate: null,
    deadlineTime: null,
    options: [{ label: "ساعت" }, { label: "کتاب" }],
  });

  it("direct reads of the space, gift, poll, purchase expense and receipt are NOT_FOUND", async () => {
    for (const who of [celebrant, outsider]) {
      await expectCode(getSpaceView(who, spaceId!), "NOT_FOUND");
      await expectCode(getGiftView(who, giftId), "NOT_FOUND");
      await expectCode(getPollView(who, pollId), "NOT_FOUND");
      await expectCode(getExpenseRecord(who, expenseId), "NOT_FOUND");
      await expectCode(readFile(who, receipt.fileId), "NOT_FOUND");
      await expectCode(listPolls(who, { groupId, spaceId: spaceId! }), "NOT_FOUND");
    }
    await expectCode(readFile(null, receipt.fileId), "NOT_FOUND");
  });

  it("writes into the space are refused (expense, settlement, vote, pledge)", async () => {
    await expectCode(
      createExpense(celebrant, { ...equalExpense(groupId, 1000n, celebrant.memberId, [celebrant.memberId]), spaceId }, key()),
      "NOT_FOUND",
    );
    await expectCode(
      createSettlement(celebrant, { groupId, spaceId, fromMemberId: celebrant.memberId, toMemberId: owner.memberId, amount: "1", method: "cash" }, key()),
      "NOT_FOUND",
    );
    await expectCode(vote(celebrant, pollId, []), "NOT_FOUND");
    await expectCode(respondPledge(celebrant, giftId, { decision: "pledge", amount: "1" }), "NOT_FOUND");
  });

  it("aggregate views, activity, notifications, polls list and the event page reveal nothing", async () => {
    const view = await getGroupView(celebrant, groupId);
    for (const v of view.balances.values()) expect(v).toBe(0n);
    expect(view.pending).toHaveLength(0);
    expect(view.suggestions).toHaveLength(0);

    const activity = await getActivity(celebrant, groupId);
    expect(activity.every(({ log }) => log.spaceId === null)).toBe(true);
    expect(JSON.stringify(activity)).not.toContain("ساعت مخفی");

    const notes = await listNotifications(celebrant);
    expect(notes.every(({ n }) => n.spaceId === null)).toBe(true);
    expect(JSON.stringify(notes)).not.toContain("ساعت مخفی");

    expect((await listPolls(celebrant, { groupId })).map((p) => p.id)).not.toContain(pollId);
    expect((await listPolls(celebrant, { groupId, eventId })).map((p) => p.id)).not.toContain(pollId);

    const plan = await getEventPlan(celebrant, groupId, eventId);
    expect(plan.spaces).toHaveLength(0);
    expect(plan.budgetLines.every((l) => l.actual === 0n)).toBe(true);
    expect(plan.next.some((n) => n.kind === "space")).toBe(false);
    expect(JSON.stringify(plan, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("ساعت مخفی");

    const account = await getMyAccount(celebrant);
    expect(account.pendingIncoming).toHaveLength(0);
    expect(account.groups[0].myBalance).toBe(0n);
  });

  it("the database refuses to put the celebrant into the space", async () => {
    await expect(getDb().insert(privateSpaceMembers).values({ spaceId: spaceId!, memberId: celebrant.memberId })).rejects.toThrow();
  });

  it("members of the space do see everything", async () => {
    const v = await getSpaceView(users.b, spaceId!);
    expect(v.gifts.map((g) => g.title)).toContain("ساعت مخفی");
    expect((await readFile(users.b, receipt.fileId)).contentType).toBe("image/png");
    expect(v.pending.length).toBe(1);
  });

  it("changing the celebrant to a space member is refused", async () => {
    await expectCode(
      updateEventDetails(owner, eventId, {
        title: "تولد",
        type: "birthday",
        date: "2026-11-01",
        time: null,
        endDate: null,
        rsvpDeadlineDate: null,
        celebrantMemberId: users.a.memberId,
        budgets: {},
      }),
      "VALIDATION",
    );
  });
});

describe("wishlists: visibility, hidden reservations, exclusive concurrent reservation", async () => {
  const { owner, groupId, users } = await bigGroup(["wisher", "x", "y"]);
  const wisher = users.wisher;
  const { wishlistId } = await createWishlist(wisher, { title: "آرزوهای من", groupIds: [groupId] });
  const { itemId } = await addItem(wisher, wishlistId, {
    kind: "product",
    title: "کتاب",
    priority: 1,
    status: "wanted",
    acceptsSubstitute: true,
    productUrl: "https://example.com/book",
    price: "250000",
    priceObservedOn: "2026-09-30",
  });

  it("two simultaneous reservations: exactly one wins", async () => {
    const results = await Promise.allSettled([
      reserveItem(users.x, { groupId, itemId }),
      reserveItem(users.y, { groupId, itemId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(toAppError(rejected.reason).code).toBe("CONFLICT");
    const active = await getDb()
      .select()
      .from(wishlistReservations)
      .where(and(eq(wishlistReservations.itemId, itemId), inArray(wishlistReservations.status, ["active", "purchased"])));
    expect(active).toHaveLength(1);
  });

  it("the owner never sees reservations — not in their own view, the group view or the share link", async () => {
    const own = await getOwnWishlist(wisher, wishlistId);
    expect(JSON.stringify(own, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/reserv/i);
    const inGroup = await getWishlistInGroup(wisher, groupId, wishlistId);
    expect(inGroup.items.every((i) => i.reservation === null)).toBe(true);
    const { token } = await enableShareLink(wisher, wishlistId);
    const shared = await getSharedWishlist(token);
    expect(JSON.stringify(shared, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/reserv/i);
    expect(shared.items[0].price?.amount).toBe(250_000n);
    // A viewer does see it.
    const viewer = await getWishlistInGroup(users.y, groupId, wishlistId);
    expect(viewer.items[0].reservation).not.toBeNull();
  });

  it("a list not shared with a group is invisible to its members", async () => {
    const { wishlistId: privateList } = await createWishlist(wisher, { title: "خصوصی", groupIds: [] });
    await expectCode(getWishlistInGroup(users.x, groupId, privateList), "NOT_FOUND");
    await expectCode(getWishlistInGroup(owner, groupId, privateList), "NOT_FOUND");
  });

  it("refuses internal links", async () => {
    await expectCode(
      addItem(wisher, wishlistId, { kind: "product", title: "x", priority: 2, status: "wanted", acceptsSubstitute: false, productUrl: "http://169.254.169.254/" }),
      "VALIDATION",
    );
  });
});

describe("gift money: pledge ≠ payment ≠ purchase; nothing counted twice; cancel and refunds are traceable", async () => {
  const names = ["sara", "reza", "mina", "nima", "pari", "ghasem"];
  const { owner: ali, groupId, users } = await bigGroup(["celebrant", ...names]);
  const { spaceId } = await createBirthday(ali, {
    groupId,
    celebrantMemberId: users.celebrant.memberId,
    date: "2026-12-01",
    time: null,
    createSurprise: true,
    addChecklist: false,
  });
  const all = [{ ...ali }, ...names.map((n) => users[n])];
  const space = spaceId!;

  it("worked example: pledge → prepayments → purchase 1,330,000 → settle to zero", async () => {
    const { giftId } = await createGift(ali, { spaceId: space, title: "هدفون", budget: "1400000", buyerMemberId: ali.memberId, contributorIds: all.map((u) => u.memberId) });
    for (const u of all) await respondPledge(u, giftId, { decision: "pledge", amount: "200000" });

    // Pledges alone: nothing collected, no balances.
    let v = await getGiftView(ali, giftId);
    expect(v.ledger.pledged).toBe(1_400_000n);
    expect(v.ledger.collectedConfirmed).toBe(0n);
    for (const b of (await getSpaceView(ali, space)).balances.values()) expect(b).toBe(0n);

    const pay = (u: (typeof all)[number], amount: string) =>
      createSettlement(u, { groupId, spaceId: space, giftId, purpose: "collection", fromMemberId: u.memberId, toMemberId: ali.memberId, amount, method: "bank_transfer" }, key());
    const s1 = await pay(users.sara, "200000");
    const s2 = await pay(users.reza, "200000");
    const s3 = await pay(users.mina, "200000");
    const s4 = await pay(users.nima, "200000");
    for (const s of [s1, s2, s3]) await decideSettlement(ali, s.settlementId, "confirm");

    v = await getGiftView(ali, giftId);
    expect(v.ledger.collectedConfirmed).toBe(600_000n);
    expect(v.ledger.collectedPending).toBe(200_000n);

    await recordPurchase(ali, giftId, { total: "1330000", date: today });
    let b = (await getSpaceView(ali, space)).balances;
    expect(b.get(users.sara.memberId)).toBe(10_000n);
    expect(b.get(users.nima.memberId)).toBe(-190_000n);
    expect(b.get(ali.memberId)).toBe(540_000n);

    await decideSettlement(ali, s4.settlementId, "confirm");
    for (const n of ["pari", "ghasem"] as const) {
      const s = await pay(users[n], "190000");
      await decideSettlement(ali, s.settlementId, "confirm");
    }
    for (const n of ["sara", "reza", "mina", "nima"] as const) {
      const r = await createSettlement(ali, { groupId, spaceId: space, giftId, purpose: "refund", fromMemberId: ali.memberId, toMemberId: users[n].memberId, amount: "10000", method: "cash" }, key());
      await decideSettlement(users[n], r.settlementId, "confirm");
    }
    b = (await getSpaceView(ali, space)).balances;
    for (const x of b.values()) expect(x).toBe(0n);
    v = await getGiftView(ali, giftId);
    expect(v.ledger.perMember.every((m) => m.remaining === 0n || m.memberId === ali.memberId)).toBe(true);
  });

  it("a purchase above the accepted caps is refused, not silently charged", async () => {
    const { giftId } = await createGift(ali, { spaceId: space, title: "گران", buyerMemberId: ali.memberId, contributorIds: [ali.memberId, users.sara.memberId] });
    await respondPledge(ali, giftId, { decision: "pledge", amount: "100000" });
    await respondPledge(users.sara, giftId, { decision: "pledge", amount: "100000" });
    await expectCode(recordPurchase(ali, giftId, { total: "300000", date: today }), "VALIDATION");
    // Ali accepts the extra by raising his own cap; a custom split within caps now works.
    await respondPledge(ali, giftId, { decision: "pledge", amount: "200000" });
    await recordPurchase(ali, giftId, {
      total: "300000",
      date: today,
      customShares: [
        { memberId: ali.memberId, amount: "200000" },
        { memberId: users.sara.memberId, amount: "100000" },
      ],
    });
    await expectCode(respondPledge(users.sara, giftId, { decision: "pledge", amount: "50000" }), "VALIDATION");
  });

  it("cancel before purchase: collected money is refunded through tracked refunds", async () => {
    const { giftId } = await createGift(ali, { spaceId: space, title: "لغوشدنی", buyerMemberId: ali.memberId, contributorIds: [users.reza.memberId] });
    await respondPledge(users.reza, giftId, { decision: "pledge", amount: "150000" });
    const s = await createSettlement(users.reza, { groupId, spaceId: space, giftId, purpose: "collection", fromMemberId: users.reza.memberId, toMemberId: ali.memberId, amount: "150000", method: "cash" }, key());
    await decideSettlement(ali, s.settlementId, "confirm");
    await cancelGift(ali, giftId);
    expect((await getSpaceView(ali, space)).balances.get(users.reza.memberId)).toBe(150_000n);
    // Partial then full refund
    const r1 = await createSettlement(ali, { groupId, spaceId: space, giftId, purpose: "refund", fromMemberId: ali.memberId, toMemberId: users.reza.memberId, amount: "50000", method: "cash" }, key());
    await decideSettlement(users.reza, r1.settlementId, "confirm");
    const r2 = await createSettlement(ali, { groupId, spaceId: space, giftId, purpose: "refund", fromMemberId: ali.memberId, toMemberId: users.reza.memberId, amount: "100000", method: "cash" }, key());
    await decideSettlement(users.reza, r2.settlementId, "confirm");
    expect((await getSpaceView(ali, space)).balances.get(users.reza.memberId) ?? 0n).toBe(0n);
    const history = await getDb().select().from(auditLog).where(and(eq(auditLog.spaceId, space), eq(auditLog.entityId, giftId)));
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(["create", "pledge", "cancel"]));
  });

  it("after purchase: partial and full refund of the purchase; cancel only once fully refunded", async () => {
    const { giftId } = await createGift(ali, { spaceId: space, title: "برگشتی", buyerMemberId: ali.memberId, contributorIds: [ali.memberId, users.mina.memberId] });
    await respondPledge(ali, giftId, { decision: "pledge", amount: "100000" });
    await respondPledge(users.mina, giftId, { decision: "pledge", amount: "100000" });
    const { expenseId } = await recordPurchase(ali, giftId, { total: "200000", date: today });
    await expectCode(cancelGift(ali, giftId), "VALIDATION");
    await createRefund(ali, { expenseId, amount: "80000", date: today }, key());
    let v = await getGiftView(ali, giftId);
    expect(v.ledger.purchaseTotal).toBe(120_000n);
    await createRefund(ali, { expenseId, amount: "120000", date: today }, key());
    v = await getGiftView(ali, giftId);
    expect(v.ledger.purchaseTotal).toBe(0n);
    await cancelGift(ali, giftId);
    const rows = await getDb().select().from(expenses).where(eq(expenses.giftId, giftId));
    expect(rows.filter((r) => r.kind === "refund")).toHaveLength(2);
    expect(rows.every((r) => r.spaceId === space)).toBe(true);
  });
});

describe("polls: one ballot per member, change allowed, nothing after the deadline; aggregate privacy", async () => {
  const { owner, groupId, users } = await bigGroup(["p1", "p2", "p3"]);

  it("re-sending a vote does not add one; changing replaces; closed/expired refuse", async () => {
    const { pollId } = await createPoll(owner, {
      groupId,
      eventId: null,
      spaceId: null,
      kind: "datetime",
      question: "کی دور هم باشیم؟",
      multi: true,
      resultsMode: "public",
      deadlineDate: "2099-01-01",
      deadlineTime: null,
      options: [
        { label: "", date: "2026-10-10", time: "18:00" },
        { label: "", date: "2026-10-11", time: "18:00" },
      ],
    });
    const view = await getPollView(owner, pollId);
    const [a, b] = view.options.map((o) => o.id);
    await vote(users.p1, pollId, [a, b]);
    await vote(users.p1, pollId, [a, b]);
    await vote(users.p2, pollId, [a]);
    let rows = await getDb().select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
    expect(rows).toHaveLength(3);
    await vote(users.p1, pollId, [b]);
    rows = await getDb().select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
    expect(rows).toHaveLength(2);

    const r = await getPollView(users.p3, pollId);
    expect(r.respondents).toBe(2);
    expect(r.eligibleCount).toBe(4);
    expect(r.nonRespondents.sort()).toEqual(["Owner", "p3"].sort());

    await getDb().update(polls).set({ deadline: new Date(Date.now() - 1000) }).where(eq(polls.id, pollId));
    await expectCode(vote(users.p3, pollId, [a]), "VALIDATION");
    await getDb().update(polls).set({ deadline: null }).where(eq(polls.id, pollId));
    await closePoll(owner, pollId);
    await expectCode(vote(users.p3, pollId, [a]), "VALIDATION");
    await decidePoll(owner, pollId, b, "جمعه عصر", false);
    expect((await getPollView(owner, pollId)).poll.decidedOptionId).toBe(b);
  });

  it("single choice refuses two options; aggregate mode hides individual answers and small samples", async () => {
    const { pollId } = await createPoll(owner, {
      groupId,
      eventId: null,
      spaceId: null,
      kind: "budget",
      question: "بودجه هر نفر؟",
      multi: false,
      resultsMode: "aggregate",
      deadlineDate: null,
      deadlineTime: null,
      options: [{ label: "تا ۵۰۰ هزار" }, { label: "تا ۱ میلیون" }],
    });
    const [a, b] = (await getPollView(owner, pollId)).options.map((o) => o.id);
    await expectCode(vote(users.p1, pollId, [a, b]), "VALIDATION");
    await vote(users.p1, pollId, [a]);
    await vote(users.p2, pollId, [b]);
    let r = await getPollView(owner, pollId);
    expect(r.results).toBeNull(); // fewer than 3 answers: nothing shown
    await vote(users.p3, pollId, [a]);
    r = await getPollView(owner, pollId);
    expect(r.results!.find((o) => o.optionId === a)!.count).toBe(2);
    expect(r.results!.every((o) => o.voters.length === 0)).toBe(true); // not even the admin sees who
    expect(r.nonRespondents).toEqual([]);
  });

  it("a non-member cannot vote or read", async () => {
    const outsider = await makeUser("Out");
    const [p] = await listPolls(owner, { groupId });
    await expectCode(getPollView(outsider, p.id), "NOT_FOUND");
    await expectCode(vote(outsider, p.id, []), "NOT_FOUND");
  });
});

describe("attendance changes never rewrite recorded expenses", async () => {
  it("RSVP and companions update logistics, the earlier expense keeps its shares", async () => {
    const { owner, groupId, users } = await bigGroup(["r1"]);
    const guest = await addGuestMember(owner, groupId, "مهمان");
    const { eventId } = await createBirthday(owner, { groupId, celebrantMemberId: users.r1.memberId, date: "2026-10-30", time: null, createSurprise: false, addChecklist: false });
    await setRsvp(users.r1, eventId, { status: "going", adultCompanions: 2, childCompanions: 1 });
    const { expenseId } = await createExpense(
      owner,
      {
        ...equalExpense(groupId, 300_000n, owner.memberId, []),
        eventId,
        splitType: "shares",
        shares: [
          { memberId: owner.memberId, value: "100" },
          { memberId: users.r1.memberId, value: "300" }, // r1 + 2 companions attributed to r1
        ],
      },
      key(),
    );
    const before = await getExpenseRecord(owner, expenseId);
    await setRsvp(users.r1, eventId, { status: "going", adultCompanions: 0, childCompanions: 0 });
    await setRsvp(owner, eventId, { status: "maybe", adultCompanions: 0, childCompanions: 0 }, guest.memberId);
    const after = await getExpenseRecord(owner, expenseId);
    expect(after.shares).toEqual(before.shares);
    const plan = await getEventPlan(owner, groupId, eventId);
    expect(plan.headcount.adults).toBe(2); // owner + r1
    expect(plan.headcount.maybe).toBe(1);
  });
});

describe("in-app reminders are created once", async () => {
  it("dedupes poll reminders", async () => {
    const { generateReminders } = await import("@/server/reminders");
    const { owner, groupId, users } = await bigGroup(["rm"]);
    const { pollId } = await createPoll(owner, {
      groupId,
      eventId: null,
      spaceId: null,
      kind: "custom",
      question: "سؤال فوری",
      multi: false,
      resultsMode: "public",
      deadlineDate: null,
      deadlineTime: null,
      options: [{ label: "بله" }, { label: "نه" }],
    });
    await getDb().update(polls).set({ deadline: new Date(Date.now() + 3_600_000) }).where(eq(polls.id, pollId));
    await generateReminders(users.rm);
    await generateReminders(users.rm);
    const rows = await getDb().select().from(notifications).where(and(eq(notifications.userId, users.rm.userId), eq(notifications.type, "reminder_poll")));
    expect(rows).toHaveLength(1);
  });
});
