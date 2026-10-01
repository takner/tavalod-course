import type { Balances } from "./ledger";
import type { Toman } from "./money";

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amount: Toman;
}

/**
 * "Settle-up with fewer transfers": repeatedly pairs the largest debtor with the largest creditor.
 * This greedy approach yields at most (n − 1) transfers and settles every balance to zero, but it
 * does NOT guarantee the absolute minimum number of transfers — UI copy must not claim that.
 * Ties are broken by memberId so the suggestion is stable between page loads.
 */
export function suggestTransfers(balances: Balances): Transfer[] {
  const debtors: { id: string; amt: Toman }[] = [];
  const creditors: { id: string; amt: Toman }[] = [];
  for (const [id, net] of balances) {
    if (net < 0n) debtors.push({ id, amt: -net });
    else if (net > 0n) creditors.push({ id, amt: net });
  }
  const order = (a: { id: string; amt: Toman }, b: { id: string; amt: Toman }) =>
    a.amt === b.amt ? (a.id < b.id ? -1 : 1) : a.amt > b.amt ? -1 : 1;

  const transfers: Transfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(order);
    creditors.sort(order);
    const d = debtors[0];
    const c = creditors[0];
    const amount = d.amt < c.amt ? d.amt : c.amt;
    transfers.push({ fromMemberId: d.id, toMemberId: c.id, amount });
    d.amt -= amount;
    c.amt -= amount;
    if (d.amt === 0n) debtors.shift();
    if (c.amt === 0n) creditors.shift();
  }
  return transfers;
}
