import { format as formatJalali, getDate, getDaysInMonth, getMonth, getYear, newDate } from "date-fns-jalali";
import { faIR } from "date-fns-jalali/locale";
import { formatToman, toPersianDigits } from "@/domain/money";

export { formatToman, toPersianDigits };

/** Parses "YYYY-MM-DD" as a local calendar date (noon, so no timezone can shift the day). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "۹ مهر ۱۴۰۵" */
export function formatJalaliDate(value: string | Date, withYear = true): string {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  return toPersianDigits(formatJalali(date, withYear ? "d MMMM yyyy" : "d MMMM", { locale: faIR }));
}

/** "۹ مهر ۱۴۰۵، ۱۴:۳۰" — rendered in Tehran time regardless of where the server runs. */
export function formatJalaliDateTime(value: Date): string {
  const tehran = new Date(value.toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
  return toPersianDigits(formatJalali(tehran, "d MMMM yyyy، HH:mm", { locale: faIR }));
}

export function todayIso(): string {
  const tehran = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
  return toIsoDate(tehran);
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export function isoToJalaliParts(iso: string): { y: number; m: number; d: number } {
  const date = parseIsoDate(iso);
  return { y: getYear(date), m: getMonth(date) + 1, d: getDate(date) };
}

export function jalaliPartsToIso(y: number, m: number, d: number): string {
  const max = getDaysInMonth(newDate(y, m - 1, 1));
  const date = newDate(y, m - 1, Math.min(d, max));
  date.setHours(12);
  return toIsoDate(date);
}

export function jalaliDaysInMonth(y: number, m: number): number {
  return getDaysInMonth(newDate(y, m - 1, 1));
}

export const CATEGORY_LABELS: Record<string, string> = {
  accommodation: "اقامت",
  food: "غذا",
  fuel: "بنزین",
  transport: "رفت‌وآمد",
  fun: "تفریح",
  gift: "هدیه",
  shopping: "خرید",
  other: "سایر",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  trip: "سفر",
  birthday: "تولد",
  gathering: "دورهمی",
  charity: "کار خیر",
  other: "سایر",
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  planned: "برنامه‌ریزی",
  active: "در جریان",
  closed: "بسته‌شده",
  cancelled: "لغو شده",
};

export const SPLIT_LABELS: Record<string, string> = {
  equal: "مساوی",
  exact: "مبلغ مشخص",
  percent: "درصدی",
  shares: "سهمی (وزنی)",
};

export const METHOD_LABELS: Record<string, string> = {
  cash: "نقدی",
  bank_transfer: "انتقال بانکی",
  other: "سایر",
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "مالک",
  admin: "مدیر",
  member: "عضو",
};
