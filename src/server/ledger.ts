import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  events,
  expensePayers,
  expenseShares,
  expenses,
  settlementAllocations,
  settlements,
} from "@/db/schema";
import type { LedgerExpense, LedgerSettlement } from "@/domain/ledger";

export type ScopedLedgerExpense = LedgerExpense & { giftId: string | null; spaceId: string | null };
export type ScopedLedgerSettlement = LedgerSettlement & {
  giftId: string | null;
  spaceId: string | null;
  purpose: "settle" | "collection" | "refund";
};

export interface GroupLedger {
  expenses: ScopedLedgerExpense[];
  settlements: ScopedLedgerSettlement[];
  /** Event ids ordered oldest first (start date, then creation) — the auto-allocation order. */
  orderedEventIds: string[];
}

/**
 * Which ledger to load. The public group ledger NEVER includes private-space money, so balances,
 * suggestions, event scopes and "my balance" in a group reveal nothing about a surprise.
 */
export type LedgerScope = { kind: "group" } | { kind: "space"; spaceId: string };

/** Loads everything that affects a ledger's balances. Balances are always derived, never stored. */
export async function loadGroupLedger(db: DbOrTx, groupId: string, scope: LedgerScope = { kind: "group" }): Promise<GroupLedger> {
  const expScope = scope.kind === "group" ? isNull(expenses.spaceId) : eq(expenses.spaceId, scope.spaceId);
  const setScope = scope.kind === "group" ? isNull(settlements.spaceId) : eq(settlements.spaceId, scope.spaceId);
  const [expRows, setRows, evRows] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), expScope))
      .orderBy(asc(expenses.date), asc(expenses.createdAt)),
    db
      .select()
      .from(settlements)
      .where(and(eq(settlements.groupId, groupId), setScope))
      .orderBy(asc(settlements.createdAt)),
    scope.kind === "group"
      ? db
          .select({ id: events.id, startDate: events.startDate, createdAt: events.createdAt })
          .from(events)
          .where(eq(events.groupId, groupId))
      : Promise.resolve([]),
  ]);

  const expIds = expRows.map((e) => e.id);
  const setIds = setRows.map((s) => s.id);
  const [payerRows, shareRows, allocRows] = await Promise.all([
    expIds.length ? db.select().from(expensePayers).where(inArray(expensePayers.expenseId, expIds)) : [],
    expIds.length ? db.select().from(expenseShares).where(inArray(expenseShares.expenseId, expIds)) : [],
    setIds.length
      ? db.select().from(settlementAllocations).where(inArray(settlementAllocations.settlementId, setIds))
      : [],
  ]);

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const payersBy = group(payerRows, (r) => r.expenseId);
  const sharesBy = group(shareRows, (r) => r.expenseId);
  const allocBy = group(allocRows, (r) => r.settlementId);

  const orderedEventIds = [...evRows]
    .sort((a, b) => {
      const da = a.startDate ?? "9999-12-31";
      const dbb = b.startDate ?? "9999-12-31";
      if (da !== dbb) return da < dbb ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map((e) => e.id);

  return {
    orderedEventIds,
    expenses: expRows.map((e) => ({
      id: e.id,
      title: e.title,
      eventId: e.eventId,
      kind: e.kind,
      totalAmount: e.totalAmount,
      date: e.date,
      deleted: e.deletedAt !== null,
      giftId: e.giftId,
      spaceId: e.spaceId,
      payers: (payersBy.get(e.id) ?? []).map((p) => ({ memberId: p.memberId, amount: p.amount })),
      shares: (sharesBy.get(e.id) ?? []).map((s) => ({ memberId: s.memberId, amount: s.amount })),
    })),
    settlements: setRows.map((s) => ({
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: s.amount,
      status: s.status,
      date: s.createdAt.toISOString().slice(0, 10),
      giftId: s.giftId,
      spaceId: s.spaceId,
      purpose: s.purpose,
      allocations: (allocBy.get(s.id) ?? []).map((a) => ({ eventId: a.eventId, amount: a.amount })),
    })),
  };
}
