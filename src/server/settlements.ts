import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { events, settlementAllocations, settlements } from "@/db/schema";
import { autoAllocate, validateAllocations, type Allocation } from "@/domain/allocate";
import { computeScopedBalances } from "@/domain/ledger";
import { assertId, isAdmin, lockGroup, requireActiveMembers, requireMember, type Actor, type MemberRow } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { forbidden, invalid, notFound } from "./errors";
import { claimIdempotencyKey } from "./idempotency";
import { settlementInput } from "./inputs";
import { loadGroupLedger } from "./ledger";

/**
 * Who has to confirm a settlement: the receiver. If the receiver is a guest without an account,
 * a group admin confirms on their behalf.
 */
function canDecide(actorMember: MemberRow, receiver: MemberRow): boolean {
  if (receiver.userId) return receiver.userId === actorMember.userId;
  return isAdmin(actorMember);
}

export async function createSettlement(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
): Promise<{ settlementId: string; status: "pending" | "confirmed"; replayed: boolean }> {
  const input = settlementInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const me = await requireMember(tx, input.groupId, actor);
    await lockGroup(tx, input.groupId);
    const idem = await claimIdempotencyKey(tx, actor, input.groupId, "settlement.create", idempotencyKey, raw);
    if (idem.replayed) {
      const [s] = await tx.select({ status: settlements.status }).from(settlements).where(eq(settlements.id, idem.resultId));
      return { settlementId: idem.resultId, status: s.status === "confirmed" ? "confirmed" : "pending", replayed: true };
    }

    const parties = await requireActiveMembers(tx, input.groupId, [input.fromMemberId, input.toMemberId]);
    const from = parties.get(input.fromMemberId)!;
    const to = parties.get(input.toMemberId)!;
    const isParty = from.id === me.id || to.id === me.id;
    if (!isParty && !isAdmin(me)) {
      throw forbidden("فقط پرداخت‌کننده، دریافت‌کننده یا مدیر گروه می‌تواند تسویه ثبت کند.");
    }
    // The receiver (or an admin for a guest receiver) recording it is itself the confirmation.
    const status = canDecide(me, to) ? "confirmed" : "pending";

    const ledger = await loadGroupLedger(tx, input.groupId);
    let allocations: Allocation[];
    if (input.allocations) {
      allocations = validateAllocations(input.amount, input.allocations);
      const eventIds = allocations.map((a) => a.eventId).filter((x): x is string => x !== null);
      if (eventIds.length) {
        const found = await tx
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.groupId, input.groupId), inArray(events.id, eventIds)));
        if (found.length !== new Set(eventIds).size) throw invalid("رویداد انتخاب‌شده برای تخصیص معتبر نیست.");
      }
    } else {
      const scoped = computeScopedBalances(ledger.expenses, ledger.settlements, {
        settlementStatuses: ["confirmed", "pending"],
      });
      allocations = autoAllocate(input.amount, from.id, to.id, ledger.orderedEventIds, scoped);
    }

    const [row] = await tx
      .insert(settlements)
      .values({
        groupId: input.groupId,
        fromMemberId: from.id,
        toMemberId: to.id,
        amount: input.amount,
        method: input.method,
        note: input.note || null,
        status,
        createdBy: actor.userId,
        decidedBy: status === "confirmed" ? actor.userId : null,
        decidedAt: status === "confirmed" ? new Date() : null,
      })
      .returning();
    await tx
      .insert(settlementAllocations)
      .values(allocations.map((a) => ({ settlementId: row.id, eventId: a.eventId, amount: a.amount })));

    await writeAudit(tx, {
      groupId: input.groupId,
      entityType: "settlement",
      entityId: row.id,
      action: "create",
      actor,
      after: { ...row, allocations },
    });
    const payload = { settlementId: row.id, amount: input.amount, fromMemberId: from.id, toMemberId: to.id };
    if (status === "pending") {
      await notifyMembers(tx, input.groupId, [to.id], actor, "settlement_pending", payload);
    } else {
      await notifyMembers(tx, input.groupId, [from.id], actor, "settlement_confirmed", payload);
    }
    await idem.complete(row.id);
    return { settlementId: row.id, status, replayed: false };
  });
}

/** Receiver (or admin for a guest receiver) confirms or rejects a pending settlement. */
export async function decideSettlement(
  actor: Actor,
  settlementId: string,
  decision: "confirm" | "reject",
): Promise<void> {
  assertId(settlementId, "تسویه");
  await getDb().transaction(async (tx) => {
    const [peek] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).limit(1);
    if (!peek) throw notFound("تسویه");
    const me = await requireMember(tx, peek.groupId, actor);
    await lockGroup(tx, peek.groupId);
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for("update");
    if (s.status !== "pending") throw invalid("وضعیت این تسویه قبلاً مشخص شده است.");
    const parties = await requireActiveMembers(tx, s.groupId, [s.toMemberId]);
    if (!canDecide(me, parties.get(s.toMemberId)!)) {
      throw forbidden("فقط دریافت‌کننده می‌تواند این تسویه را تأیید یا رد کند.");
    }
    const status = decision === "confirm" ? "confirmed" : "rejected";
    const [after] = await tx
      .update(settlements)
      .set({ status, decidedBy: actor.userId, decidedAt: new Date() })
      .where(eq(settlements.id, settlementId))
      .returning();
    await writeAudit(tx, { groupId: s.groupId, entityType: "settlement", entityId: s.id, action: decision, actor, before: s, after });
    await notifyMembers(
      tx,
      s.groupId,
      [s.fromMemberId],
      actor,
      decision === "confirm" ? "settlement_confirmed" : "settlement_rejected",
      { settlementId: s.id, amount: s.amount, fromMemberId: s.fromMemberId, toMemberId: s.toMemberId },
    );
  });
}

/** Preview of the default allocation shown in the form before submitting. */
export async function previewAllocation(
  actor: Actor,
  groupId: string,
  fromMemberId: string,
  toMemberId: string,
  amount: bigint,
): Promise<Allocation[]> {
  assertId(fromMemberId, "عضو");
  assertId(toMemberId, "عضو");
  const db = getDb();
  await requireMember(db, groupId, actor);
  const ledger = await loadGroupLedger(db, groupId);
  const scoped = computeScopedBalances(ledger.expenses, ledger.settlements, { settlementStatuses: ["confirmed", "pending"] });
  return autoAllocate(amount, fromMemberId, toMemberId, ledger.orderedEventIds, scoped);
}
