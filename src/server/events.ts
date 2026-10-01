import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { eventParticipants, events, settlementAllocations, settlements } from "@/db/schema";
import { computeScopedBalances, isScopeSettled } from "@/domain/ledger";
import { isAdmin, lockGroup, requireActiveMembers, requireMember, type Actor } from "./access";
import { writeAudit } from "./audit";
import { forbidden, invalid, notFound } from "./errors";
import { eventInput } from "./inputs";
import { loadGroupLedger } from "./ledger";

export async function createEvent(actor: Actor, raw: unknown): Promise<{ eventId: string }> {
  const input = eventInput.parse(raw);
  return getDb().transaction(async (tx) => {
    await requireMember(tx, input.groupId, actor);
    await requireActiveMembers(tx, input.groupId, input.participantMemberIds);
    const [ev] = await tx
      .insert(events)
      .values({
        groupId: input.groupId,
        title: input.title,
        type: input.type,
        status: "active",
        startDate: input.startDate,
        endDate: input.endDate,
        createdBy: actor.userId,
      })
      .returning();
    if (input.participantMemberIds.length) {
      await tx
        .insert(eventParticipants)
        .values([...new Set(input.participantMemberIds)].map((memberId) => ({ eventId: ev.id, memberId, status: "going" as const })));
    }
    await writeAudit(tx, { groupId: input.groupId, entityType: "event", entityId: ev.id, action: "create", actor, after: { ...ev, participants: input.participantMemberIds } });
    return { eventId: ev.id };
  });
}

/** Being invited to / participating in an event never creates a debt — only expenses do. */
export async function setParticipants(actor: Actor, eventId: string, memberIds: string[]): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!ev) throw notFound("رویداد");
    await requireMember(tx, ev.groupId, actor);
    await requireActiveMembers(tx, ev.groupId, memberIds);
    const before = await tx.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId));
    await tx.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId));
    if (memberIds.length) {
      await tx
        .insert(eventParticipants)
        .values([...new Set(memberIds)].map((memberId) => ({ eventId, memberId, status: "going" as const })));
    }
    await writeAudit(tx, { groupId: ev.groupId, entityType: "event", entityId: eventId, action: "participants", actor, before, after: memberIds });
  });
}

/**
 * Status changes:
 * - close:  only when every member's balance inside the event is zero and no pending settlement
 *           is allocated to it (otherwise confirming it later would unbalance a closed event).
 * - reopen: closed/cancelled → active.
 * - cancel: keeps every recorded expense; money comes back through refunds.
 */
export async function changeEventStatus(actor: Actor, eventId: string, action: "close" | "reopen" | "cancel"): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [peek] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!peek) throw notFound("رویداد");
    const me = await requireMember(tx, peek.groupId, actor);
    if (peek.createdBy !== actor.userId && !isAdmin(me)) throw forbidden("فقط سازنده رویداد یا مدیر گروه می‌تواند وضعیت آن را تغییر دهد.");
    await lockGroup(tx, peek.groupId);
    const [ev] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");

    let status: typeof ev.status;
    if (action === "close") {
      if (ev.status === "closed") return;
      const ledger = await loadGroupLedger(tx, ev.groupId);
      const scoped = computeScopedBalances(ledger.expenses, ledger.settlements);
      if (!isScopeSettled(scoped.get(ev.id))) throw invalid("هنوز همه حساب‌های این رویداد تسویه نشده است.");
      const pending = await tx
        .select({ id: settlements.id })
        .from(settlementAllocations)
        .innerJoin(settlements, eq(settlements.id, settlementAllocations.settlementId))
        .where(and(eq(settlementAllocations.eventId, ev.id), inArray(settlements.status, ["pending"])))
        .limit(1);
      if (pending.length) throw invalid("تسویه‌ای در انتظار تأیید برای این رویداد وجود دارد.");
      status = "closed";
    } else if (action === "reopen") {
      if (ev.status === "active" || ev.status === "planned") return;
      status = "active";
    } else {
      if (ev.status === "closed") throw invalid("رویداد بسته‌شده را نمی‌توان لغو کرد.");
      status = "cancelled";
    }
    await tx.update(events).set({ status }).where(eq(events.id, eventId));
    await writeAudit(tx, { groupId: ev.groupId, entityType: "event", entityId: eventId, action, actor, before: ev, after: { ...ev, status } });
  });
}
