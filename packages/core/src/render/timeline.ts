// ─────────────────────────────────────────────────────────────
//  gantry · render/timeline.ts
//  The timeline render model: range, header tiers, period delimiters,
//  non-working-time bands, "today" and per-row bar geometry.
// ─────────────────────────────────────────────────────────────

import type { GanttTask, GanttFlatRow, RowGeometry, GanttI18n, TimeUnit, WeekStart } from '../types';
import { calendarDays, fromCalendarDays, snapRange, toLocalDay, addDays, type TimelineRange } from '../gantt-math';
import { bottomScale, buildTiers, periodNext, unitAdd, unitBoundaries, unitStart, type ScaleTier } from './scales';
import type { ResolvedGanttConfig } from './config';
import { themeVar, type Paint } from './paint';

export type TimeBandKind = 'weekend' | 'holiday' | 'off-hours' | 'intensive' | 'custom';

export interface TimeBand {
  x: number;
  width: number;
  kind: TimeBandKind;
  /** Explicit holiday / intensive / highlight colour, else the theme token (`var(--gantt-weekend-bg)`…) */
  paint: Paint;
  className?: string | undefined;
  label?: string | undefined;
}

export interface TimelineModel {
  /** First date of the timeline (x 0): the natural range's start, or the shared range's when earlier */
  start: Date;
  /** Last date of the timeline: the range's end, extended to fill the viewport with `fitToWidth` */
  end: Date;
  /**
   * The chart's own range before the shared range and the viewport fill: its tasks (and today
   * with `showToday`), padded and snapped to the bottom scale — what {@link timelineRange}
   * returns, and what a sync group member reports.
   */
  range: TimelineRange;
  pxPerDay: number;
  totalWidth: number;
  headerHeight: number;
  tiers: ScaleTier[];
  /** x of the bottom-tier cell boundaries that aren't major delimiters */
  minorLines: number[];
  /** x of the period delimiters (month / year / day…) */
  majorLines: number[];
  bands: TimeBand[];
  /** x of "now", or -1 when out of range / hidden */
  todayX: number;
  /** Earliest start and latest end of the tasks as drawn (null without tasks) */
  extent: { start: Date; end: Date } | null;
  /**
   * Union of {@link extent} and the shared extent of a sync group (`TimelineInput.shared`), or
   * `null` outside a group / while the group has no extent. "Fit to screen" inside a group fits
   * `sharedExtent ?? extent`.
   */
  sharedExtent: { start: Date; end: Date } | null;
  /** Calendar date → timeline x (closures: safe to pass around unbound) */
  toX: (date: Date) => number;
  toDate: (x: number) => Date;
}

/**
 * Range and extent shared by the charts of a sync group (`GanttSyncState` fits): unions over
 * the members' {@link timelineRange} results.
 */
export interface SharedTimelineRange {
  /** Union of the members' natural ranges: the timeline covers at least this range */
  range?: TimelineRange | null | undefined;
  /** Union of the members' task extents (→ `TimelineModel.sharedExtent`) */
  extent?: TimelineRange | null | undefined;
}

export interface TimelineInput {
  tasks: GanttTask[];
  config: ResolvedGanttConfig;
  /** Visible width of the timeline viewport (for `fitToWidth`) */
  viewportWidth?: number | undefined;
  i18n?: GanttI18n | undefined;
  now?: Date | undefined;
  /**
   * Range shared with other charts (a sync group): the timeline starts at the earlier and ends at
   * the later of its own range and `shared.range`, so charts with the same start and px per day
   * place every date at the same x.
   */
  shared?: SharedTimelineRange | null | undefined;
}

export interface TimelineRangeInput {
  tasks: readonly GanttTask[];
  config: Pick<
    ResolvedGanttConfig,
    'scales' | 'timelinePadding' | 'showToday' | 'weekStart' | 'endDateMode' | 'normalizeDateOnly'
  >;
  now?: Date | undefined;
}

/** A chart's natural range (see {@link timelineRange}). */
export interface NaturalTimelineRange {
  /** Tasks, baselines (and today with `showToday`), padded by `timelinePadding`, snapped to the bottom scale */
  range: TimelineRange;
  /** Earliest start and latest end of the tasks as drawn (null without tasks) */
  extent: TimelineRange | null;
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

// ─── Natural range ────────────────────────────────────────────

/**
 * A chart's natural range: the extent of its tasks as drawn, and the range that covers the
 * tasks, their baselines and (with `showToday`) `now`, padded by `timelinePadding` and snapped
 * to whole cells of the bottom scale. It is the timeline before any shared range and before the
 * viewport fill (`TimelineModel.range` / `.extent`).
 *
 * A sync group member reports this, never the timeline it draws: the group's union then has no
 * feedback loop, and a member that leaves takes its range out of the union.
 */
export function timelineRange(input: TimelineRangeInput): NaturalTimelineRange {
  const { config: cfg, now = new Date() } = input;
  const spans = input.tasks.map(t => {
    const s = taskSpan(t, cfg);
    return { start: s.start, end: s.end, baseline: t.baseline } as GanttTask;
  });
  let extent: TimelineRange | null = null;
  for (const s of spans) {
    if (!extent) extent = { start: s.start, end: s.end };
    else {
      if (s.start < extent.start) extent.start = s.start;
      if (s.end > extent.end) extent.end = s.end;
    }
  }
  const range = snapRange(
    spans,
    bottomScale(cfg.scales),
    cfg.timelinePadding,
    cfg.showToday ? now : null,
    cfg.weekStart,
    now,
  );
  return { range, extent };
}

/** A copy of `r` when both its dates are valid, else `null` (shared input is not trusted blindly). */
const validRange = (r: TimelineRange | null | undefined): TimelineRange | null =>
  r && Number.isFinite(r.start.getTime()) && Number.isFinite(r.end.getTime())
    ? { start: new Date(r.start.getTime()), end: new Date(r.end.getTime()) }
    : null;

/** Earliest start and latest end of `a` and `b` (either may be null). */
function unionRange(a: TimelineRange | null, b: TimelineRange | null): TimelineRange | null {
  if (!a || !b) return a ?? b;
  return { start: a.start <= b.start ? a.start : b.start, end: a.end >= b.end ? a.end : b.end };
}

// ─── Timeline model ───────────────────────────────────────────

export function buildTimeline(input: TimelineInput): TimelineModel {
  const { config: cfg, i18n, now = new Date() } = input;
  const bottom = bottomScale(cfg.scales);
  const step = bottom.step ?? 1;

  const { range, extent } = timelineRange({ tasks: input.tasks, config: cfg, now });
  // Inside a sync group: start at the earliest and end at the latest of the shared and own ranges
  const sharedRange = validRange(input.shared?.range);
  const sharedExtentIn = validRange(input.shared?.extent);
  const covered = sharedRange ? (unionRange(range, sharedRange) ?? range) : range;
  const start = covered.start;
  let end = covered.end;
  const sharedExtent = sharedExtentIn ? unionRange(extent && { ...extent }, sharedExtentIn) : null;

  const pxPerDay = cfg.pxPerDay;
  // The range, scale cells, bands and `now` are local dates: they are placed without date-only
  // normalisation (an hour boundary on UTC midnight is not a date-only value). `toX` is for
  // user dates and normalises them per `normalizeDateOnly`.
  const startDays = calendarDays(start, false);
  const localX = (d: Date) => Math.round((calendarDays(d, false) - startDays) * pxPerDay);
  const toX = (d: Date) => Math.round((calendarDays(d, cfg.normalizeDateOnly) - startDays) * pxPerDay);
  const toDate = (x: number) => fromCalendarDays(startDays + x / pxPerDay);

  // Fill the viewport: extend by whole bottom cells
  if (cfg.fitToWidth && input.viewportWidth) {
    for (let i = 0; localX(end) < input.viewportWidth && i < 10_000; i++) end = periodNext(end, bottom.unit, step);
  }
  const totalWidth = localX(end);

  const tiers = buildTiers({
    scales: cfg.scales,
    start,
    end,
    pxPerDay,
    heights: cfg.tierHeights,
    weekStart: cfg.weekStart,
    week: cfg.week,
    locale: i18n?.locale,
    labels: i18n?.labels,
    now,
    normalizeDateOnly: false,
  });

  // Delimiters: major = boundaries of `majorUnit` (default: the tier above the bottom one)
  const majorScale = cfg.gridLines.majorUnit
    ? { unit: cfg.gridLines.majorUnit, step: 1 }
    : cfg.scales.length > 1
      ? cfg.scales[cfg.scales.length - 2]
      : null;
  const majorLines = majorScale
    ? unitBoundaries(start, end, majorScale.unit, majorScale.step ?? 1, cfg.weekStart)
        .map(localX)
        .filter(x => x > 0 && x < totalWidth)
    : [];
  const majorSet = new Set(majorLines);
  const bottomTier = tiers.at(-1);
  const minorLines = (bottomTier?.cells ?? []).map(c => c.x).filter(x => x > 0 && !majorSet.has(x));

  const todayX = cfg.showToday ? localX(now) : -1;

  return {
    start,
    end,
    range,
    pxPerDay,
    totalWidth,
    headerHeight: tiers.reduce((h, t) => h + t.height, 0),
    tiers,
    minorLines,
    majorLines,
    bands: computeTimeBands(start, end, pxPerDay, cfg, localX),
    todayX: todayX >= 0 && todayX <= totalWidth ? todayX : -1,
    extent,
    sharedExtent,
    toX,
    toDate,
  };
}

// ─── Non-working time ─────────────────────────────────────────

const HOUR_SCALE_MIN_PX_PER_HOUR = 6;
const WEEKEND = themeVar('weekendBg');
const HOLIDAY = themeVar('holidayBg');
const OFF_HOURS = themeVar('offHoursBg');
const INTENSIVE = themeVar('intensiveBg');
/** `nonWorkingTime.style: 'disabled'`: one neutral grey for all non-working time */
const DISABLED = themeVar('borderColor');

/**
 * Shaded bands for weekends, holidays, off-hours, intensive hours and the
 * `highlightTime` callback. Contiguous bands of the same kind and paint merge.
 */
export function computeTimeBands(
  start: Date,
  end: Date,
  pxPerDay: number,
  cfg: Pick<ResolvedGanttConfig, 'nonWorking' | 'highlightTime'>,
  toX: (d: Date) => number,
): TimeBand[] {
  const nw = cfg.nonWorking;
  const bands: TimeBand[] = [];
  const minPx = nw?.minPxPerDay ?? 12;
  if ((!nw && !cfg.highlightTime) || pxPerDay < minPx) return bands;

  const push = (
    from: Date,
    to: Date,
    kind: TimeBandKind,
    paint: Paint,
    extra?: { className?: string | undefined; label?: string | undefined },
  ) => {
    const x = toX(from);
    const width = toX(to) - x;
    if (width <= 0) return;
    const prev = bands[bands.length - 1];
    if (
      prev &&
      prev.kind === kind &&
      prev.paint === paint &&
      prev.className === extra?.className &&
      prev.x + prev.width === x &&
      prev.label === extra?.label
    ) {
      prev.width += width;
    } else {
      bands.push({ x, width, kind, paint, ...extra });
    }
  };

  const hourScale = pxPerDay / 24 >= HOUR_SCALE_MIN_PX_PER_HOUR;
  const days = unitBoundaries(start, end, 'day', 1, 1);
  // 'disabled' greys out weekends, holidays (unless they have their own colour) and off-hours alike
  const greyed = nw?.style === 'disabled';

  for (const day of days) {
    const next = unitAdd(day, 'day', 1);
    const epoch = Math.floor(calendarDays(day));
    const holiday = nw?.holidayByDay.get(epoch);
    const custom = cfg.highlightTime?.(day, 'day');

    if (holiday) {
      push(day, next, 'holiday', holiday.color ?? (greyed ? DISABLED : HOLIDAY), { label: holiday.label });
      continue;
    }
    if (nw?.weekends.has(day.getDay())) {
      push(day, next, 'weekend', greyed ? DISABLED : WEEKEND);
      continue;
    }
    if (custom)
      push(day, next, 'custom', custom.color ?? WEEKEND, {
        className: custom.className,
        label: custom.label,
      });

    if (!hourScale || !nw) continue;
    // Off-hours = complement of the working ranges for this weekday
    if (nw.workingHours) {
      const ranges = nw.workingHours(day.getDay());
      let cursor = 0;
      for (const r of ranges) {
        if (r.start > cursor) push(at(day, cursor), at(day, r.start), 'off-hours', greyed ? DISABLED : OFF_HOURS);
        cursor = Math.max(cursor, r.end);
      }
      if (cursor < 24) push(at(day, cursor), next, 'off-hours', greyed ? DISABLED : OFF_HOURS);
    }
    for (const r of nw.intensive) {
      push(at(day, r.start), at(day, r.end), 'intensive', r.color ?? INTENSIVE, { label: r.label });
    }
  }

  if (hourScale && cfg.highlightTime) {
    for (const hour of unitBoundaries(start, end, 'hour', 1, 1)) {
      const h = cfg.highlightTime(hour, 'hour');
      if (h)
        push(hour, periodNext(hour, 'hour', 1), 'custom', h.color ?? INTENSIVE, {
          className: h.className,
          label: h.label,
        });
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
export function snapToUnit(date: Date, unit: TimeUnit, step = 1, weekStart: WeekStart = 1): Date {
  return unitStart(date, unit, step, weekStart);
}
