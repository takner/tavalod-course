import { DomainError } from "./errors";

/**
 * Money is always a whole number of Toman held in a `bigint`.
 * It crosses JSON / API boundaries as a decimal string ("125000"), never as a JS number.
 */
export type Toman = bigint;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Converts Persian and Arabic-Indic digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    return String(p >= 0 ? p : ARABIC_DIGITS.indexOf(ch));
  });
}

/** Converts ASCII digits to Persian digits (display only). */
export function toPersianDigits(input: string | number | bigint): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export const AMOUNT_STRING_RE = /^-?\d+$/;

/** Max amount accepted for a single record: 10^15 Toman — far above any real use, well inside int8. */
export const MAX_AMOUNT: Toman = 1_000_000_000_000_000n;

/**
 * Parses user-typed money ("۱۲۵٬۰۰۰", "125,000", "125000") into Toman.
 * Rejects decimals, signs and anything that is not a plain non-negative integer.
 */
export function parseAmountInput(input: string): Toman {
  const cleaned = toAsciiDigits(input.trim()).replace(/[,\s٬،_]/g, "");
  if (!/^\d+$/.test(cleaned)) {
    throw new DomainError("amount.invalid", "مبلغ باید یک عدد صحیح به تومان باشد.");
  }
  const value = BigInt(cleaned);
  if (value > MAX_AMOUNT) {
    throw new DomainError("amount.too_large", "مبلغ بیش از حد مجاز است.");
  }
  return value;
}

/** Strict parser for API payloads: decimal string only. */
export function amountFromJson(value: unknown): Toman {
  if (typeof value !== "string" || !AMOUNT_STRING_RE.test(value)) {
    throw new DomainError("amount.invalid", "مبلغ باید به‌صورت رشته عددی ارسال شود.");
  }
  return BigInt(value);
}

export function amountToJson(value: Toman): string {
  return value.toString();
}

const faFormatter = new Intl.NumberFormat("fa-IR");

/** "۱۲۵٬۰۰۰ تومان" */
export function formatToman(value: Toman, opts: { unit?: boolean; signed?: boolean } = {}): string {
  const { unit = true, signed = false } = opts;
  const abs = value < 0n ? -value : value;
  let text = faFormatter.format(abs);
  if (value < 0n) text = `−${text}`;
  else if (signed && value > 0n) text = `+${text}`;
  return unit ? `${text} تومان` : text;
}

export function sum(values: Iterable<Toman>): Toman {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function minBig(...values: Toman[]): Toman {
  return values.reduce((a, b) => (b < a ? b : a));
}

export function maxBig(...values: Toman[]): Toman {
  return values.reduce((a, b) => (b > a ? b : a));
}

export function absBig(value: Toman): Toman {
  return value < 0n ? -value : value;
}

/** JSON.stringify replacer that serialises bigint as a decimal string. */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
