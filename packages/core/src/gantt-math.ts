// ─────────────────────────────────────────────────────────────
//  gantry · gantt-math.ts
//  Pure coordinate engine. No Angular, no DOM.
//  Every function is deterministic: same input → same output.
//  Fully testable with Vitest / Jest in Node.
// ─────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);
dayjs.extend(advancedFormat);

import { ViewMode, HeaderCell, HeaderRow, GanttTask, GanttI18n, GanttLabels, TimeUnit } from './types';
import {
  DEFAULT_ZOOM_LEVELS,
  findZoomLevel,
  withLegacyHeaderFormats,
  buildTiers,
  unitStart,
  unitAdd,
  type ScaleTier,
} from './render/scales';

/** Re-exported for consumers of `generateHeaderRows` / public-api. */
export type { HeaderCell, HeaderRow };

// ─── Constants ───────────────────────────────────────────────

/** Pixels per day for each ViewMode at 1× zoom */
export const PX_PER_DAY: Record<ViewMode, number> = {
  [ViewMode.Hour]: 960,
  [ViewMode.Day]: 48,
  [ViewMode.Week]: 20,
  [ViewMode.Month]: 8,
  [ViewMode.Quarter]: 4,
  [ViewMode.Year]: 2,
};

/** Row header heights [top row px, bottom row px] */
export const HEADER_HEIGHTS: Record<ViewMode, [number, number]> = {
  [ViewMode.Hour]: [32, 28],
  [ViewMode.Day]: [32, 28],
  [ViewMode.Week]: [32, 28],
  [ViewMode.Month]: [32, 28],
  [ViewMode.Quarter]: [32, 28],
  [ViewMode.Year]: [32, 28],
};

// ─── Calendar time ────────────────────────────────────────────
//
// The x axis is measured in *local calendar days*: every local midnight sits
// exactly on a day boundary, whatever the day's real length (23 h / 25 h on
// daylight-saving changes). A plain `ms / 86_400_000` drifts by an hour per DST
// change and misplaces bars against the day cells.

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
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
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

/**
 * Compute the visible timeline range from an array of tasks: pad by
 * `paddingDays` on each side, then snap outwards to whole bottom-tier cells of
 * the view (so there are never partial "sliver" cells at the edges).
 */
export function getTimelineRange(
  tasks: GanttTask[],
  viewMode: ViewMode,
  paddingDays = 7,
  /** Optional reference date always kept inside the range (e.g. the "today" marker) */
  includeDate?: Date | null,
  weekStart: 0 | 1 = 1,
): TimelineRange {
  const level = findZoomLevel(DEFAULT_ZOOM_LEVELS, viewMode);
  return snapRange(tasks, level.scales[level.scales.length - 1], paddingDays, includeDate, weekStart);
}

/** Range snapped to whole cells of `scale` (shared by `getTimelineRange` and the timeline model). */
export function snapRange(
  tasks: GanttTask[],
  scale: { unit: TimeUnit; step?: number },
  paddingDays: number,
  includeDate?: Date | null,
  weekStart: 0 | 1 = 1,
  /** Reference "now" for the empty-data fallback range (keeps the result deterministic) */
  now: Date = new Date(),
): TimelineRange {
  const today = snapToDay(now);
  const extent = taskExtent(tasks, includeDate) ?? { start: addDays(today, -30), end: addDays(today, 60) };
  const step = scale.step ?? 1;
  const start = unitStart(addDays(extent.start, -paddingDays), scale.unit, step, weekStart);
  const lastCell = unitStart(addDays(extent.end, paddingDays), scale.unit, step, weekStart);
  const end =
    lastCell.getTime() === extent.end.getTime() && paddingDays === 0 ? lastCell : unitAdd(lastCell, scale.unit, step);
  return { start, end };
}

// ─── Header cell generation (legacy two-row API) ──────────────

/**
 * Generate the two-row header cells for one of the built-in view modes.
 * Returns [topRow, bottomRow]. Pass `i18n` to localise labels/formats.
 * (The configurable N-tier engine is `buildTiers` / `buildTimeline`.)
 */
export function generateHeaderRows(
  viewMode: ViewMode,
  start: Date,
  end: Date,
  pxPerDay: number,
  i18n?: GanttI18n,
): [HeaderRow, HeaderRow] {
  const level = findZoomLevel(DEFAULT_ZOOM_LEVELS, viewMode);
  const tiers = buildTiers({
    scales: withLegacyHeaderFormats(level, i18n),
    start,
    end,
    pxPerDay,
    heights: HEADER_HEIGHTS[viewMode] ?? [32, 28],
    locale: i18n?.locale,
    labels: i18n?.labels,
  });
  const toRow = (t: ScaleTier): HeaderRow => ({
    height: t.height,
    cells: t.cells.map(c => ({ label: c.label, x: c.x, width: c.width, dateKey: c.start.toISOString() })),
  });
  return [toRow(tiers[0]), toRow(tiers[tiers.length - 1])];
}

// ─── Grid line generation ─────────────────────────────────────

export interface GridLine {
  x: number;
  isMajor: boolean;
  label?: string;
}

/**
 * Returns vertical grid line positions (x coordinates).
 * Minor lines = bottom-row cell boundaries; major lines = real top-row period
 * boundaries (e.g. month starts in Week view, even mid-week).
 */
export function generateGridLines(viewMode: ViewMode, start: Date, end: Date, pxPerDay: number): GridLine[] {
  const [topRow, botRow] = generateHeaderRows(viewMode, start, end, pxPerDay);
  const major = new Set(topRow.cells.map(c => c.x).filter(x => x > 0));
  const lines: GridLine[] = [];
  for (const cell of botRow.cells) {
    if (cell.x > 0 && !major.has(cell.x)) lines.push({ x: cell.x, isMajor: false });
  }
  for (const x of major) lines.push({ x, isMajor: true });
  const last = botRow.cells.at(-1);
  if (last) lines.push({ x: last.x + last.width, isMajor: true });
  return lines.sort((a, b) => a.x - b.x);
}

// ─── Zoom helpers ─────────────────────────────────────────────

const VIEW_ORDER: ViewMode[] = [
  ViewMode.Hour,
  ViewMode.Day,
  ViewMode.Week,
  ViewMode.Month,
  ViewMode.Quarter,
  ViewMode.Year,
];

export function zoomIn(current: ViewMode): ViewMode {
  const idx = VIEW_ORDER.indexOf(current);
  return idx > 0 ? VIEW_ORDER[idx - 1] : current;
}

export function zoomOut(current: ViewMode): ViewMode {
  const idx = VIEW_ORDER.indexOf(current);
  return idx < VIEW_ORDER.length - 1 ? VIEW_ORDER[idx + 1] : current;
}

// ─── Utility ─────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatDate(date: Date, fmt = 'MMM D, YYYY', locale?: string): string {
  const d = toLocalDay(date);
  return (locale ? dayjs(d).locale(locale) : dayjs(d)).format(fmt);
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
