import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { auditLog, groupMembers, notifications, privateSpaceMembers } from "@/db/schema";
import { bigintReplacer } from "@/domain/money";
import type { Actor } from "./access";

/** JSON-safe snapshot: bigint → string, Date → ISO string. */
export function snapshot<T>(value: T): unknown {
  return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value, bigintReplacer));
}

export async function writeAudit(
  tx: DbOrTx,
  entry: {
    groupId: string;
    entityType:
      | "expense"
      | "settlement"
      | "event"
      | "member"
      | "invite"
      | "group"
      | "space"
      | "gift"
      | "poll"
      | "task";
    entityId: string;
    action: string;
    actor: Actor;
    before?: unknown;
    after?: unknown;
    /** Private-space entries are only ever shown inside that space. */
    spaceId?: string | null;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    groupId: entry.groupId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actor.userId,
    before: snapshot(entry.before ?? null),
    after: snapshot(entry.after ?? null),
    spaceId: entry.spaceId ?? null,
  });
}

export type NotificationType =
  | "expense_created"
  | "expense_updated"
  | "expense_deleted"
  | "refund_created"
  | "settlement_pending"
  | "settlement_confirmed"
  | "settlement_rejected"
  | "member_joined"
  | "event_invited"
  | "poll_created"
  | "poll_decided"
  | "space_added"
  | "gift_created"
  | "gift_status"
  | "task_assigned"
  | "reminder_poll"
  | "reminder_rsvp"
  | "reminder_pledge";

/**
 * In-app notification for every affected member who has an account, except the actor.
 * With `spaceId`, recipients are additionally restricted to members of that private space, so a
 * surprise notification can never reach the celebrant even if a caller passes the wrong ids.
 */
export async function notifyMembers(
  tx: DbOrTx,
  groupId: string,
  memberIds: Iterable<string>,
  actor: Actor,
  type: NotificationType,
  payload: Record<string, unknown>,
  opts: { spaceId?: string | null } = {},
): Promise<void> {
  let ids = [...new Set(memberIds)];
  if (ids.length === 0) return;
  if (opts.spaceId) {
    const inSpace = await tx
      .select({ memberId: privateSpaceMembers.memberId })
      .from(privateSpaceMembers)
      .where(and(eq(privateSpaceMembers.spaceId, opts.spaceId), inArray(privateSpaceMembers.memberId, ids)));
    const allowed = new Set(inSpace.map((r) => r.memberId));
    ids = ids.filter((id) => allowed.has(id));
    if (ids.length === 0) return;
  }
  const rows = await tx
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        inArray(groupMembers.id, ids),
        isNotNull(groupMembers.userId),
        ne(groupMembers.userId, actor.userId),
      ),
    );
  const userIds = [...new Set(rows.map((r) => r.userId!))];
  if (userIds.length === 0) return;
  await tx.insert(notifications).values(
    userIds.map((userId) => ({
      userId,
      groupId,
      type,
      payload: snapshot(payload) as Record<string, unknown>,
      spaceId: opts.spaceId ?? null,
    })),
  );
}
