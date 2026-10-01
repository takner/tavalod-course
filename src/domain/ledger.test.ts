import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { autoAllocate, validateAllocations } from "./allocate";
import {
  computeBalances,
  computeScopedBalances,
  explainBalance,
  isScopeSettled,
  type LedgerExpense,
  type LedgerSettlement,
} from "./ledger";
import { amountFromJson, amountToJson, formatToman, parseAmountInput } from "./money";
import { assertRefundAmount, defaultRefundSplit, refundableRemaining } from "./refund";
import { suggestTransfers } from "./simplify";
import { computeShares } from "./split";

const members = ["ali", "sara", "reza", "mina"];

function expense(
  id: string,
  total: bigint,
  payers: [string, bigint][],
  shareMembers: string[],
  extra: Partial<LedgerExpense> = {},
): LedgerExpense {
  return {
    id,
    title: id,
    eventId: null,
    kind: "expense",
    totalAmount: total,
    payers: payers.map(([memberId, amount]) => ({ memberId, amount })),
    shares: shareMembers.length
      ? computeShares(total, "equal", shareMembers.map((m) => ({ memberId: m, value: 0n })))
      : [],
    deleted: false,
    ...extra,
  };
}

function settlement(id: string, from: string, to: string, amount: bigint, extra: Partial<LedgerSettlement> = {}): LedgerSettlement {
  return {
    id,
    fromMemberId: from,
    toMemberId: to,
    amount,
    status: "confirmed",
    allocations: [{ eventId: null, amount }],
    ...extra,
  };
}

const sumMap = (m: Map<string, bigint>) => [...m.values()].reduce((a, b) => a + b, 0n);

describe("trip with unequal presence (acceptance scenario 1)", () => {
  // 4 friends, 3-night villa. Mina stayed only 2 nights. Reza skipped rafting.
  // Fuel was paid by two people together.
  const villa: LedgerExpense = {
    ...expense("villa", 11_000_000n, [["ali", 11_000_000n]], members),
    shares: computeShares(11_000_000n, "shares", [
      { memberId: "ali", value: 300n },
      { memberId: "sara", value: 300n },
      { memberId: "reza", value: 300n },
      { memberId: "mina", value: 200n },
    ]),
  };
  const rafting = expense("rafting", 3_000_000n, [["sara", 3_000_000n]], ["ali", "sara", "mina"]);
  const fuel = expense("fuel", 2_000_000n, [["reza", 1_200_000n], ["mina", 800_000n]], members);
  const all = [villa, rafting, fuel];

  it("matches the hand calculation", () => {
    const b = computeBalances(all, []);
    // villa shares: 3M,3M,3M,2M; rafting 1M each for ali/sara/mina; fuel 500k each
    expect(b.get("ali")).toBe(11_000_000n - 3_000_000n - 1_000_000n - 500_000n); // 6.5M
    expect(b.get("sara")).toBe(-3_000_000n + 3_000_000n - 1_000_000n - 500_000n); // -1.5M
    expect(b.get("reza")).toBe(-3_000_000n + 1_200_000n - 500_000n); // -2.3M
    expect(b.get("mina")).toBe(-2_000_000n - 1_000_000n + 800_000n - 500_000n); // -2.7M
    expect(sumMap(b)).toBe(0n);
  });

  it("suggested transfers settle everyone to zero", () => {
    const b = computeBalances(all, []);
    const transfers = suggestTransfers(b);
    expect(transfers.length).toBeLessThanOrEqual(members.length - 1);
    const settled = computeBalances(
      all,
      transfers.map((t, i) => settlement(`s${i}`, t.fromMemberId, t.toMemberId, t.amount)),
    );
    for (const v of settled.values()) expect(v).toBe(0n);
  });

  it("explains every member's balance line by line", () => {
    const b = computeBalances(all, []);
    for (const m of members) {
      const lines = explainBalance(m, all, []);
      expect(lines.reduce((a, l) => a + l.effect, 0n)).toBe(b.get(m));
    }
    const rezaLines = explainBalance("reza", all, []);
    expect(rezaLines.map((l) => l.refId)).toEqual(["villa", "fuel"]); // not rafting
  });
});

describe("partial payment (acceptance scenario 2)", () => {
  const e = expense("dinner", 1_000_000n, [["ali", 1_000_000n]], ["ali", "sara"]);
  it("pending does not change balances; confirmed does; rejected never does", () => {
    const pending = settlement("p", "sara", "ali", 200_000n, { status: "pending" });
    expect(computeBalances([e], [pending]).get("sara")).toBe(-500_000n);
    expect(computeBalances([e], [{ ...pending, status: "confirmed" }]).get("sara")).toBe(-300_000n);
    expect(computeBalances([e], [{ ...pending, status: "rejected" }]).get("sara")).toBe(-500_000n);
  });
});

describe("refunds (acceptance scenario 3)", () => {
  const cake = expense("cake", 900_000n, [["ali", 900_000n]], ["ali", "sara", "reza"]);

  it("a full refund restores balances", () => {
    const split = defaultRefundSplit(900_000n, cake);
    const refund: LedgerExpense = {
      ...expense("cake-refund", 900_000n, [], []),
      kind: "refund",
      payers: split.receivers,
      shares: split.shares,
    };
    const b = computeBalances([cake, refund], []);
    for (const v of b.values()) expect(v).toBe(0n);
  });

  it("partial refunds are capped by what remains", () => {
    expect(refundableRemaining(900_000n, [300_000n])).toBe(600_000n);
    expect(() => assertRefundAmount(600_001n, 600_000n)).toThrow();
    expect(() => assertRefundAmount(0n, 600_000n)).toThrow();
    expect(() => assertRefundAmount(600_000n, 600_000n)).not.toThrow();
  });

  it("property: a refund of x reduces |balance| consistently and keeps the sum at zero", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 900_000n }), (x) => {
        const split = defaultRefundSplit(x, cake);
        const refund: LedgerExpense = {
          ...expense("r", x, [], []),
          kind: "refund",
          payers: split.receivers,
          shares: split.shares,
        };
        const b = computeBalances([cake, refund], []);
        expect(sumMap(b)).toBe(0n);
        expect(split.receivers.reduce((a, r) => a + r.amount, 0n)).toBe(x);
        expect(split.shares.reduce((a, r) => a + r.amount, 0n)).toBe(x);
      }),
    );
  });
});

describe("multi-event settlement allocation (acceptance scenario 5)", () => {
  const trip = expense("trip", 1_000_000n, [["ali", 1_000_000n]], ["ali", "sara"], { eventId: "trip" });
  const bday = expense("bday", 600_000n, [["ali", 600_000n]], ["ali", "sara"], { eventId: "bday" });
  const general = expense("misc", 200_000n, [["ali", 200_000n]], ["ali", "sara"]);
  const expenses = [trip, bday, general];

  it("allocates oldest event first, remainder to general", () => {
    const scoped = computeScopedBalances(expenses, [], { settlementStatuses: ["confirmed", "pending"] });
    const alloc = autoAllocate(700_000n, "sara", "ali", ["trip", "bday"], scoped);
    expect(alloc).toEqual([
      { eventId: "trip", amount: 500_000n },
      { eventId: "bday", amount: 200_000n },
    ]);
    const big = autoAllocate(1_000_000n, "sara", "ali", ["trip", "bday"], scoped);
    expect(big).toEqual([
      { eventId: "trip", amount: 500_000n },
      { eventId: "bday", amount: 300_000n },
      { eventId: null, amount: 200_000n },
    ]);
    expect(() => validateAllocations(1_000_000n, big)).not.toThrow();
  });

  it("an event is closable only once its own balances are zero", () => {
    const s = settlement("s", "sara", "ali", 700_000n, {
      allocations: [
        { eventId: "trip", amount: 500_000n },
        { eventId: "bday", amount: 200_000n },
      ],
    });
    const scoped = computeScopedBalances(expenses, [s]);
    expect(isScopeSettled(scoped.get("trip"))).toBe(true);
    expect(isScopeSettled(scoped.get("bday"))).toBe(false);
    expect(scoped.get("bday")?.get("sara")).toBe(-100_000n);
  });

  it("pending settlements are counted when allocating, so they cannot double-claim a debt", () => {
    const pending = settlement("p", "sara", "ali", 500_000n, {
      status: "pending",
      allocations: [{ eventId: "trip", amount: 500_000n }],
    });
    const scoped = computeScopedBalances(expenses, [pending], { settlementStatuses: ["confirmed", "pending"] });
    expect(autoAllocate(300_000n, "sara", "ali", ["trip", "bday"], scoped)).toEqual([
      { eventId: "bday", amount: 300_000n },
    ]);
  });

  it("rejects allocations that do not add up", () => {
    expect(() => validateAllocations(100n, [{ eventId: null, amount: 99n }])).toThrow();
    expect(() =>
      validateAllocations(100n, [
        { eventId: "x", amount: 50n },
        { eventId: "x", amount: 50n },
      ]),
    ).toThrow();
  });
});

describe("ledger properties", () => {
  const arbExpense = fc
    .record({
      total: fc.bigInt({ min: 1n, max: 10n ** 9n }),
      payer: fc.constantFrom(...members),
      sharers: fc.subarray(members, { minLength: 1 }),
      eventId: fc.constantFrom(null, "e1", "e2"),
      deleted: fc.boolean(),
    })
    .map((r) =>
      expense(`x${String(r.total)}`, r.total, [[r.payer, r.total]], r.sharers, { eventId: r.eventId, deleted: r.deleted }),
    );

  it("balances always sum to zero in every scope, and suggestions settle them", () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { maxLength: 15 }), (expenses) => {
        for (const scope of computeScopedBalances(expenses, []).values()) expect(sumMap(scope)).toBe(0n);
        const b = computeBalances(expenses, []);
        expect(sumMap(b)).toBe(0n);
        const transfers = suggestTransfers(b);
        const nonZero = [...b.values()].filter((v) => v !== 0n).length;
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
        const after = computeBalances(
          expenses,
          transfers.map((t, i) => settlement(`s${i}`, t.fromMemberId, t.toMemberId, t.amount)),
        );
        for (const v of after.values()) expect(v).toBe(0n);
        for (const m of members) {
          expect(explainBalance(m, expenses, []).reduce((a, l) => a + l.effect, 0n)).toBe(b.get(m) ?? 0n);
        }
      }),
    );
  });
});

describe("money", () => {
  it("round-trips bigint through JSON strings without precision loss", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }), (v) => {
        expect(amountFromJson(amountToJson(v))).toBe(v);
      }),
    );
    expect(() => amountFromJson(12)).toThrow();
    expect(() => amountFromJson("1.5")).toThrow();
    expect(() => amountFromJson("1e5")).toThrow();
  });

  it("parses Persian input and formats in Persian", () => {
    expect(parseAmountInput("۱۲۵٬۰۰۰")).toBe(125_000n);
    expect(parseAmountInput("125,000")).toBe(125_000n);
    expect(() => parseAmountInput("12.5")).toThrow();
    expect(() => parseAmountInput("-5")).toThrow();
    expect(formatToman(125_000n)).toBe("۱۲۵٬۰۰۰ تومان");
    expect(formatToman(-5_000n)).toBe("−۵٬۰۰۰ تومان");
  });
});
