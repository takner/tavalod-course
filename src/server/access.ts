import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { groupMembers } from "@/db/schema";
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
