import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  computeShares,
  distributeByWeights,
  formatScaled2,
  parseScaled2,
  validatePayers,
  type SplitInput,
} from "./split";

const ids = ["a", "b", "c", "d", "e", "f"];
const sumOf = (xs: { amount: bigint }[]) => xs.reduce((s, x) => s + x.amount, 0n);

describe("computeShares", () => {
  it("equal split spreads the remainder deterministically", () => {
    const r = computeShares(100_000n, "equal", [
      { memberId: "c", value: 0n },
      { memberId: "a", value: 0n },
      { memberId: "b", value: 0n },
    ]);
    expect(r).toEqual([
      { memberId: "a", amount: 33_334n },
      { memberId: "b", amount: 33_333n },
      { memberId: "c", amount: 33_333n },
    ]);
  });

  it("exact split must add up to the total", () => {
    expect(() =>
      computeShares(1000n, "exact", [
        { memberId: "a", value: 400n },
        { memberId: "b", value: 500n },
      ]),
    ).toThrow(DomainError);
    expect(
      computeShares(1000n, "exact", [
        { memberId: "b", value: 600n },
        { memberId: "a", value: 400n },
      ]),
    ).toEqual([
      { memberId: "a", amount: 400n },
      { memberId: "b", amount: 600n },
    ]);
  });

  it("percent split requires exactly 100%", () => {
    expect(() =>
      computeShares(1000n, "percent", [
        { memberId: "a", value: 5000n },
        { memberId: "b", value: 4999n },
      ]),
    ).toThrow(/۱۰۰/);
    const r = computeShares(1001n, "percent", [
      { memberId: "a", value: 3333n },
      { memberId: "b", value: 3333n },
      { memberId: "c", value: 3334n },
    ]);
    expect(sumOf(r)).toBe(1001n);
  });

  it("shares split handles fractional weights (nights)", () => {
    // 3 people stayed 3 nights, one stayed 2 nights: weights 3,3,3,2 — total 11 units
    const r = computeShares(1_100_000n, "shares", [
      { memberId: "a", value: 300n },
      { memberId: "b", value: 300n },
      { memberId: "c", value: 300n },
      { memberId: "d", value: 200n },
    ]);
    expect(r.map((x) => x.amount)).toEqual([300_000n, 300_000n, 300_000n, 200_000n]);
  });

  it("rejects duplicates, empty lists and all-zero weights", () => {
    expect(() => computeShares(10n, "equal", [])).toThrow(DomainError);
    expect(() =>
      computeShares(10n, "equal", [
        { memberId: "a", value: 0n },
        { memberId: "a", value: 0n },
      ]),
    ).toThrow(DomainError);
    expect(() => computeShares(10n, "shares", [{ memberId: "a", value: 0n }])).toThrow(DomainError);
  });

  it("property: every split type sums exactly to the total and is order-independent", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 13n }),
        fc.subarray(ids, { minLength: 1 }),
        fc.array(fc.bigInt({ min: 1n, max: 10_000n }), { minLength: 6, maxLength: 6 }),
        fc.constantFrom("equal", "shares", "percent" as const),
        (total, members, rawWeights, type) => {
          let inputs: SplitInput[] = members.map((m, i) => ({ memberId: m, value: rawWeights[i] }));
          if (type === "percent") {
            // turn arbitrary weights into percentages that sum to exactly 10000 bp
            const bp = distributeByWeights(
              10_000n,
              inputs.map((x) => ({ memberId: x.memberId, weight: x.value })),
            );
            inputs = bp.map((x) => ({ memberId: x.memberId, value: x.amount }));
          }
          const r1 = computeShares(total, type, inputs);
          const r2 = computeShares(total, type, [...inputs].reverse());
          expect(sumOf(r1)).toBe(total);
          expect(r1).toEqual(r2);
          for (const x of r1) expect(x.amount >= 0n).toBe(true);
        },
      ),
    );
  });

  it("property: equal shares differ by at most 1 Toman", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.subarray(ids, { minLength: 1 }), (total, members) => {
        const r = computeShares(total, "equal", members.map((m) => ({ memberId: m, value: 0n })));
        const amounts = r.map((x) => x.amount);
        const max = amounts.reduce((a, b) => (b > a ? b : a));
        const min = amounts.reduce((a, b) => (b < a ? b : a));
        expect(max - min <= 1n).toBe(true);
      }),
    );
  });
});

describe("validatePayers", () => {
  it("requires payers to cover the total exactly", () => {
    expect(() => validatePayers(100n, [{ memberId: "a", amount: 50n }])).toThrow(DomainError);
    expect(() => validatePayers(100n, [{ memberId: "a", amount: 0n }, { memberId: "b", amount: 100n }])).toThrow(
      DomainError,
    );
    expect(validatePayers(100n, [{ memberId: "b", amount: 60n }, { memberId: "a", amount: 40n }])).toEqual([
      { memberId: "a", amount: 40n },
      { memberId: "b", amount: 60n },
    ]);
  });
});

describe("scaled decimals", () => {
  it("parses and formats two-decimal values exactly", () => {
    expect(parseScaled2("12.5")).toBe(1250n);
    expect(parseScaled2("۳٫۲۵")).toBe(325n);
    expect(parseScaled2("100")).toBe(10000n);
    expect(() => parseScaled2("1.234")).toThrow(DomainError);
    expect(() => parseScaled2("-1")).toThrow(DomainError);
    expect(formatScaled2(1250n)).toBe("۱۲٫۵");
    expect(formatScaled2(10000n)).toBe("۱۰۰");
  });
});
