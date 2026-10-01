import { DomainError } from "./errors";
import type { Toman } from "./money";
import { distributeByWeights, type MemberAmount } from "./split";

/** How much of an expense can still be refunded, given the refunds already recorded against it. */
export function refundableRemaining(originalTotal: Toman, previousRefunds: Toman[]): Toman {
  const used = previousRefunds.reduce((a, b) => a + b, 0n);
  return originalTotal - used;
}

export function assertRefundAmount(amount: Toman, remaining: Toman): void {
  if (amount <= 0n) throw new DomainError("refund.non_positive", "مبلغ برگشتی باید بیشتر از صفر باشد.");
  if (amount > remaining) {
    throw new DomainError(
      "refund.exceeds_remaining",
      "مبلغ برگشتی از باقیمانده قابل برگشت این هزینه بیشتر است.",
    );
  }
}

/**
 * Default refund split: proportional to the original expense — receivers in proportion to what
 * each originally paid, beneficiaries in proportion to their original shares. Users may edit it.
 */
export function defaultRefundSplit(
  amount: Toman,
  original: { payers: MemberAmount[]; shares: MemberAmount[] },
): { receivers: MemberAmount[]; shares: MemberAmount[] } {
  const positive = (xs: MemberAmount[]) => xs.filter((x) => x.amount > 0n);
  return {
    receivers: distributeByWeights(
      amount,
      positive(original.payers).map((p) => ({ memberId: p.memberId, weight: p.amount })),
    ).filter((x) => x.amount > 0n),
    shares: distributeByWeights(
      amount,
      positive(original.shares).map((s) => ({ memberId: s.memberId, weight: s.amount })),
    ).filter((x) => x.amount > 0n),
  };
}
