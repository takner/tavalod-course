import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { auditLog, groupMembers, notifications } from "@/db/schema";
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
    entityType: "expense" | "settlement" | "event" | "member" | "invite" | "group";
    entityId: string;
    action: string;
    actor: Actor;
    before?: unknown;
    after?: unknown;
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
  | "member_joined";

/** In-app notification for every affected member who has an account, except the actor. */
export async function notifyMembers(
  tx: DbOrTx,
  groupId: string,
  memberIds: Iterable<string>,
  actor: Actor,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return;
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
    userIds.map((userId) => ({ userId, groupId, type, payload: snapshot(payload) as Record<string, unknown> })),
  );
}
