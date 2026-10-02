import { DomainError } from "./errors";
import type { LedgerExpense, LedgerSettlement } from "./ledger";
import type { Toman } from "./money";
import { distributeByWeights, type MemberAmount } from "./split";

export const GIFT_STATUSES = ["proposed", "collecting", "ready_to_buy", "purchased", "delivered", "cancelled"] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

/** Allowed status moves. Purchase and cancel have their own dedicated flows. */
const TRANSITIONS: Record<GiftStatus, GiftStatus[]> = {
  proposed: ["collecting", "ready_to_buy", "cancelled"],
  collecting: ["ready_to_buy", "proposed", "cancelled"],
  ready_to_buy: ["collecting", "cancelled"],
  purchased: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function assertGiftTransition(from: GiftStatus, to: GiftStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError("gift.bad_transition", "تغییر وضعیت هدیه به این حالت مجاز نیست.");
  }
}

/** Equal suggestion shown to invited contributors (amounts differ by at most 1 Toman). */
export function suggestEqualShares(budget: Toman, memberIds: string[]): MemberAmount[] {
  if (memberIds.length === 0) return [];
  return distributeByWeights(budget, memberIds.map((memberId) => ({ memberId, weight: 1n })));
}

export interface Pledge {
  memberId: string;
  /** The most this person agreed to pay — their cap. */
  amount: Toman;
}

export class OverCapError extends DomainError {
  readonly overCap: { memberId: string; share: Toman; cap: Toman }[];
  constructor(overCap: { memberId: string; share: Toman; cap: Toman }[]) {
    super("gift.over_cap", "سهم بعضی از مشارکت‌کنندگان از سقف تعهدشان بیشتر می‌شود.");
    this.overCap = overCap;
  }
}

/**
 * Final shares of a purchase among the pledged contributors. A share above a person's pledge
 * (their accepted cap) is never imposed: it throws OverCapError so that either they raise their
 * pledge or someone else accepts more (custom split).
 */
export function finalGiftShares(total: Toman, pledges: Pledge[], custom?: MemberAmount[]): MemberAmount[] {
  if (pledges.length === 0) throw new DomainError("gift.no_pledges", "هنوز کسی برای این هدیه تعهد مشارکت نداده است.");
  if (total <= 0n) throw new DomainError("gift.total", "مبلغ خرید باید بیشتر از صفر باشد.");
  const cap = new Map(pledges.map((p) => [p.memberId, p.amount]));
  let shares: MemberAmount[];
  if (custom) {
    let sum = 0n;
    for (const s of custom) {
      if (!cap.has(s.memberId)) throw new DomainError("gift.not_contributor", "سهم فقط برای مشارکت‌کنندگان قابل تعیین است.");
      if (s.amount < 0n) throw new DomainError("gift.negative", "سهم نمی‌تواند منفی باشد.");
      sum += s.amount;
    }
    if (sum !== total) throw new DomainError("gift.sum", "جمع سهم‌ها باید برابر مبلغ خرید باشد.");
    shares = custom.filter((s) => s.amount > 0n);
  } else {
    shares = distributeByWeights(total, pledges.map((p) => ({ memberId: p.memberId, weight: 1n })));
  }
  const over = shares
    .filter((s) => s.amount > (cap.get(s.memberId) ?? 0n))
    .map((s) => ({ memberId: s.memberId, share: s.amount, cap: cap.get(s.memberId) ?? 0n }));
  if (over.length) throw new OverCapError(over);
  return shares;
}

export interface GiftLedgerView {
  pledged: Toman;
  /** Confirmed money currently held for the gift by its holder(s), before it is spent. */
  collectedConfirmed: Toman;
  collectedPending: Toman;
  refundedConfirmed: Toman;
  purchaseTotal: Toman;
  perMember: {
    memberId: string;
    pledge: Toman | null;
    paid: Toman; // confirmed collections − confirmed refunds received (+ reallocations in − out)
    pending: Toman;
    share: Toman; // final share of the purchase (after purchase refunds)
    /** share − paid: > 0 still owes for this gift, < 0 is owed back. */
    remaining: Toman;
  }[];
}

/**
 * Per-gift money view for the private space. It reads the same ledger rows that drive balances,
 * so a transfer and a purchase are each counted exactly once; pledges are informational only.
 */
export function giftLedgerView(
  giftId: string,
  pledges: Pledge[],
  expenses: (LedgerExpense & { giftId: string | null })[],
  settlements: (LedgerSettlement & { giftId: string | null; purpose: "settle" | "collection" | "refund" })[],
  reallocations: { memberId: string; fromGiftId: string; toGiftId: string; amount: Toman }[] = [],
): GiftLedgerView {
  const rows = new Map<string, { pledge: Toman | null; paid: Toman; pending: Toman; share: Toman }>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { pledge: null, paid: 0n, pending: 0n, share: 0n };
      rows.set(id, r);
    }
    return r;
  };
  for (const p of pledges) row(p.memberId).pledge = p.amount;

  let collectedConfirmed = 0n;
  let collectedPending = 0n;
  let refundedConfirmed = 0n;
  for (const s of settlements) {
    if (s.giftId !== giftId || s.status === "rejected") continue;
    if (s.purpose === "collection") {
      if (s.status === "confirmed") {
        row(s.fromMemberId).paid += s.amount;
        collectedConfirmed += s.amount;
      } else {
        row(s.fromMemberId).pending += s.amount;
        collectedPending += s.amount;
      }
    } else if (s.purpose === "refund" && s.status === "confirmed") {
      row(s.toMemberId).paid -= s.amount;
      refundedConfirmed += s.amount;
    }
  }
  for (const r of reallocations) {
    if (r.fromGiftId === giftId) row(r.memberId).paid -= r.amount;
    if (r.toGiftId === giftId) row(r.memberId).paid += r.amount;
  }

  let purchaseTotal = 0n;
  for (const e of expenses) {
    if (e.giftId !== giftId || e.deleted) continue;
    const sign = e.kind === "refund" ? -1n : 1n;
    purchaseTotal += sign * e.totalAmount;
    for (const s of e.shares) row(s.memberId).share += sign * s.amount;
  }

  const pledged = pledges.reduce((a, p) => a + p.amount, 0n);
  return {
    pledged,
    collectedConfirmed,
    collectedPending,
    refundedConfirmed,
    purchaseTotal,
    perMember: [...rows.entries()]
      .map(([memberId, r]) => ({ memberId, ...r, remaining: r.share - r.paid }))
      .sort((a, b) => (a.memberId < b.memberId ? -1 : 1)),
  };
}
