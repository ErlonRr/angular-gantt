// ─────────────────────────────────────────────────────────────
//  gantry · format/week.ts
//  ISO-8601 week, ISO week-year and quarter — pure calendar
//  arithmetic on the date's local fields (no time math, no DST).
// ─────────────────────────────────────────────────────────────

/** Days before the first of each month in a common year. */
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

/** Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 1-based ordinal day of the year of a local calendar date (Jan 1 → 1, Dec 31 → 365/366). */
export function dayOfYear(date: Date): number {
  const m = date.getMonth();
  return (DAYS_BEFORE_MONTH[m] ?? 0) + date.getDate() + (m > 1 && isLeapYear(date.getFullYear()) ? 1 : 0);
}

/** The Thursday of the ISO week (Monday → Sunday) holding `date`; it decides the week-year. */
function isoThursday(date: Date): Date {
  const t = new Date(date.getTime());
  // Noon keeps `setDate` clear of DST transitions; `setDate` (unlike `new Date(y, m, d)`)
  // also keeps years 0–99 as they are.
  t.setHours(12, 0, 0, 0);
  const isoDay = (date.getDay() + 6) % 7; // Monday 0 … Sunday 6
  t.setDate(t.getDate() - isoDay + 3);
  return t;
}

/** ISO-8601 week number (1–53): weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): number {
  return Math.floor((dayOfYear(isoThursday(date)) - 1) / 7) + 1;
}

/** ISO-8601 week-numbering year (differs from the calendar year around Jan 1). */
export function isoWeekYear(date: Date): number {
  return isoThursday(date).getFullYear();
}

/** Calendar quarter, 1–4. */
export function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}
