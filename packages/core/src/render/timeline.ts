// ─────────────────────────────────────────────────────────────
//  gantry · render/timeline.ts
//  The timeline render model: range, header tiers, period delimiters,
//  non-working-time bands, "today" and per-row bar geometry.
// ─────────────────────────────────────────────────────────────

import type { GanttTask, GanttFlatRow, RowGeometry, GanttI18n, TimeUnit } from '../types';
import { calendarDays, fromCalendarDays, snapRange, toLocalDay, addDays } from '../gantt-math';
import { buildTiers, unitAdd, unitBoundaries, unitStart, type ScaleTier } from './scales';
import type { ResolvedGanttConfig } from './config';

export type TimeBandKind = 'weekend' | 'holiday' | 'off-hours' | 'intensive' | 'custom';

export interface TimeBand {
  x:          number;
  width:      number;
  kind:       TimeBandKind;
  color:      string;
  className?: string;
  label?:     string;
}

export interface TimelineModel {
  start:        Date;
  end:          Date;
  pxPerDay:     number;
  totalWidth:   number;
  headerHeight: number;
  tiers:        ScaleTier[];
  /** x of the bottom-tier cell boundaries that aren't major delimiters */
  minorLines:   number[];
  /** x of the period delimiters (month / year / day…) */
  majorLines:   number[];
  bands:        TimeBand[];
  /** x of "now", or -1 when out of range / hidden */
  todayX:       number;
  toX(date: Date): number;
  toDate(x: number): Date;
}

export interface TimelineInput {
  tasks:          GanttTask[];
  config:         ResolvedGanttConfig;
  /** Visible width of the timeline viewport (for `fitToWidth`) */
  viewportWidth?: number;
  i18n?:          GanttI18n;
  now?:           Date;
}

// ─── Task dates as drawn ──────────────────────────────────────

/**
 * Start / end a task occupies on the timeline. Date-only values are read in
 * local time; with `endDateMode: 'inclusive'` a midnight end covers that day.
 */
export function taskSpan(
  task: Pick<GanttTask, 'start' | 'end'>,
  config: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>,
): { start: Date; end: Date } {
  const norm = (d: Date) => (config.normalizeDateOnly ? toLocalDay(d) : d);
  const start = norm(task.start);
  let end = norm(task.end ?? task.start);
  if (config.endDateMode === 'inclusive' && isMidnight(end) && end >= start) end = addDays(end, 1);
  return { start, end };
}

/** Inverse of `taskSpan` for the end date (used when emitting drag/resize results). */
export function spanEndToTaskEnd(end: Date, config: Pick<ResolvedGanttConfig, 'endDateMode'>): Date {
  return config.endDateMode === 'inclusive' && isMidnight(toLocalDay(end)) ? addDays(end, -1) : end;
}

const isMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;

// ─── Timeline model ───────────────────────────────────────────

export function buildTimeline(input: TimelineInput): TimelineModel {
  const { config: cfg, i18n, now = new Date() } = input;
  const bottom = cfg.scales[cfg.scales.length - 1];
  const step = bottom.step ?? 1;

  const spans = input.tasks.map(t => {
    const s = taskSpan(t, cfg);
    return { start: s.start, end: s.end, baseline: t.baseline } as GanttTask;
  });
  let { start, end } = snapRange(
    spans, bottom, cfg.timelinePadding, cfg.showToday ? now : null, cfg.weekStart,
  );

  const pxPerDay = cfg.pxPerDay;
  const startDays = calendarDays(start, cfg.normalizeDateOnly);
  const toX = (d: Date) => Math.round((calendarDays(d, cfg.normalizeDateOnly) - startDays) * pxPerDay);
  const toDate = (x: number) => fromCalendarDays(startDays + x / pxPerDay);

  // Fill the viewport: extend by whole bottom cells
  if (cfg.fitToWidth && input.viewportWidth) {
    for (let i = 0; toX(end) < input.viewportWidth && i < 10_000; i++) end = unitAdd(end, bottom.unit, step);
  }
  const totalWidth = toX(end);

  const tiers = buildTiers({
    scales: cfg.scales,
    start, end, pxPerDay,
    heights: cfg.tierHeights,
    weekStart: cfg.weekStart,
    locale: i18n?.locale,
    labels: i18n?.labels,
    now,
  });

  // Delimiters: major = boundaries of `majorUnit` (default: the tier above the bottom one)
  const majorScale = cfg.gridLines.majorUnit
    ? { unit: cfg.gridLines.majorUnit, step: 1 }
    : cfg.scales.length > 1 ? cfg.scales[cfg.scales.length - 2] : null;
  const majorLines = majorScale
    ? unitBoundaries(start, end, majorScale.unit, majorScale.step ?? 1, cfg.weekStart)
        .map(toX).filter(x => x > 0 && x < totalWidth)
    : [];
  const majorSet = new Set(majorLines);
  const bottomTier = tiers[tiers.length - 1];
  const minorLines = bottomTier.cells.map(c => c.x).filter(x => x > 0 && !majorSet.has(x));

  const todayX = cfg.showToday ? toX(now) : -1;

  return {
    start, end, pxPerDay, totalWidth,
    headerHeight: tiers.reduce((h, t) => h + t.height, 0),
    tiers,
    minorLines,
    majorLines,
    bands: computeTimeBands(start, end, pxPerDay, cfg, toX),
    todayX: todayX >= 0 && todayX <= totalWidth ? todayX : -1,
    toX,
    toDate,
  };
}

// ─── Non-working time ─────────────────────────────────────────

const HOUR_SCALE_MIN_PX_PER_HOUR = 6;

/**
 * Shaded bands for weekends, holidays, off-hours, intensive hours and the
 * `highlightTime` callback. Contiguous bands of the same kind/colour merge.
 */
export function computeTimeBands(
  start: Date, end: Date, pxPerDay: number,
  cfg: Pick<ResolvedGanttConfig, 'nonWorking' | 'highlightTime' | 'theme'>,
  toX: (d: Date) => number,
): TimeBand[] {
  const nw = cfg.nonWorking;
  const theme = cfg.theme;
  const bands: TimeBand[] = [];
  const minPx = nw?.minPxPerDay ?? 12;
  if ((!nw && !cfg.highlightTime) || pxPerDay < minPx) return bands;

  const push = (from: Date, to: Date, kind: TimeBandKind, color: string, extra?: { className?: string; label?: string }) => {
    const x = toX(from);
    const width = toX(to) - x;
    if (width <= 0) return;
    const prev = bands[bands.length - 1];
    if (prev && prev.kind === kind && prev.color === color && prev.className === extra?.className
        && prev.x + prev.width === x && prev.label === extra?.label) {
      prev.width += width;
    } else {
      bands.push({ x, width, kind, color, ...extra });
    }
  };

  const hourScale = pxPerDay / 24 >= HOUR_SCALE_MIN_PX_PER_HOUR;
  const days = unitBoundaries(start, end, 'day', 1, 1);

  for (const day of days) {
    const next = unitAdd(day, 'day', 1);
    const epoch = Math.floor(calendarDays(day));
    const holiday = nw?.holidays.find(h => epoch >= h.from && epoch <= h.to);
    const custom = cfg.highlightTime?.(day, 'day');

    if (holiday) {
      push(day, next, 'holiday', holiday.color ?? theme.holidayBg, { label: holiday.label });
      continue;
    }
    if (nw?.weekends.has(day.getDay())) {
      push(day, next, 'weekend', theme.weekendBg);
      continue;
    }
    if (custom) push(day, next, 'custom', custom.color ?? theme.weekendBg, { className: custom.className, label: custom.label });

    if (!hourScale || !nw) continue;
    // Off-hours = complement of the working ranges for this weekday
    if (nw.workingHours) {
      const ranges = [...nw.workingHours(day.getDay())].sort((a, b) => a.start - b.start);
      let cursor = 0;
      for (const r of ranges) {
        if (r.start > cursor) push(at(day, cursor), at(day, r.start), 'off-hours', theme.offHoursBg);
        cursor = Math.max(cursor, r.end);
      }
      if (cursor < 24) push(at(day, cursor), next, 'off-hours', theme.offHoursBg);
    }
    for (const r of nw.intensive) {
      push(at(day, r.start), at(day, r.end), 'intensive', r.color ?? theme.intensiveBg, { label: r.label });
    }
  }

  if (hourScale && cfg.highlightTime) {
    for (const hour of unitBoundaries(start, end, 'hour', 1, 1)) {
      const h = cfg.highlightTime(hour, 'hour');
      if (h) push(hour, unitAdd(hour, 'hour', 1), 'custom', h.color ?? theme.intensiveBg, { className: h.className, label: h.label });
    }
  }
  return bands;
}

/** `day` at a fractional hour (8.5 → 08:30). */
function at(day: Date, hour: number): Date {
  const h = Math.floor(hour);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Math.round((hour - h) * 60));
}

// ─── Row geometry ─────────────────────────────────────────────

/** Bar x/width for every visible row (shared by both bindings). */
export function computeRowGeometries(
  rows: GanttFlatRow[],
  timeline: Pick<TimelineModel, 'toX'>,
  cfg: Pick<ResolvedGanttConfig, 'rowHeight' | 'endDateMode' | 'normalizeDateOnly' | 'bar'>,
): RowGeometry[] {
  const rh = cfg.rowHeight;
  return rows.map(row => {
    const span = taskSpan(row.task, cfg);
    const barX = timeline.toX(span.start);
    const isMilestone = row.barType === 'milestone';
    const barWidth = isMilestone ? 0 : Math.max(timeline.toX(span.end) - barX, cfg.bar.minWidth);
    const progress = Math.min(Math.max(row.task.progress ?? 0, 0), 100);
    return { row, y: row.visibleIndex * rh, height: rh, barX, barWidth, progressWidth: (barWidth * progress) / 100 };
  });
}

/** Start of the bottom-tier cell containing `date` (for snapping). */
export function snapToUnit(date: Date, unit: TimeUnit, step = 1, weekStart: 0 | 1 = 1): Date {
  return unitStart(date, unit, step, weekStart);
}
