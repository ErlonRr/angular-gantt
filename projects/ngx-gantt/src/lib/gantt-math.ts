// ─────────────────────────────────────────────────────────────
//  ngx-gantt · gantt-math.ts
//  Pure coordinate engine. No Angular, no DOM.
//  Every function is deterministic: same input → same output.
//  Fully testable with Vitest / Jest in Node.
// ─────────────────────────────────────────────────────────────

import dayjs, { Dayjs } from 'dayjs';
import isoWeek  from 'dayjs/plugin/isoWeek';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

import { ViewMode, HeaderCell, HeaderRow, GanttTask } from './types';

/** Re-exported for consumers of `generateHeaderRows` / public-api. */
export type { HeaderCell, HeaderRow };

// ─── Constants ───────────────────────────────────────────────

/** Pixels per day for each ViewMode at 1× zoom */
export const PX_PER_DAY: Record<ViewMode, number> = {
  [ViewMode.Day]:     48,
  [ViewMode.Week]:    20,
  [ViewMode.Month]:    8,
  [ViewMode.Quarter]:  4,
  [ViewMode.Year]:     2,
};

/** Row header heights [top row px, bottom row px] */
export const HEADER_HEIGHTS: Record<ViewMode, [number, number]> = {
  [ViewMode.Day]:     [32, 28],
  [ViewMode.Week]:    [32, 28],
  [ViewMode.Month]:   [32, 28],
  [ViewMode.Quarter]: [32, 28],
  [ViewMode.Year]:    [32, 28],
};

// ─── Core coordinate functions ────────────────────────────────

/**
 * Convert a Date to an SVG x-coordinate.
 * @param date     The date to convert
 * @param origin   The date that maps to x=0
 * @param pxPerDay Pixels per calendar day
 */
export function dateToPixel(date: Date, origin: Date, pxPerDay: number): number {
  const diffMs  = date.getTime() - origin.getTime();
  const diffDays = diffMs / 86_400_000;
  return Math.round(diffDays * pxPerDay);
}

/**
 * Convert an SVG x-coordinate back to a Date.
 */
export function pixelToDate(px: number, origin: Date, pxPerDay: number): Date {
  const diffDays = px / pxPerDay;
  return new Date(origin.getTime() + diffDays * 86_400_000);
}

/**
 * Snap a date to the nearest day boundary (midnight UTC).
 */
export function snapToDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Add N calendar days to a date.
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Difference in calendar days (ceil) between two dates.
 */
export function diffDays(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

// ─── Timeline range ───────────────────────────────────────────

export interface TimelineRange {
  start: Date;
  end:   Date;
}

/**
 * Compute the visible timeline range from an array of tasks,
 * adding padding days on each side and snapping to view-mode boundaries.
 */
export function getTimelineRange(
  tasks: GanttTask[],
  viewMode: ViewMode,
  paddingDays = 7,
): TimelineRange {
  if (!tasks.length) {
    const today = snapToDay(new Date());
    return { start: addDays(today, -30), end: addDays(today, 60) };
  }

  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const t of tasks) {
    const s = t.start.getTime();
    const e = (t.end ?? t.start).getTime();
    if (s < minTime) minTime = s;
    if (e > maxTime) maxTime = e;
    if (t.baseline) {
      const bs = t.baseline.start.getTime();
      const be = t.baseline.end.getTime();
      if (bs < minTime) minTime = bs;
      if (be > maxTime) maxTime = be;
    }
  }

  // Snap task bounds first, then apply padding. If we pad *before* snapping, a
  // −7d nudge can land in late December and Year snap collapses to Jan 1 of
  // the *previous* calendar year — the chart shows an empty year (e.g. 2025)
  // while tasks sit in 2026 (bars off-screen to the right).
  const snappedStart = snapToViewMode(new Date(minTime), viewMode, 'start');
  const snappedEnd   = snapToViewMode(new Date(maxTime), viewMode, 'end');

  return {
    start: addDays(snappedStart, -paddingDays),
    end:   addDays(snappedEnd,   paddingDays),
  };
}

function snapToViewMode(date: Date, mode: ViewMode, edge: 'start' | 'end'): Date {
  const d = dayjs(date);
  if (edge === 'start') {
    switch (mode) {
      case ViewMode.Day:     return d.startOf('day').toDate();
      case ViewMode.Week:    return d.startOf('isoWeek').toDate();
      case ViewMode.Month:   return d.startOf('month').toDate();
      case ViewMode.Quarter: return d.startOf('quarter').toDate();
      case ViewMode.Year:    return d.startOf('year').toDate();
    }
  } else {
    switch (mode) {
      case ViewMode.Day:     return d.endOf('day').toDate();
      case ViewMode.Week:    return d.endOf('isoWeek').toDate();
      case ViewMode.Month:   return d.endOf('month').toDate();
      case ViewMode.Quarter: return d.endOf('quarter').toDate();
      case ViewMode.Year:    return d.endOf('year').toDate();
    }
  }
}

// ─── Header cell generation ───────────────────────────────────

/**
 * Generate the two-row header cells for the given timeline.
 * Returns [topRow, bottomRow].
 */
export function generateHeaderRows(
  viewMode: ViewMode,
  start: Date,
  end: Date,
  pxPerDay: number,
): [HeaderRow, HeaderRow] {
  const [topH, botH] = HEADER_HEIGHTS[viewMode];

  switch (viewMode) {
    case ViewMode.Day:     return generateDayHeader(start, end, pxPerDay, topH, botH);
    case ViewMode.Week:    return generateWeekHeader(start, end, pxPerDay, topH, botH);
    case ViewMode.Month:   return generateMonthHeader(start, end, pxPerDay, topH, botH);
    case ViewMode.Quarter: return generateQuarterHeader(start, end, pxPerDay, topH, botH);
    case ViewMode.Year:    return generateYearHeader(start, end, pxPerDay, topH, botH);
  }
}

// ── Day view: top = months, bottom = days ────────────────────

function generateDayHeader(
  start: Date, end: Date, pxPerDay: number,
  topH: number, botH: number,
): [HeaderRow, HeaderRow] {
  const origin = snapToDay(start);
  const topCells: HeaderCell[] = [];
  const botCells: HeaderCell[] = [];

  let cur = dayjs(origin).startOf('month');
  const finish = dayjs(end);

  while (cur.isBefore(finish)) {
    const monthStart = cur.toDate();
    const monthEnd   = cur.endOf('month').toDate();
    const clampStart = monthStart < origin ? origin : monthStart;
    const clampEnd   = monthEnd   > end    ? end    : monthEnd;
    const x     = dateToPixel(clampStart, origin, pxPerDay);
    const width = dateToPixel(clampEnd,   origin, pxPerDay) - x;
    topCells.push({ label: cur.format('MMMM YYYY'), x, width, dateKey: cur.toISOString() });
    cur = cur.add(1, 'month');
  }

  let dayCur = dayjs(origin);
  while (dayCur.isBefore(finish)) {
    const d     = dayCur.toDate();
    const x     = dateToPixel(d, origin, pxPerDay);
    const label = dayCur.format('D');
    botCells.push({ label, x, width: pxPerDay, dateKey: dayCur.toISOString() });
    dayCur = dayCur.add(1, 'day');
  }

  return [{ cells: topCells, height: topH }, { cells: botCells, height: botH }];
}

// ── Week view: top = months, bottom = week numbers ───────────

function generateWeekHeader(
  start: Date, end: Date, pxPerDay: number,
  topH: number, botH: number,
): [HeaderRow, HeaderRow] {
  const origin = snapToDay(start);
  const topCells: HeaderCell[] = [];
  const botCells: HeaderCell[] = [];

  // top: months
  let mCur = dayjs(origin).startOf('month');
  const finish = dayjs(end);
  while (mCur.isBefore(finish)) {
    const mEnd   = mCur.endOf('month').toDate();
    const clampS = mCur.toDate() < origin ? origin : mCur.toDate();
    const clampE = mEnd > end ? end : mEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    topCells.push({ label: mCur.format('MMM YYYY'), x, width, dateKey: mCur.toISOString() });
    mCur = mCur.add(1, 'month');
  }

  // bottom: weeks
  let wCur = dayjs(origin).startOf('isoWeek');
  while (wCur.isBefore(finish)) {
    const wEnd  = wCur.endOf('isoWeek').toDate();
    const clampS = wCur.toDate() < origin ? origin : wCur.toDate();
    const clampE = wEnd > end ? end : wEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    botCells.push({ label: `W${wCur.isoWeek()}`, x, width, dateKey: wCur.toISOString() });
    wCur = wCur.add(1, 'week');
  }

  return [{ cells: topCells, height: topH }, { cells: botCells, height: botH }];
}

// ── Month view: top = quarters, bottom = months ───────────────

function generateMonthHeader(
  start: Date, end: Date, pxPerDay: number,
  topH: number, botH: number,
): [HeaderRow, HeaderRow] {
  const origin = snapToDay(start);
  const topCells: HeaderCell[] = [];
  const botCells: HeaderCell[] = [];
  const finish = dayjs(end);

  // top: quarters
  let qCur = dayjs(origin).startOf('quarter');
  while (qCur.isBefore(finish)) {
    const qEnd   = qCur.endOf('quarter').toDate();
    const clampS = qCur.toDate() < origin ? origin : qCur.toDate();
    const clampE = qEnd > end ? end : qEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    topCells.push({ label: `Q${qCur.quarter()} ${qCur.format('YYYY')}`, x, width, dateKey: qCur.toISOString() });
    qCur = qCur.add(1, 'quarter');
  }

  // bottom: months
  let mCur = dayjs(origin).startOf('month');
  while (mCur.isBefore(finish)) {
    const mEnd   = mCur.endOf('month').toDate();
    const clampS = mCur.toDate() < origin ? origin : mCur.toDate();
    const clampE = mEnd > end ? end : mEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    botCells.push({ label: mCur.format('MMM'), x, width, dateKey: mCur.toISOString() });
    mCur = mCur.add(1, 'month');
  }

  return [{ cells: topCells, height: topH }, { cells: botCells, height: botH }];
}

// ── Quarter view: top = years, bottom = quarters ──────────────

function generateQuarterHeader(
  start: Date, end: Date, pxPerDay: number,
  topH: number, botH: number,
): [HeaderRow, HeaderRow] {
  const origin = snapToDay(start);
  const topCells: HeaderCell[] = [];
  const botCells: HeaderCell[] = [];
  const finish = dayjs(end);

  let yCur = dayjs(origin).startOf('year');
  while (yCur.isBefore(finish)) {
    const yEnd   = yCur.endOf('year').toDate();
    const clampS = yCur.toDate() < origin ? origin : yCur.toDate();
    const clampE = yEnd > end ? end : yEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    topCells.push({ label: yCur.format('YYYY'), x, width, dateKey: yCur.toISOString() });
    yCur = yCur.add(1, 'year');
  }

  let qCur = dayjs(origin).startOf('quarter');
  while (qCur.isBefore(finish)) {
    const qEnd   = qCur.endOf('quarter').toDate();
    const clampS = qCur.toDate() < origin ? origin : qCur.toDate();
    const clampE = qEnd > end ? end : qEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    botCells.push({ label: `Q${qCur.quarter()}`, x, width, dateKey: qCur.toISOString() });
    qCur = qCur.add(1, 'quarter');
  }

  return [{ cells: topCells, height: topH }, { cells: botCells, height: botH }];
}

// ── Year view: top = years, bottom = semesters ───────────────

function generateYearHeader(
  start: Date, end: Date, pxPerDay: number,
  topH: number, botH: number,
): [HeaderRow, HeaderRow] {
  const origin = snapToDay(start);
  const topCells: HeaderCell[] = [];
  const botCells: HeaderCell[] = [];
  const finish = dayjs(end);

  let yCur = dayjs(origin).startOf('year');
  while (yCur.isBefore(finish)) {
    const yEnd   = yCur.endOf('year').toDate();
    const clampS = yCur.toDate() < origin ? origin : yCur.toDate();
    const clampE = yEnd > end ? end : yEnd;
    const x     = dateToPixel(clampS, origin, pxPerDay);
    const width = dateToPixel(clampE, origin, pxPerDay) - x;
    topCells.push({ label: yCur.format('YYYY'), x, width, dateKey: yCur.toISOString() });

    // Two semesters per year
    for (const sem of [yCur.startOf('year'), yCur.month(6)]) {
      const sEnd   = sem.add(6, 'month').toDate();
      const scS    = sem.toDate() < origin ? origin : sem.toDate();
      const scE    = sEnd > end ? end : sEnd;
      if (scS >= scE) continue;
      const sx     = dateToPixel(scS, origin, pxPerDay);
      const sw     = dateToPixel(scE, origin, pxPerDay) - sx;
      botCells.push({ label: `H${sem.month() === 0 ? 1 : 2}`, x: sx, width: sw, dateKey: sem.toISOString() });
    }

    yCur = yCur.add(1, 'year');
  }

  return [{ cells: topCells, height: topH }, { cells: botCells, height: botH }];
}

// ─── Grid line generation ─────────────────────────────────────

export interface GridLine {
  x:      number;
  isMajor: boolean;
  label?:  string;
}

/**
 * Returns vertical grid line positions (x coordinates).
 * Major lines = top-row boundaries, minor lines = bottom-row boundaries.
 */
export function generateGridLines(
  viewMode: ViewMode,
  start: Date,
  end: Date,
  pxPerDay: number,
): GridLine[] {
  const [topRow, botRow] = generateHeaderRows(viewMode, start, end, pxPerDay);
  const lines: GridLine[] = [];

  const majorXs = new Set(topRow.cells.map(c => c.x));

  for (const cell of botRow.cells) {
    lines.push({ x: cell.x, isMajor: majorXs.has(cell.x) });
  }
  // Add end boundary of last cell
  const last = botRow.cells.at(-1);
  if (last) {
    lines.push({ x: last.x + last.width, isMajor: true });
  }

  return lines;
}

// ─── Zoom helpers ─────────────────────────────────────────────

const VIEW_ORDER: ViewMode[] = [
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

export function formatDate(date: Date, fmt = 'MMM D, YYYY'): string {
  return dayjs(date).format(fmt);
}

export function durationLabel(start: Date, end: Date): string {
  const days = diffDays(start, end);
  if (days < 1)  return '< 1 day';
  if (days === 1) return '1 day';
  if (days < 7)  return `${days} days`;
  const weeks = Math.floor(days / 7);
  const rem   = days % 7;
  if (rem === 0) return `${weeks}w`;
  return `${weeks}w ${rem}d`;
}
