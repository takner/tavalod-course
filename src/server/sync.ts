import { z } from "zod";
import type { Actor } from "./access";
import { toAppError } from "./errors";
import { createExpense } from "./expenses";
import { IDEMPOTENCY_KEY_RE } from "./idempotency";
import { createSettlement } from "./settlements";

/**
 * Operations that may be created while offline and replayed later. Each carries a client-generated
 * key; the server re-checks membership and permissions at replay time and applies idempotency, so
 * a retry after a lost response never creates a second record.
 */
export const syncOp = z.discriminatedUnion("type", [
  z.object({ type: z.literal("expense.create"), clientKey: z.string().regex(IDEMPOTENCY_KEY_RE), payload: z.unknown() }),
  z.object({ type: z.literal("settlement.create"), clientKey: z.string().regex(IDEMPOTENCY_KEY_RE), payload: z.unknown() }),
]);
export const syncRequest = z.object({ ops: z.array(syncOp).min(1).max(50) });
export type SyncOp = z.infer<typeof syncOp>;

export type SyncResult =
  | { clientKey: string; ok: true; id: string; replayed: boolean; status?: string }
  | { clientKey: string; ok: false; retryable: boolean; error: { code: string; message: string } };

export async function processSyncOps(actor: Actor, ops: SyncOp[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const op of ops) {
    try {
      if (op.type === "expense.create") {
        const r = await createExpense(actor, op.payload, op.clientKey);
        results.push({ clientKey: op.clientKey, ok: true, id: r.expenseId, replayed: r.replayed });
      } else {
        const r = await createSettlement(actor, op.payload, op.clientKey);
        results.push({ clientKey: op.clientKey, ok: true, id: r.settlementId, replayed: r.replayed, status: r.status });
      }
    } catch (err) {
      const e = toAppError(err);
      if (e.code === "INTERNAL") console.error("sync op failed:", err);
      // Validation / permission / conflict failures will fail the same way on retry.
      const retryable = e.code === "RATE_LIMITED" || e.code === "INTERNAL";
      results.push({ clientKey: op.clientKey, ok: false, retryable, error: { code: e.code, message: e.message } });
    }
  }
  return results;
}
