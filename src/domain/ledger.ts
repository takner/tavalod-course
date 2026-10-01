import type { MemberAmount } from "./split";
import type { Toman } from "./money";

/**
 * Balance convention used everywhere: net > 0 means the group owes this member (creditor);
 * net < 0 means the member owes the group (debtor). The nets of a scope always sum to zero.
 */
export type Balances = Map<string, Toman>;

/** Key for the "general" bucket: expenses / allocations that belong to no event. */
export const GENERAL_SCOPE = "general";
export type ScopeKey = string; // eventId or GENERAL_SCOPE

export interface LedgerExpense {
  id: string;
  title: string;
  eventId: string | null;
  /** A refund reverses money: `payers` are the people who received the refund. */
  kind: "expense" | "refund";
  totalAmount: Toman;
  payers: MemberAmount[];
  shares: MemberAmount[];
  deleted: boolean;
  date?: string;
}

export type SettlementStatus = "pending" | "confirmed" | "rejected";

export interface LedgerSettlement {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: Toman;
  status: SettlementStatus;
  allocations: { eventId: string | null; amount: Toman }[];
  date?: string;
}

export function scopeOf(eventId: string | null): ScopeKey {
  return eventId ?? GENERAL_SCOPE;
}

function add(map: Balances, memberId: string, delta: Toman): void {
  map.set(memberId, (map.get(memberId) ?? 0n) + delta);
}

/** Per-member effect of one expense (or refund) on balances. */
export function expenseEffects(e: LedgerExpense): Balances {
  const out: Balances = new Map();
  if (e.deleted) return out;
  const sign = e.kind === "refund" ? -1n : 1n;
  for (const p of e.payers) add(out, p.memberId, sign * p.amount);
  for (const s of e.shares) add(out, s.memberId, -sign * s.amount);
  return out;
}

export interface BalanceOptions {
  /** Which settlement statuses count. Balances shown to users count only `confirmed`. */
  settlementStatuses?: SettlementStatus[];
}

/**
 * Balances per scope (each event, plus the general bucket). Settlements contribute through their
 * allocations, so an event's balance reflects exactly the part of each payment assigned to it.
 */
export function computeScopedBalances(
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  opts: BalanceOptions = {},
): Map<ScopeKey, Balances> {
  const statuses = new Set(opts.settlementStatuses ?? ["confirmed"]);
  const scopes = new Map<ScopeKey, Balances>();
  const scope = (key: ScopeKey) => {
    let b = scopes.get(key);
    if (!b) {
      b = new Map();
      scopes.set(key, b);
    }
    return b;
  };

  for (const e of expenses) {
    if (e.deleted) continue;
    const b = scope(scopeOf(e.eventId));
    for (const [m, v] of expenseEffects(e)) add(b, m, v);
  }
  for (const s of settlements) {
    if (!statuses.has(s.status)) continue;
    for (const a of s.allocations) {
      const b = scope(scopeOf(a.eventId));
      add(b, s.fromMemberId, a.amount);
      add(b, s.toMemberId, -a.amount);
    }
  }
  return scopes;
}

/** Group-wide balance per member = sum over all scopes. */
export function computeBalances(
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  opts: BalanceOptions = {},
): Balances {
  const total: Balances = new Map();
  for (const b of computeScopedBalances(expenses, settlements, opts).values()) {
    for (const [m, v] of b) add(total, m, v);
  }
  return total;
}

/** An event can be closed only when every member's balance inside it is zero. */
export function isScopeSettled(balances: Balances | undefined): boolean {
  if (!balances) return true;
  for (const v of balances.values()) if (v !== 0n) return false;
  return true;
}

export interface ExplainLine {
  kind: "expense" | "refund" | "settlement_paid" | "settlement_received";
  refId: string;
  title: string;
  eventId: string | null;
  date?: string;
  /** What the member paid (expense) / received (refund) / transferred (settlement). */
  paid: Toman;
  /** The member's share of the expense or refund. */
  share: Toman;
  /** Signed effect on the member's balance. */
  effect: Toman;
}

/**
 * Every line that contributes to one member's balance. The sum of `effect` equals the member's
 * balance from `computeBalances` (with the same options) — that is the "every number is explainable" rule.
 */
export function explainBalance(
  memberId: string,
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  opts: BalanceOptions & { eventId?: string | null } = {},
): ExplainLine[] {
  const statuses = new Set(opts.settlementStatuses ?? ["confirmed"]);
  const scoped = opts.eventId !== undefined;
  const lines: ExplainLine[] = [];

  for (const e of expenses) {
    if (e.deleted) continue;
    if (scoped && e.eventId !== opts.eventId) continue;
    const paid = e.payers.find((p) => p.memberId === memberId)?.amount ?? 0n;
    const share = e.shares.find((s) => s.memberId === memberId)?.amount ?? 0n;
    if (paid === 0n && share === 0n) continue;
    const sign = e.kind === "refund" ? -1n : 1n;
    lines.push({
      kind: e.kind,
      refId: e.id,
      title: e.title,
      eventId: e.eventId,
      date: e.date,
      paid,
      share,
      effect: sign * (paid - share),
    });
  }

  for (const s of settlements) {
    if (!statuses.has(s.status)) continue;
    if (s.fromMemberId !== memberId && s.toMemberId !== memberId) continue;
    const amount = scoped
      ? s.allocations.filter((a) => a.eventId === opts.eventId).reduce((acc, a) => acc + a.amount, 0n)
      : s.amount;
    if (amount === 0n) continue;
    const isFrom = s.fromMemberId === memberId;
    lines.push({
      kind: isFrom ? "settlement_paid" : "settlement_received",
      refId: s.id,
      title: isFrom ? "پرداخت تسویه" : "دریافت تسویه",
      eventId: null,
      date: s.date,
      paid: amount,
      share: 0n,
      effect: isFrom ? amount : -amount,
    });
  }
  return lines;
}
