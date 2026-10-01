import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import type { Actor } from "./access";
import { canonicalJson, sha256 } from "./crypto";
import { AppError, invalid } from "./errors";

export type IdempotentOperation = "expense.create" | "refund.create" | "settlement.create";

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export type IdempotencyResult =
  | { replayed: true; resultId: string }
  | { replayed: false; complete: (resultId: string) => Promise<void> };

/**
 * Claims an idempotency key inside the caller's transaction.
 *
 * - First use: returns `replayed: false`; the caller performs the write and calls `complete(id)`.
 * - Same key, same payload: returns the original result id (no second record is created).
 * - Same key, different payload: IDEMPOTENCY_CONFLICT (409).
 *
 * Concurrent first uses are safe: the unique index makes the second insert wait for the first
 * transaction and then see its row.
 */
export async function claimIdempotencyKey(
  tx: DbOrTx,
  actor: Actor,
  groupId: string,
  operation: IdempotentOperation,
  key: string,
  payload: unknown,
): Promise<IdempotencyResult> {
  if (!IDEMPOTENCY_KEY_RE.test(key)) throw invalid("شناسه درخواست معتبر نیست.");
  const requestHash = sha256(canonicalJson({ operation, payload }));

  const inserted = await tx
    .insert(idempotencyKeys)
    .values({ userId: actor.userId, groupId, operation, key, requestHash })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length === 1) {
    const rowId = inserted[0].id;
    return {
      replayed: false,
      complete: async (resultId: string) => {
        await tx.update(idempotencyKeys).set({ resultId }).where(eq(idempotencyKeys.id, rowId));
      },
    };
  }

  const [existing] = await tx
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, actor.userId),
        eq(idempotencyKeys.groupId, groupId),
        eq(idempotencyKeys.operation, operation),
        eq(idempotencyKeys.key, key),
      ),
    )
    .limit(1);
  if (!existing || existing.requestHash !== requestHash || !existing.resultId) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "این درخواست قبلاً با اطلاعات متفاوتی ثبت شده است.",
    );
  }
  return { replayed: true, resultId: existing.resultId };
}
