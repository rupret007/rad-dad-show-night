import { SHOW_TIME_ZONE } from "./show-read-integrity.ts";

/** Show dates are wall-calendar days in the venue time zone. */
export const SHOW_CALENDAR_TIME_ZONE = SHOW_TIME_ZONE;

const MAX_SAME_DAY_MINUTES = 18 * 60;
const MAX_OVERNIGHT_MINUTES = 12 * 60;
const MIN_SPAN_MINUTES = 1;

const SHOW_CLOCK =
  /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;

function daysInGregorianMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function gregorianValid(year: number, month: number, day: number): boolean {
  if (year <= 0 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInGregorianMonth(year, month);
}

/** UTC-midnight round-trip used before R10 Karen fix; kept for regression tests. */
export function isCalendarDateUtcMidnight(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() > 0 &&
    date.toISOString().slice(0, 10) === value;
}

/**
 * True when value is a real YYYY-MM-DD civil calendar date (Gregorian).
 * Impossible month lengths are rejected without UTC Date rollover.
 */
export function isShowCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return gregorianValid(year, month, day);
}

/** Wall-calendar YYYY-MM-DD for an instant in the show time zone (tests). */
export function showCalendarYmdFromInstant(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOW_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

export function parseShowClock(value: string): number | null {
  const match = value.trim().match(SHOW_CLOCK);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return (hour % 12) * 60 + minute + (period === "PM" ? 720 : 0);
}

/**
 * Returns a user-facing error when paired hours are invalid; null when OK.
 */
export function pairedShowHoursError(startTime: string, endTime: string): string | null {
  const startMinutes = parseShowClock(startTime);
  const endMinutes = parseShowClock(endTime);
  if (startMinutes === null || endMinutes === null) {
    return "Choose valid start and end times for this night.";
  }
  if (startMinutes === endMinutes) {
    return "End time must be after start time for this night, or form a valid overnight span.";
  }
  if (endMinutes > startMinutes) {
    const span = endMinutes - startMinutes;
    if (span < MIN_SPAN_MINUTES || span > MAX_SAME_DAY_MINUTES) {
      return "Choose a realistic start-to-end span for this night.";
    }
    return null;
  }
  const overnightSpan = (24 * 60 - startMinutes) + endMinutes;
  if (overnightSpan < MIN_SPAN_MINUTES || overnightSpan > MAX_OVERNIGHT_MINUTES) {
    return "End time must be after start time for this night, or form a valid overnight span.";
  }
  return null;
}
