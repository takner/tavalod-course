import { DomainError } from "./errors";
import { toAsciiDigits, toPersianDigits, type Toman } from "./money";

/**
 * How an expense total is divided among the members it applies to.
 *
 * - equal:   everyone listed pays the same (remainder spread deterministically)
 * - exact:   each value is a Toman amount; values must add up to the total
 * - percent: each value is basis points (1% = 100 bp); values must add up to 10000
 * - shares:  each value is a weight × 100 (1.5 nights = 150); split proportionally
 */
export const SPLIT_TYPES = ["equal", "exact", "percent", "shares"] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

export const PERCENT_SCALE = 10_000n; // 100.00%
export const WEIGHT_SCALE = 100n; // two decimal places

export interface SplitInput {
  memberId: string;
  /** Ignored for `equal`. Toman for `exact`, basis points for `percent`, weight×100 for `shares`. */
  value: bigint;
}

export interface MemberAmount {
  memberId: string;
  amount: Toman;
}

function byMemberId<T extends { memberId: string }>(a: T, b: T): number {
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}

function assertUniqueMembers(items: { memberId: string }[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.memberId)) {
      throw new DomainError("split.duplicate_member", "یک نفر دو بار در فهرست آمده است.");
    }
    seen.add(item.memberId);
  }
}

/**
 * Splits `total` proportionally to integer `weights` using the largest-remainder method.
 * Ties on the remainder are broken by memberId order, so the result is fully deterministic
 * and the parts always add up to exactly `total`.
 */
export function distributeByWeights(
  total: Toman,
  weights: { memberId: string; weight: bigint }[],
): MemberAmount[] {
  if (total < 0n) throw new DomainError("split.negative_total", "مبلغ کل نمی‌تواند منفی باشد.");
  const items = [...weights].sort(byMemberId);
  assertUniqueMembers(items);
  for (const w of items) {
    if (w.weight < 0n) throw new DomainError("split.negative_weight", "سهم نمی‌تواند منفی باشد.");
  }
  const weightSum = items.reduce((acc, w) => acc + w.weight, 0n);
  if (weightSum <= 0n) {
    throw new DomainError("split.no_participants", "حداقل یک نفر باید سهم داشته باشد.");
  }

  const parts = items.map((w, index) => {
    const product = total * w.weight;
    return { memberId: w.memberId, index, base: product / weightSum, rem: product % weightSum };
  });
  let leftover = total - parts.reduce((acc, p) => acc + p.base, 0n);

  const order = [...parts].sort((a, b) =>
    a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1,
  );
  const extra = new Map<string, bigint>();
  for (const p of order) {
    if (leftover === 0n) break;
    if (p.rem === 0n && items[p.index].weight === 0n) continue;
    extra.set(p.memberId, 1n);
    leftover -= 1n;
  }

  return parts.map((p) => ({ memberId: p.memberId, amount: p.base + (extra.get(p.memberId) ?? 0n) }));
}

/** Computes each member's share of `total`. The result is sorted by memberId and sums to `total`. */
export function computeShares(total: Toman, type: SplitType, inputs: SplitInput[]): MemberAmount[] {
  if (inputs.length === 0) {
    throw new DomainError("split.no_participants", "حداقل یک نفر باید در هزینه سهیم باشد.");
  }
  assertUniqueMembers(inputs);

  switch (type) {
    case "equal":
      return distributeByWeights(
        total,
        inputs.map((i) => ({ memberId: i.memberId, weight: 1n })),
      );

    case "exact": {
      let s = 0n;
      for (const i of inputs) {
        if (i.value < 0n) throw new DomainError("split.negative_amount", "سهم نمی‌تواند منفی باشد.");
        s += i.value;
      }
      if (s !== total) {
        throw new DomainError(
          "split.exact_mismatch",
          "جمع سهم‌ها باید دقیقاً برابر مبلغ کل باشد.",
        );
      }
      return [...inputs]
        .sort(byMemberId)
        .map((i) => ({ memberId: i.memberId, amount: i.value }));
    }

    case "percent": {
      let s = 0n;
      for (const i of inputs) {
        if (i.value < 0n || i.value > PERCENT_SCALE) {
          throw new DomainError("split.percent_range", "هر درصد باید بین ۰ تا ۱۰۰ باشد.");
        }
        s += i.value;
      }
      if (s !== PERCENT_SCALE) {
        throw new DomainError("split.percent_sum", "جمع درصدها باید دقیقاً ۱۰۰ باشد.");
      }
      return distributeByWeights(
        total,
        inputs.map((i) => ({ memberId: i.memberId, weight: i.value })),
      );
    }

    case "shares":
      return distributeByWeights(
        total,
        inputs.map((i) => ({ memberId: i.memberId, weight: i.value })),
      );
  }
}

/** Validates the people who paid for an expense: positive, unique, and adding up to the total. */
export function validatePayers(total: Toman, payers: MemberAmount[]): MemberAmount[] {
  if (payers.length === 0) {
    throw new DomainError("payers.empty", "حداقل یک پرداخت‌کننده لازم است.");
  }
  assertUniqueMembers(payers);
  let s = 0n;
  for (const p of payers) {
    if (p.amount <= 0n) {
      throw new DomainError("payers.non_positive", "مبلغ هر پرداخت‌کننده باید بیشتر از صفر باشد.");
    }
    s += p.amount;
  }
  if (s !== total) {
    throw new DomainError("payers.sum_mismatch", "جمع مبالغ پرداخت‌کنندگان باید برابر مبلغ کل باشد.");
  }
  return [...payers].sort(byMemberId);
}

/**
 * Parses a decimal with at most two fractional digits ("12.5", "۳٫۲۵") into an integer scaled by 100.
 * Used for both percentages (→ basis points) and weights (→ weight×100).
 */
export function parseScaled2(input: string): bigint {
  const cleaned = toAsciiDigits(input.trim()).replace(/[٫/]/g, ".").replace(/[,\s٬]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) {
    throw new DomainError("number.invalid", "عدد معتبر با حداکثر دو رقم اعشار وارد کنید.");
  }
  const frac = (m[2] ?? "").padEnd(2, "0");
  return BigInt(m[1]) * 100n + BigInt(frac);
}

/** Formats an integer scaled by 100 ("1250" → "۱۲٫۵"). */
export function formatScaled2(value: bigint): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  const text = frac ? `${whole}.${frac}` : `${whole}`;
  return (neg ? "−" : "") + toPersianDigits(text).replace(".", "٫");
}
