import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  auditLog,
  events,
  eventTasks,
  gifts,
  groupMembers,
  polls,
  privateSpaceMembers,
  privateSpaces,
  settlements,
  spaceMessages,
  users,
} from "@/db/schema";
import { computeBalances } from "@/domain/ledger";
import { suggestTransfers } from "@/domain/simplify";
import { assertId, isAdmin, requireActiveMembers, requireMember, requireSpaceMember, type Actor } from "./access";
import { notifyMembers, writeAudit } from "./audit";
import { forbidden, invalid, notFound } from "./errors";
import { id } from "./inputs";
import { loadGroupLedger } from "./ledger";

export const spaceInput = z.object({
  eventId: id,
  title: z.string().trim().min(1, "عنوان را وارد کنید.").max(120),
  memberIds: z.array(id).max(100),
});

/**
 * Creates a private (surprise) space for an event. The creator is always a member; the event's
 * celebrant can never be one (checked here and enforced again by a database trigger).
 */
export async function createSpace(actor: Actor, raw: z.input<typeof spaceInput>): Promise<{ spaceId: string }> {
  const input = spaceInput.parse(raw);
  return getDb().transaction(async (tx) => {
    const [ev] = await tx.select().from(events).where(eq(events.id, input.eventId)).limit(1);
    if (!ev) throw notFound("رویداد");
    const me = await requireMember(tx, ev.groupId, actor);
    if (ev.celebrantMemberId === me.id) throw forbidden("صاحب تولد نمی‌تواند فضای سورپرایز خودش را بسازد.");
    const ids = [...new Set([me.id, ...input.memberIds])].filter((m) => m !== ev.celebrantMemberId);
    await requireActiveMembers(tx, ev.groupId, ids);
    const [space] = await tx
      .insert(privateSpaces)
      .values({ groupId: ev.groupId, eventId: ev.id, title: input.title, createdBy: actor.userId })
      .returning();
    await tx.insert(privateSpaceMembers).values(ids.map((memberId) => ({ spaceId: space.id, memberId })));
    await writeAudit(tx, { groupId: ev.groupId, entityType: "space", entityId: space.id, action: "create", actor, after: { ...space, members: ids }, spaceId: space.id });
    await notifyMembers(tx, ev.groupId, ids, actor, "space_added", { spaceId: space.id, title: space.title, eventId: ev.id }, { spaceId: space.id });
    return { spaceId: space.id };
  });
}

export async function addSpaceMembers(actor: Actor, spaceId: string, memberIds: string[]): Promise<void> {
  memberIds.forEach((m) => assertId(m, "عضو"));
  await getDb().transaction(async (tx) => {
    const { space, celebrantMemberId } = await requireSpaceMember(tx, spaceId, actor);
    if (celebrantMemberId && memberIds.includes(celebrantMemberId)) throw invalid("صاحب تولد را نمی‌توان به فضای سورپرایز اضافه کرد.");
    await requireActiveMembers(tx, space.groupId, memberIds);
    if (!memberIds.length) return;
    await tx.insert(privateSpaceMembers).values(memberIds.map((memberId) => ({ spaceId, memberId }))).onConflictDoNothing();
    await writeAudit(tx, { groupId: space.groupId, entityType: "space", entityId: spaceId, action: "add_members", actor, after: memberIds, spaceId });
    await notifyMembers(tx, space.groupId, memberIds, actor, "space_added", { spaceId, title: space.title, eventId: space.eventId }, { spaceId });
  });
}

export async function postSpaceMessage(actor: Actor, spaceId: string, rawBody: string): Promise<void> {
  const body = z.string().trim().min(1, "پیام خالی است.").max(1000).parse(rawBody);
  await getDb().transaction(async (tx) => {
    const { member } = await requireSpaceMember(tx, spaceId, actor);
    await tx.insert(spaceMessages).values({ spaceId, memberId: member.id, body });
  });
}

/** Spaces of an event that the actor belongs to. Others (incl. the celebrant) get an empty list. */
export async function mySpacesForEvent(actor: Actor, eventId: string) {
  return getDb()
    .select({ id: privateSpaces.id, title: privateSpaces.title })
    .from(privateSpaces)
    .innerJoin(privateSpaceMembers, eq(privateSpaceMembers.spaceId, privateSpaces.id))
    .innerJoin(groupMembers, eq(groupMembers.id, privateSpaceMembers.memberId))
    .innerJoin(events, eq(events.id, privateSpaces.eventId))
    .where(and(eq(privateSpaces.eventId, eventId), eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)));
}

/** Everything inside a space — only ever loaded after requireSpaceMember succeeds. */
export async function getSpaceView(actor: Actor, spaceId: string) {
  const db = getDb();
  const { space, member, celebrantMemberId } = await requireSpaceMember(db, spaceId, actor);
  const me = await requireMember(db, space.groupId, actor);
  const [ev] = await db.select({ id: events.id, title: events.title, startsAt: events.startsAt, startDate: events.startDate }).from(events).where(eq(events.id, space.eventId));
  const [memberRows, giftRows, messages, ledger, pendingRows, taskRows, pollRows, history] = await Promise.all([
    db
      .select({ id: groupMembers.id, name: groupMembers.displayName, userId: groupMembers.userId })
      .from(privateSpaceMembers)
      .innerJoin(groupMembers, eq(groupMembers.id, privateSpaceMembers.memberId))
      .where(eq(privateSpaceMembers.spaceId, spaceId)),
    db.select().from(gifts).where(eq(gifts.spaceId, spaceId)).orderBy(desc(gifts.createdAt)),
    db
      .select({ id: spaceMessages.id, body: spaceMessages.body, memberId: spaceMessages.memberId, createdAt: spaceMessages.createdAt })
      .from(spaceMessages)
      .where(eq(spaceMessages.spaceId, spaceId))
      .orderBy(desc(spaceMessages.createdAt))
      .limit(100),
    loadGroupLedger(db, space.groupId, { kind: "space", spaceId }),
    db.select().from(settlements).where(and(eq(settlements.spaceId, spaceId), eq(settlements.status, "pending"))).orderBy(desc(settlements.createdAt)),
    db.select().from(eventTasks).where(eq(eventTasks.spaceId, spaceId)).orderBy(asc(eventTasks.done), asc(eventTasks.createdAt)),
    db.select().from(polls).where(eq(polls.spaceId, spaceId)).orderBy(desc(polls.createdAt)),
    db
      .select({ log: auditLog, actorName: users.name })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId))
      .where(eq(auditLog.spaceId, spaceId))
      .orderBy(desc(auditLog.at))
      .limit(40),
  ]);
  const allGroupMembers = await db
    .select({ id: groupMembers.id, name: groupMembers.displayName, leftAt: groupMembers.leftAt })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, space.groupId));
  const inSpace = new Set(memberRows.map((m) => m.id));
  const balances = computeBalances(ledger.expenses, ledger.settlements);
  const receivers = new Map(memberRows.map((m) => [m.id, m]));
  return {
    space,
    event: ev,
    me: { memberId: member.id, isAdmin: isAdmin(me) },
    members: memberRows,
    // Candidates to add: active group members not yet inside, never the celebrant.
    candidates: allGroupMembers.filter((m) => !m.leftAt && !inSpace.has(m.id) && m.id !== celebrantMemberId),
    gifts: giftRows,
    messages: messages.reverse(),
    balances,
    suggestions: suggestTransfers(balances),
    pending: pendingRows.map((p) => {
      const receiver = receivers.get(p.toMemberId);
      return { ...p, canDecide: receiver?.userId ? receiver.userId === actor.userId : isAdmin(me) };
    }),
    tasks: taskRows,
    polls: pollRows,
    history,
  };
}

/** Group-level helper: the set of space ids a user can see in a group (for filtering lists). */
export async function visibleSpaceIds(actor: Actor, groupId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: privateSpaces.id })
    .from(privateSpaces)
    .innerJoin(privateSpaceMembers, eq(privateSpaceMembers.spaceId, privateSpaces.id))
    .innerJoin(groupMembers, eq(groupMembers.id, privateSpaceMembers.memberId))
    .where(and(eq(privateSpaces.groupId, groupId), eq(groupMembers.userId, actor.userId)));
  return new Set(rows.map((r) => r.id));
}

export async function spaceTitles(spaceIds: string[]): Promise<Map<string, string>> {
  if (!spaceIds.length) return new Map();
  const rows = await getDb().select({ id: privateSpaces.id, title: privateSpaces.title }).from(privateSpaces).where(inArray(privateSpaces.id, spaceIds));
  return new Map(rows.map((r) => [r.id, r.title]));
}
