import { DomainError } from "./errors";
import { GENERAL_SCOPE, type Balances, type ScopeKey } from "./ledger";
import type { Toman } from "./money";

export interface Allocation {
  /** null = the group's general bucket (not tied to an event). */
  eventId: string | null;
  amount: Toman;
}

/**
 * Deterministic default for how a payment from `from` to `to` is spread across events.
 *
 * Events are visited in the given order (oldest first). In each event the allocation is
 * min(what `from` owes there, what `to` is owed there, what is left of the payment).
 * Whatever remains goes to the general bucket.
 *
 * `scoped` should include confirmed AND pending settlements so two pending payments
 * cannot both claim the same event debt.
 */
export function autoAllocate(
  amount: Toman,
  fromMemberId: string,
  toMemberId: string,
  orderedEventIds: string[],
  scoped: Map<ScopeKey, Balances>,
): Allocation[] {
  if (amount <= 0n) throw new DomainError("settlement.non_positive", "مبلغ تسویه باید بیشتر از صفر باشد.");
  let remaining = amount;
  const out: Allocation[] = [];
  for (const eventId of orderedEventIds) {
    if (remaining === 0n) break;
    const b = scoped.get(eventId);
    if (!b) continue;
    const debt = -(b.get(fromMemberId) ?? 0n);
    const credit = b.get(toMemberId) ?? 0n;
    if (debt <= 0n || credit <= 0n) continue;
    let x = debt < credit ? debt : credit;
    if (remaining < x) x = remaining;
    out.push({ eventId, amount: x });
    remaining -= x;
  }
  if (remaining > 0n) out.push({ eventId: null, amount: remaining });
  return out;
}

/** Allocations must be positive, one per scope, and add up exactly to the settlement amount. */
export function validateAllocations(amount: Toman, allocations: Allocation[]): Allocation[] {
  if (allocations.length === 0) {
    throw new DomainError("allocation.empty", "تخصیص تسویه مشخص نشده است.");
  }
  const seen = new Set<string>();
  let s = 0n;
  for (const a of allocations) {
    const key = a.eventId ?? GENERAL_SCOPE;
    if (seen.has(key)) throw new DomainError("allocation.duplicate", "یک رویداد دو بار تخصیص گرفته است.");
    seen.add(key);
    if (a.amount <= 0n) throw new DomainError("allocation.non_positive", "مبلغ هر تخصیص باید بیشتر از صفر باشد.");
    s += a.amount;
  }
  if (s !== amount) {
    throw new DomainError("allocation.sum_mismatch", "جمع تخصیص‌ها باید برابر مبلغ تسویه باشد.");
  }
  return allocations;
}
