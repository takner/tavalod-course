import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { events, groupMembers, privateSpaceMembers, privateSpaces } from "@/db/schema";
import { forbidden, notFound } from "./errors";

export interface Actor {
  userId: string;
}

export type MemberRow = typeof groupMembers.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs are untrusted: anything that is not a UUID simply does not exist. */
export function assertId(id: string, what = "مورد درخواستی"): void {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw notFound(what);
}

/**
 * The actor's active membership in a group. Non-members get NOT_FOUND (not FORBIDDEN) so the
 * existence of other groups is never revealed.
 */
export async function requireMember(db: DbOrTx, groupId: string, actor: Actor): Promise<MemberRow> {
  assertId(groupId, "گروه");
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)))
    .limit(1);
  if (!m) throw notFound("گروه");
  return m;
}

export function isAdmin(m: MemberRow): boolean {
  return m.role === "owner" || m.role === "admin";
}

export async function requireAdmin(db: DbOrTx, groupId: string, actor: Actor): Promise<MemberRow> {
  const m = await requireMember(db, groupId, actor);
  if (!isAdmin(m)) throw forbidden("فقط مدیر گروه می‌تواند این کار را انجام دهد.");
  return m;
}

/** Loads the given member ids, requiring each to be an active member of the group. */
export async function requireActiveMembers(
  db: DbOrTx,
  groupId: string,
  memberIds: string[],
): Promise<Map<string, MemberRow>> {
  const unique = [...new Set(memberIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.id, unique)));
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of unique) {
    const m = map.get(id);
    if (!m || m.leftAt) throw forbidden("یکی از افراد انتخاب‌شده عضو فعال این گروه نیست.");
  }
  return map;
}

/**
 * Serialises money writes per group. Every service that changes balances takes this lock first,
 * so balance-dependent checks (allocation, closing events, refund caps) never race.
 */
export async function lockGroup(tx: DbOrTx, groupId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"group:" + groupId}, 0))`);
}

export interface SpaceAccess {
  space: typeof privateSpaces.$inferSelect;
  member: MemberRow;
  celebrantMemberId: string | null;
}

/**
 * Access to a private (surprise) space. Anyone who is not an active member of the space —
 * including the celebrant, other group members and outsiders — gets NOT_FOUND, so even the
 * existence of the space is not revealed.
 */
export async function requireSpaceMember(db: DbOrTx, spaceId: string, actor: Actor): Promise<SpaceAccess> {
  assertId(spaceId, "صفحه");
  const [row] = await db
    .select({ space: privateSpaces, member: groupMembers, celebrantMemberId: events.celebrantMemberId })
    .from(privateSpaces)
    .innerJoin(events, eq(events.id, privateSpaces.eventId))
    .innerJoin(privateSpaceMembers, eq(privateSpaceMembers.spaceId, privateSpaces.id))
    .innerJoin(groupMembers, eq(groupMembers.id, privateSpaceMembers.memberId))
    .where(and(eq(privateSpaces.id, spaceId), eq(groupMembers.userId, actor.userId), isNull(groupMembers.leftAt)))
    .limit(1);
  if (!row || row.member.id === row.celebrantMemberId) throw notFound("صفحه");
  return row;
}

/** Ensures every member id belongs to the space (used for money inside a space). */
export async function requireSpaceMembers(db: DbOrTx, spaceId: string, memberIds: string[]): Promise<void> {
  const unique = [...new Set(memberIds)];
  if (!unique.length) return;
  const rows = await db
    .select({ memberId: privateSpaceMembers.memberId })
    .from(privateSpaceMembers)
    .where(and(eq(privateSpaceMembers.spaceId, spaceId), inArray(privateSpaceMembers.memberId, unique)));
  if (rows.length !== unique.length) throw forbidden("یکی از افراد انتخاب‌شده عضو این فضای خصوصی نیست.");
}
