import { getDate, getDaysInMonth, getMonth, getYear, newDate } from "date-fns-jalali";
import { DomainError } from "./errors";

/**
 * Time contract:
 * - an instant (event start, deadlines) is stored as timestamptz (UTC) plus the event's IANA zone;
 * - a calendar day without time is stored as an ISO "YYYY-MM-DD" (Gregorian) date;
 * - a yearly birthday is stored in the calendar the person chose (Jalali or Gregorian) as
 *   month/day (+ optional year), so its yearly recurrence never drifts between calendars.
 * The Jalali calendar is a display/input layer only.
 */
export type BirthCalendar = "jalali" | "gregorian";

export const DEFAULT_TIMEZONE = "Asia/Tehran";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

const JALALI_MAX = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30];
const GREGORIAN_MAX = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function validateBirthday(calendar: BirthCalendar, month: number, day: number, year?: number | null): void {
  const max = calendar === "jalali" ? JALALI_MAX : GREGORIAN_MAX;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > max[month - 1]) {
    throw new DomainError("birthday.invalid", "روز و ماه تولد معتبر نیست.");
  }
  if (year != null) {
    const ok = calendar === "jalali" ? year >= 1300 && year <= 1500 : year >= 1920 && year <= 2120;
    if (!Number.isInteger(year) || !ok) throw new DomainError("birthday.invalid", "سال تولد معتبر نیست.");
  }
}

/** The birthday's date in a given year of its own calendar; a day missing that year (Esfand 30, Feb 29) falls back to the month's last day. */
function occurrence(calendar: BirthCalendar, year: number, month: number, day: number): Date {
  if (calendar === "jalali") {
    const dim = getDaysInMonth(newDate(year, month - 1, 1));
    const d = newDate(year, month - 1, Math.min(day, dim));
    d.setHours(12);
    return d;
  }
  const dim = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, dim), 12);
}

export interface NextBirthday {
  iso: string;
  daysUntil: number;
  /** Age turned on that day, when the birth year is known. */
  turning: number | null;
}

/** Next occurrence on or after `todayIso` (Gregorian ISO date). */
export function nextBirthday(
  calendar: BirthCalendar,
  month: number,
  day: number,
  todayIso: string,
  birthYear?: number | null,
): NextBirthday {
  validateBirthday(calendar, month, day, birthYear);
  const today = parseIso(todayIso);
  const year = calendar === "jalali" ? getYear(today) : today.getFullYear();
  let when = occurrence(calendar, year, month, day);
  let whenYear = year;
  if (isoOf(when) < todayIso) {
    whenYear = year + 1;
    when = occurrence(calendar, whenYear, month, day);
  }
  const daysUntil = Math.round((when.getTime() - today.getTime()) / 86_400_000);
  return { iso: isoOf(when), daysUntil, turning: birthYear ? whenYear - birthYear : null };
}

/** Jalali parts of a Gregorian ISO date (for prefilling forms). */
export function jalaliPartsOf(iso: string): { y: number; m: number; d: number } {
  const date = parseIso(iso);
  return { y: getYear(date), m: getMonth(date) + 1, d: getDate(date) };
}

/** Offset (minutes) of `timeZone` from UTC at the given instant. */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant) / 60_000);
}

/** Local wall-clock time in `timeZone` → UTC instant. "2026-10-05" + "19:30" in Tehran → 16:00Z. */
export function zonedTimeToUtc(dateIso: string, hhmm: string, timeZone = DEFAULT_TIMEZONE): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m || !t) throw new DomainError("time.invalid", "تاریخ یا ساعت معتبر نیست.");
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  let result = guess - zoneOffsetMinutes(guess, timeZone) * 60_000;
  // Re-check once at the result in case an offset change lies between the two instants.
  result = guess - zoneOffsetMinutes(result, timeZone) * 60_000;
  return new Date(result);
}

/** UTC instant → wall-clock parts in `timeZone`. */
export function utcToZoned(instant: Date, timeZone = DEFAULT_TIMEZONE): { dateIso: string; hhmm: string } {
  const offset = zoneOffsetMinutes(instant.getTime(), timeZone);
  const local = new Date(instant.getTime() + offset * 60_000);
  return {
    dateIso: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    hhmm: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}
