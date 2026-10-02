import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { filterActivities } from "./activities";
import { estimateCake } from "./cake";
import { nextBirthday, utcToZoned, zonedTimeToUtc } from "./calendar";
import { finalGiftShares, giftLedgerView, OverCapError, suggestEqualShares } from "./gifts";
import { computeBalances, type LedgerExpense, type LedgerSettlement } from "./ledger";
import { tallyPoll, validateBallot } from "./polls";
import { computeShares } from "./split";

describe("cake estimate", () => {
  it("matches the worked example: 10×150g + 2×100g, +10%, rounded up to 500g → 2kg", () => {
    expect(
      estimateCake({ adults: 10, children: 2, adultGrams: 150, childGrams: 100, marginBp: 1000, roundStepGrams: 500 }),
    ).toEqual({ baseGrams: 1700, withMarginGrams: 1870, suggestedGrams: 2000 });
  });
  it("never rounds down and rejects nonsense", () => {
    expect(estimateCake({ adults: 0, children: 0, adultGrams: 150, childGrams: 100, marginBp: 0, roundStepGrams: 500 }).suggestedGrams).toBe(0);
    expect(estimateCake({ adults: 1, children: 0, adultGrams: 150, childGrams: 100, marginBp: 0, roundStepGrams: 500 }).suggestedGrams).toBe(500);
    expect(() => estimateCake({ adults: -1, children: 0, adultGrams: 1, childGrams: 1, marginBp: 0, roundStepGrams: 1 })).toThrow();
    expect(() => estimateCake({ adults: 1, children: 0, adultGrams: 1, childGrams: 1, marginBp: 0, roundStepGrams: 0 })).toThrow();
  });
});

describe("birthdays and time", () => {
  it("keeps a Jalali birthday on its Jalali day every year", () => {
    // 15 Mehr: 2026-10-07 (1405) and the next year 2027-10-07 (1406)
    expect(nextBirthday("jalali", 7, 15, "2026-10-01").iso).toBe("2026-10-07");
    expect(nextBirthday("jalali", 7, 15, "2026-10-08").iso).toBe("2027-10-07");
    expect(nextBirthday("jalali", 7, 15, "2026-10-07").daysUntil).toBe(0);
  });
  it("falls back to the month's last day when the day does not exist that year", () => {
    expect(nextBirthday("gregorian", 2, 29, "2027-01-01").iso).toBe("2027-02-28");
    expect(nextBirthday("gregorian", 2, 29, "2028-01-01").iso).toBe("2028-02-29");
    expect(() => nextBirthday("jalali", 7, 31, "2026-01-01")).toThrow(); // Mehr has 30 days
  });
  it("reports age only when the birth year is known", () => {
    expect(nextBirthday("jalali", 7, 15, "2026-10-01", 1375).turning).toBe(30);
    expect(nextBirthday("jalali", 7, 15, "2026-10-01").turning).toBeNull();
  });
  it("converts Tehran wall-clock time to UTC and back", () => {
    const utc = zonedTimeToUtc("2026-10-05", "19:30", "Asia/Tehran");
    expect(utc.toISOString()).toBe("2026-10-05T16:00:00.000Z");
    expect(utcToZoned(utc, "Asia/Tehran")).toEqual({ dateIso: "2026-10-05", hhmm: "19:30" });
    expect(utcToZoned(new Date("2026-10-05T21:00:00Z"), "Asia/Tehran")).toEqual({ dateIso: "2026-10-06", hhmm: "00:30" });
  });
});

describe("polls", () => {
  it("counts respondents and non-respondents; multi-choice shares are 'of respondents'", () => {
    const t = tallyPoll(
      ["a", "b", "c"],
      [
        { memberId: "m1", optionId: "a" },
        { memberId: "m1", optionId: "b" },
        { memberId: "m2", optionId: "a" },
        { memberId: "outsider", optionId: "a" }, // not eligible → ignored
      ],
      ["m1", "m2", "m3", "m4"],
    );
    expect(t.respondents).toBe(2);
    expect(t.nonRespondentIds.sort()).toEqual(["m3", "m4"]);
    expect(t.options.map((o) => [o.optionId, o.count, o.respondentShareBp])).toEqual([
      ["a", 2, 10000],
      ["b", 1, 5000],
      ["c", 0, 0],
    ]);
    expect(t.leaders).toEqual(["a"]);
  });
  it("validates ballots", () => {
    expect(validateBallot(["a", "b"], ["a", "a"], false)).toEqual(["a"]);
    expect(() => validateBallot(["a", "b"], ["a", "b"], false)).toThrow();
    expect(() => validateBallot(["a"], ["x"], true)).toThrow();
    expect(() => validateBallot(["a"], [], true)).toThrow();
  });
});

describe("activity templates", () => {
  it("filters by people, budget and preferences", () => {
    const all = filterActivities({});
    expect(all.length).toBeGreaterThan(4);
    expect(filterActivities({ people: 30 }).every((t) => t.maxPeople >= 30)).toBe(true);
    expect(filterActivities({ familyFriendly: true }).some((t) => t.id === "sports")).toBe(false);
    expect(filterActivities({ maxBudgetPerPerson: 60_000n }).map((t) => t.id)).toEqual(["hike"]);
  });
});

// ─────────────── gift accounting: the worked example in docs/phase2-plan.md ───────────────

const people = ["ali", "sara", "reza", "mina", "nima", "pari", "ghasem"];
type GiftSettlement = LedgerSettlement & { giftId: string | null; purpose: "settle" | "collection" | "refund" };

function collection(id: string, from: string, amount: bigint, status: "pending" | "confirmed" = "confirmed"): GiftSettlement {
  return {
    id,
    fromMemberId: from,
    toMemberId: "ali",
    amount,
    status,
    allocations: [{ eventId: null, amount }],
    giftId: "g",
    purpose: "collection",
  };
}
function refund(id: string, to: string, amount: bigint): GiftSettlement {
  return {
    id,
    fromMemberId: "ali",
    toMemberId: to,
    amount,
    status: "confirmed",
    allocations: [{ eventId: null, amount }],
    giftId: "g",
    purpose: "refund",
  };
}

describe("gift accounting (pledge → prepayment → purchase → settle)", () => {
  const pledges = people.map((memberId) => ({ memberId, amount: 200_000n }));
  const purchaseShares = finalGiftShares(1_330_000n, pledges);
  const purchase: LedgerExpense & { giftId: string } = {
    id: "p",
    title: "هدفون",
    eventId: null,
    kind: "expense",
    totalAmount: 1_330_000n,
    payers: [{ memberId: "ali", amount: 1_330_000n }],
    shares: purchaseShares,
    deleted: false,
    giftId: "g",
  };

  it("pledges alone change nothing", () => {
    const b = computeBalances([], []);
    expect(b.size).toBe(0);
    const v = giftLedgerView("g", pledges, [], []);
    expect(v.pledged).toBe(1_400_000n);
    expect(v.collectedConfirmed).toBe(0n);
    expect(v.perMember.every((m) => m.remaining === 0n && m.paid === 0n)).toBe(true);
  });

  it("step 1: confirmed prepayments are held by the buyer; pending is not collected", () => {
    const s = [collection("s1", "sara", 200_000n), collection("s2", "reza", 200_000n), collection("s3", "mina", 200_000n), collection("s4", "nima", 200_000n, "pending")];
    const b = computeBalances([], s);
    expect(b.get("sara")).toBe(200_000n);
    expect(b.get("ali")).toBe(-600_000n);
    expect(b.get("nima") ?? 0n).toBe(0n);
    const v = giftLedgerView("g", pledges, [], s);
    expect(v.collectedConfirmed).toBe(600_000n);
    expect(v.collectedPending).toBe(200_000n);
  });

  it("step 2: purchase of 1,330,000 split equally (190,000) — nothing counted twice", () => {
    expect(purchaseShares.every((x) => x.amount === 190_000n)).toBe(true);
    const s = [collection("s1", "sara", 200_000n), collection("s2", "reza", 200_000n), collection("s3", "mina", 200_000n), collection("s4", "nima", 200_000n, "pending")];
    const b = computeBalances([purchase], s);
    expect(b.get("sara")).toBe(10_000n);
    expect(b.get("nima")).toBe(-190_000n);
    expect(b.get("pari")).toBe(-190_000n);
    expect(b.get("ali")).toBe(540_000n);
    expect([...b.values()].reduce((a, x) => a + x, 0n)).toBe(0n);
    const v = giftLedgerView("g", pledges, [purchase], s);
    for (const m of v.perMember) {
      // per-gift remaining equals the ledger balance (buyer's own payment aside)
      if (m.memberId !== "ali") expect(-m.remaining).toBe(b.get(m.memberId) ?? 0n);
    }
  });

  it("step 3: confirm, pay the rest, refund the 10,000 overpayments → everyone is zero", () => {
    const s = [
      collection("s1", "sara", 200_000n),
      collection("s2", "reza", 200_000n),
      collection("s3", "mina", 200_000n),
      collection("s4", "nima", 200_000n),
      collection("s5", "pari", 190_000n),
      collection("s6", "ghasem", 190_000n),
      refund("r1", "sara", 10_000n),
      refund("r2", "reza", 10_000n),
      refund("r3", "mina", 10_000n),
      refund("r4", "nima", 10_000n),
    ];
    const b = computeBalances([purchase], s);
    for (const v of b.values()) expect(v).toBe(0n);
    const view = giftLedgerView("g", pledges, [purchase], s);
    expect(view.perMember.filter((m) => m.memberId !== "ali").every((m) => m.remaining === 0n)).toBe(true);
  });

  it("a price above the accepted caps is refused, never silently charged", () => {
    expect(() => finalGiftShares(1_540_000n, pledges)).toThrow(OverCapError);
    // Someone accepts more: custom split within caps works once Ali raises his own pledge.
    const raised = pledges.map((p) => (p.memberId === "ali" ? { ...p, amount: 340_000n } : p));
    const custom = people.map((memberId) => ({ memberId, amount: memberId === "ali" ? 340_000n : 200_000n }));
    expect(finalGiftShares(1_540_000n, raised, custom).reduce((a, x) => a + x.amount, 0n)).toBe(1_540_000n);
  });

  it("property: equal suggestions and final shares always add up exactly", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 9n }), fc.integer({ min: 1, max: 7 }), (total, n) => {
        const ids = people.slice(0, n);
        expect(suggestEqualShares(total, ids).reduce((a, x) => a + x.amount, 0n)).toBe(total);
        const caps = ids.map((memberId) => ({ memberId, amount: total }));
        expect(finalGiftShares(total, caps).reduce((a, x) => a + x.amount, 0n)).toBe(total);
      }),
    );
  });

  it("purchase refunds reduce shares proportionally", () => {
    const back: LedgerExpense & { giftId: string } = {
      ...purchase,
      id: "rf",
      kind: "refund",
      totalAmount: 700_000n,
      payers: [{ memberId: "ali", amount: 700_000n }],
      shares: computeShares(700_000n, "equal", people.map((memberId) => ({ memberId, value: 0n }))),
    };
    const v = giftLedgerView("g", pledges, [purchase, back], []);
    expect(v.purchaseTotal).toBe(630_000n);
    expect(v.perMember.find((m) => m.memberId === "sara")!.share).toBe(90_000n);
  });
});
