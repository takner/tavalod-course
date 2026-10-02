import { DomainError } from "./errors";

export interface CakeInput {
  adults: number;
  children: number;
  /** Grams of cake per adult (editable assumption). */
  adultGrams: number;
  /** Grams of cake per child (editable assumption). */
  childGrams: number;
  /** Extra margin in basis points: 10% = 1000. */
  marginBp: number;
  /** Order step in grams, e.g. 500 for half-kilo steps. */
  roundStepGrams: number;
}

export interface CakeEstimate {
  baseGrams: number;
  withMarginGrams: number;
  /** Rounded UP to the order step — an estimate the organiser can override. */
  suggestedGrams: number;
}

export const DEFAULT_CAKE = { adultGrams: 150, childGrams: 100, marginBp: 1000, roundStepGrams: 500 } as const;

function nonNegInt(v: number, label: string): void {
  if (!Number.isInteger(v) || v < 0 || v > 1_000_000) {
    throw new DomainError("cake.invalid", `${label} باید عدد صحیح نامنفی باشد.`);
  }
}

/** Deterministic cake estimate. No AI, no hidden rules: every assumption is an input. */
export function estimateCake(input: CakeInput): CakeEstimate {
  nonNegInt(input.adults, "تعداد بزرگسال");
  nonNegInt(input.children, "تعداد کودک");
  nonNegInt(input.adultGrams, "سهم بزرگسال");
  nonNegInt(input.childGrams, "سهم کودک");
  nonNegInt(input.marginBp, "حاشیه اضافه");
  if (!Number.isInteger(input.roundStepGrams) || input.roundStepGrams <= 0) {
    throw new DomainError("cake.invalid", "گام گردکردن باید بیشتر از صفر باشد.");
  }
  const baseGrams = input.adults * input.adultGrams + input.children * input.childGrams;
  const withMarginGrams = Math.ceil((baseGrams * (10_000 + input.marginBp)) / 10_000);
  const suggestedGrams = Math.ceil(withMarginGrams / input.roundStepGrams) * input.roundStepGrams;
  return { baseGrams, withMarginGrams, suggestedGrams };
}
