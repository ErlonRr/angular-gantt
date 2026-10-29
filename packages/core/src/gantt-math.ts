// ─────────────────────────────────────────────────────────────
//  gantry · gantt-math.ts
//  Pure coordinate engine. No Angular, no DOM.
//  Every function is deterministic: same input → same output.
//  Fully testable with Vitest / Jest in Node.
// ─────────────────────────────────────────────────────────────

import { type GanttTask, type GanttLabels, type TimeUnit, type WeekStart } from './types';
import { unitStart, periodNext } from './render/scales';
import { formatDate as formatPattern } from './format/format';
import { HOUR_MS } from './calendar/time';

// ─── Constants ───────────────────────────────────────────────

// ─── Calendar time ────────────────────────────────────────────
//
// The x axis is measured in *local calendar days*: every local midnight sits
// exactly on a day boundary, whatever the day's real length (23 h / 25 h on
// daylight-saving changes). A plain `ms / 86_400_000` drifts by an hour per DST
// change and misplaces bars against the day cells.

// The one legitimate ms-per-day: converting a UTC calendar date to a day number
// eslint-disable-next-line no-restricted-syntax
const DAY_MS = 86_400_000;

/** `true` for dates like `new Date('2026-01-05')`: midnight UTC, not local midnight. */
export function isUtcDateOnly(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0 &&
    d.getTimezoneOffset() !== 0
  );
}

/**
 * Read a date-only value (UTC midnight from an ISO `YYYY-MM-DD` string) as that
 * calendar day at local midnight. Other dates are returned unchanged.
 */
export function toLocalDay(d: Date): Date {
  return isUtcDateOnly(d) ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : d;
}

/**
 * Parse a date for Gantry: `'YYYY-MM-DD'` strings become *local* midnight
 * (the JS default is UTC midnight), anything else goes through `new Date()`.
 */
export function parseDate(input: string | number | Date): Date {
  if (typeof input === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(input);
}

/** Fractional local-calendar days since 1970-01-01. */
export function calendarDays(date: Date, normalizeDateOnly = true): number {
  const d = normalizeDateOnly ? toLocalDay(date) : date;
  const y = d.getFullYear(),
    m = d.getMonth(),
    day = d.getDate();
  const midnight = new Date(y, m, day).getTime();
  const next = new Date(y, m, day + 1).getTime();
  return Math.round(Date.UTC(y, m, day) / DAY_MS) + (d.getTime() - midnight) / (next - midnight);
}

/** Inverse of `calendarDays`. */
export function fromCalendarDays(value: number): Date {
  const whole = Math.floor(value);
  const base = new Date(whole * DAY_MS);
  const y = base.getUTCFullYear(),
    m = base.getUTCMonth(),
    day = base.getUTCDate();
  const midnight = new Date(y, m, day).getTime();
  const next = new Date(y, m, day + 1).getTime();
  return new Date(midnight + (value - whole) * (next - midnight));
}

// ─── Core coordinate functions ────────────────────────────────

/**
 * Convert a Date to an SVG x-coordinate.
 * @param date     The date to convert
 * @param origin   The date that maps to x=0
 * @param pxPerDay Pixels per calendar day
 */
export function dateToPixel(date: Date, origin: Date, pxPerDay: number): number {
  return Math.round((calendarDays(date) - calendarDays(origin)) * pxPerDay);
}

/**
 * Convert an SVG x-coordinate back to a Date.
 */
export function pixelToDate(px: number, origin: Date, pxPerDay: number): Date {
  return fromCalendarDays(calendarDays(origin) + px / pxPerDay);
}

/**
 * Snap a date to the start of its local calendar day.
 */
export function snapToDay(date: Date): Date {
  const d = new Date(toLocalDay(date));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Add N calendar days to a date, keeping its time of day (and keeping
 * date-only UTC values date-only).
 */
export function addDays(date: Date, days: number): Date {
  if (isUtcDateOnly(date)) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  }
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

/**
 * The shift from `from` to `to` in days: whole local calendar days when the time of day is kept
 * (date-only values, day snapping, across DST), else the elapsed hours / 24 (hour snapping). The
 * amount of `daysMoved` and `daysDelta`, also under a working calendar (the real calendar shift).
 */
export function dateShiftDays(from: Date, to: Date): number {
  const days = calendarDays(to) - calendarDays(from);
  const whole = Math.round(days);
  if (Math.abs(days - whole) < 1e-9) return whole + 0;
  return (to.getTime() - from.getTime()) / HOUR_MS / 24;
}

/**
 * Difference in calendar days (partial days round up) between two dates.
 */
export function diffDays(a: Date, b: Date): number {
  return Math.ceil(calendarDays(b) - calendarDays(a) - 1e-9) || 0;
}

// ─── Timeline range ───────────────────────────────────────────

export interface TimelineRange {
  start: Date;
  end: Date;
}

/** Earliest start / latest end over tasks and their baselines (null when empty). */
export function taskExtent(tasks: GanttTask[], includeDate?: Date | null): TimelineRange | null {
  let minTime = Infinity;
  let maxTime = -Infinity;
  const take = (d: Date) => {
    const t = toLocalDay(d).getTime();
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  };
  for (const t of tasks) {
    take(t.start);
    take(t.end ?? t.start);
    if (t.baseline) {
      take(t.baseline.start);
      take(t.baseline.end);
    }
  }
  // Keep the reference date (today) inside the range so its marker is visible
  if (includeDate) take(includeDate);
  return isFinite(minTime) ? { start: new Date(minTime), end: new Date(maxTime) } : null;
}

/** Range snapped to whole cells of `scale` (shared by `getTimelineRange` and the timeline model). */
export function snapRange(
  tasks: GanttTask[],
  scale: { unit: TimeUnit; step?: number | undefined },
  paddingDays: number,
  includeDate?: Date | null,
  weekStart: WeekStart = 1,
  /** Reference "now" for the empty-data fallback range (keeps the result deterministic) */
  now: Date = new Date(),
): TimelineRange {
  const today = snapToDay(now);
  const extent = taskExtent(tasks, includeDate) ?? { start: addDays(today, -30), end: addDays(today, 60) };
  const step = scale.step ?? 1;
  const start = unitStart(addDays(extent.start, -paddingDays), scale.unit, step, weekStart);
  const lastCell = unitStart(addDays(extent.end, paddingDays), scale.unit, step, weekStart);
  const end =
    lastCell.getTime() === extent.end.getTime() && paddingDays === 0
      ? lastCell
      : periodNext(lastCell, scale.unit, step);
  return { start, end };
}

// ─── Header cell generation (legacy two-row API) ──────────────

// ─── Grid line generation ─────────────────────────────────────

// ─── Zoom helpers ─────────────────────────────────────────────

// ─── Utility ─────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatDate(date: Date, fmt = 'MMM D, YYYY', locale?: string): string {
  return formatPattern(toLocalDay(date), fmt, locale);
}

export function durationLabel(start: Date, end: Date, labels?: Partial<GanttLabels>): string {
  const days = diffDays(start, end);
  if (days < 1) return labels?.durationLessThanDay ?? '< 1 day';
  if (days === 1) return labels?.durationDay ?? '1 day';
  if (days < 7) return labels?.durationDays ? labels.durationDays(days) : `${days} days`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  if (rem === 0) return labels?.durationWeeks ? labels.durationWeeks(weeks) : `${weeks}w`;
  return labels?.durationWeeksDays ? labels.durationWeeksDays(weeks, rem) : `${weeks}w ${rem}d`;
}
