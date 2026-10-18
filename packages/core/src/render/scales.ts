// ─────────────────────────────────────────────────────────────
//  gantry · render/scales.ts
//  Time units, header tiers ("scales") and zoom presets.
//  Pure — no DOM, no framework.
// ─────────────────────────────────────────────────────────────

import type {
  TimeUnit,
  GanttScale,
  GanttZoomLevel,
  ScaleFormat,
  ScaleFormatContext,
  GanttLabels,
  GanttI18n,
} from '../types';
import { ViewMode, DEFAULT_LABELS } from '../types';
import { calendarDays, toLocalDay } from '../gantt-math';
import { formatDate, isoWeek } from '../format';

// ─── Unit arithmetic ──────────────────────────────────────────

/** Average length of each unit in days (used to derive px/day from a cell width). */
export const UNIT_DAYS: Record<TimeUnit, number> = {
  hour: 1 / 24,
  day: 1,
  week: 7,
  month: 30.436875,
  quarter: 91.310625,
  year: 365.2425,
};

/**
 * Start of the `unit`×`step` period containing `date`. Steps align to the
 * calendar (6 hours → 00/06/12/18, 6 months → Jan/Jul, 2 days/weeks → epoch-aligned).
 */
export function unitStart(date: Date, unit: TimeUnit, step = 1, weekStart: 0 | 1 = 1): Date {
  return periodStart(toLocalDay(date), unit, step, weekStart);
}

/**
 * `unitStart` for a date that is already local (scale boundaries, bands): no date-only
 * normalisation, so an hour boundary that happens to fall on UTC midnight (16:00 in
 * Los Angeles) is not mistaken for a date-only value.
 */
function periodStart(d: Date, unit: TimeUnit, step: number, weekStart: 0 | 1): Date {
  const y = d.getFullYear(),
    m = d.getMonth(),
    day = d.getDate();
  switch (unit) {
    case 'hour': {
      const h = d.getHours();
      return new Date(y, m, day, h - (h % step));
    }
    case 'day': {
      const idx = Math.floor(calendarDays(new Date(y, m, day)));
      return new Date(y, m, day - (((idx % step) + step) % step));
    }
    case 'week': {
      const back = (d.getDay() - weekStart + 7) % 7;
      const ws = new Date(y, m, day - back);
      if (step === 1) return ws;
      const weekIdx = Math.floor(Math.floor(calendarDays(ws)) / 7);
      return new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - (((weekIdx % step) + step) % step) * 7);
    }
    case 'month':
      return new Date(y, m - (m % step), 1);
    case 'quarter':
      return new Date(y, m - (m % (3 * step)), 1);
    case 'year':
      return new Date(y - (y % step), 0, 1);
  }
}

/** `date` + n × unit, in local calendar arithmetic. */
export function unitAdd(date: Date, unit: TimeUnit, n: number): Date {
  const y = date.getFullYear(),
    m = date.getMonth(),
    d = date.getDate(),
    h = date.getHours();
  switch (unit) {
    case 'hour':
      return new Date(y, m, d, h + n, date.getMinutes());
    case 'day':
      return new Date(y, m, d + n, h, date.getMinutes());
    case 'week':
      return new Date(y, m, d + 7 * n, h, date.getMinutes());
    case 'month':
      return new Date(y, m + n, d);
    case 'quarter':
      return new Date(y, m + 3 * n, d);
    case 'year':
      return new Date(y + n, m, d);
  }
}

/**
 * The boundary after the period starting at `start` (a period boundary itself). Like `unitAdd`, but
 * hour periods always end on a whole hour: after a 30-minute daylight-saving jump (Lord Howe) the
 * shortened cell ends at the next full hour instead of carrying the :30 into every later cell.
 */
export function periodNext(start: Date, unit: TimeUnit, step: number): Date {
  return unit === 'hour'
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + step)
    : unitAdd(start, unit, step);
}

/** Week number: ISO-8601 when the week starts on Monday, US-style (week 1 holds Jan 1) on Sunday. */
export function weekNumber(date: Date, weekStart: 0 | 1 = 1): number {
  if (weekStart === 1) return isoWeek(date);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.round(calendarDays(date) - calendarDays(jan1));
  return Math.floor((dayOfYear + jan1.getDay()) / 7) + 1;
}

// ─── Formats ──────────────────────────────────────────────────

/** Inclusive last day of a period whose exclusive end is `end`. */
const lastDay = (end: Date) => new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);

/** Ready-made week label formats — pass as a scale's `format`. */
export const WEEK_FORMATS = {
  /** "W52" (prefix from `labels.weekPrefix`) */
  number: ((s, _e, ctx) => `${ctx.labels.weekPrefix}${weekNumber(s, ctx.weekStart)}`) as ScaleFormat,
  /** "Week 52" (word from `labels.week`) */
  label: ((s, _e, ctx) => `${ctx.labels.week} ${weekNumber(s, ctx.weekStart)}`) as ScaleFormat,
  /** "4–11" — first and last day of the week */
  range: ((s, e) => `${s.getDate()}–${lastDay(e).getDate()}`) as ScaleFormat,
  /** "4–11 Mar", or "28 Feb – 6 Mar" across months */
  rangeMonth: ((s, e, ctx) => {
    const last = lastDay(e);
    return s.getMonth() === last.getMonth()
      ? `${s.getDate()}–${formatDate(last, 'D MMM', ctx.locale)}`
      : `${formatDate(s, 'D MMM', ctx.locale)} – ${formatDate(last, 'D MMM', ctx.locale)}`;
  }) as ScaleFormat,
  /** "W52 · 4–11" */
  numberRange: ((s, e, ctx) =>
    `${ctx.labels.weekPrefix}${weekNumber(s, ctx.weekStart)} · ${s.getDate()}–${lastDay(e).getDate()}`) as ScaleFormat,
};

/** "Q2 2026" / "Q2" (prefix from `labels.quarterPrefix`) */
export const QUARTER_FORMAT: ScaleFormat = (s, _e, ctx) =>
  `${ctx.labels.quarterPrefix}${Math.floor(s.getMonth() / 3) + 1}`;
export const QUARTER_YEAR_FORMAT: ScaleFormat = (s, _e, ctx) =>
  `${ctx.labels.quarterPrefix}${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`;
/** "H1" / "H2" (prefix from `labels.halfPrefix`) */
export const HALF_FORMAT: ScaleFormat = (s, _e, ctx) => `${ctx.labels.halfPrefix}${s.getMonth() < 6 ? 1 : 2}`;

const DEFAULT_UNIT_FORMAT: Record<TimeUnit, ScaleFormat> = {
  hour: 'HH',
  day: 'D',
  week: WEEK_FORMATS.number,
  month: 'MMM YYYY',
  quarter: QUARTER_YEAR_FORMAT,
  year: 'YYYY',
};

export function formatScaleLabel(scale: GanttScale, start: Date, end: Date, ctx: ScaleFormatContext): string {
  const fmt = scale.format ?? DEFAULT_UNIT_FORMAT[scale.unit];
  return typeof fmt === 'function' ? fmt(start, end, ctx) : formatDate(start, fmt, ctx.locale);
}

// ─── Zoom presets ─────────────────────────────────────────────

/** The built-in zoom levels, finest first. Names match `ViewMode`. */
export const DEFAULT_ZOOM_LEVELS: GanttZoomLevel[] = [
  {
    name: ViewMode.Hour,
    pxPerDay: 960,
    scales: [
      { unit: 'day', format: 'ddd D MMM', align: 'start' },
      { unit: 'hour', format: 'HH' },
    ],
  },
  {
    name: ViewMode.Day,
    pxPerDay: 48,
    scales: [
      { unit: 'month', format: 'MMMM YYYY', align: 'start' },
      { unit: 'day', format: 'D' },
    ],
  },
  {
    name: ViewMode.Week,
    pxPerDay: 20,
    scales: [
      { unit: 'month', format: 'MMM YYYY', align: 'start' },
      { unit: 'week', format: WEEK_FORMATS.number },
    ],
  },
  {
    name: ViewMode.Month,
    pxPerDay: 8,
    scales: [
      { unit: 'quarter', format: QUARTER_YEAR_FORMAT, align: 'start' },
      { unit: 'month', format: 'MMM' },
    ],
  },
  {
    name: ViewMode.Quarter,
    pxPerDay: 4,
    scales: [
      { unit: 'year', format: 'YYYY', align: 'start' },
      { unit: 'quarter', format: QUARTER_FORMAT },
    ],
  },
  {
    name: ViewMode.Year,
    pxPerDay: 2,
    scales: [
      { unit: 'year', format: 'YYYY', align: 'start' },
      { unit: 'month', step: 6, format: HALF_FORMAT },
    ],
  },
];

/** The bottom (finest) tier of a scale list — the one cells, snapping and padding follow. */
export function bottomScale(scales: readonly GanttScale[]): GanttScale {
  return scales.at(-1) ?? { unit: 'day' };
}

/** px per day of a zoom level (from `pxPerDay`, or derived from `cellWidth`). */
export function levelPxPerDay(level: GanttZoomLevel): number {
  if (level.pxPerDay) return level.pxPerDay;
  const bottom = bottomScale(level.scales);
  const cellDays = UNIT_DAYS[bottom.unit] * (bottom.step ?? 1);
  return (level.cellWidth ?? 40) / cellDays;
}

export function findZoomLevel(levels: GanttZoomLevel[], name: string | undefined): GanttZoomLevel {
  const level =
    levels.find(l => l.name === name) ?? levels.find(l => l.name === (ViewMode.Month as string)) ?? levels[0];
  if (!level) throw new Error('[gantry] zoomLevels is empty');
  return level;
}

export function zoomStep(levels: GanttZoomLevel[], current: string, dir: 1 | -1): string {
  const i = levels.findIndex(l => l.name === current);
  if (i < 0) return levels[0]?.name ?? current;
  return levels[Math.min(levels.length - 1, Math.max(0, i + dir))]?.name ?? current;
}

/**
 * Apply the legacy per-view `formats.header[view].top/bottom` overrides to a
 * level's first / last tier.
 */
export function withLegacyHeaderFormats(level: GanttZoomLevel, i18n?: GanttI18n): GanttScale[] {
  const legacy = i18n?.formats?.header?.[level.name as ViewMode];
  if (!legacy) return level.scales;
  return level.scales.map((s, i, all) => {
    const fn = i === 0 ? legacy.top : i === all.length - 1 ? legacy.bottom : undefined;
    return fn ? { ...s, format: (start: Date) => fn(start) } : s;
  });
}

// ─── Tier cells ───────────────────────────────────────────────

export interface ScaleCell {
  start: Date;
  /** Exclusive end of the period */
  end: Date;
  x: number;
  width: number;
  label: string;
  className?: string | undefined;
  /** The period contains "now" */
  isCurrent: boolean;
}

export interface ScaleTier {
  unit: TimeUnit;
  step: number;
  y: number;
  height: number;
  align: 'center' | 'start';
  cells: ScaleCell[];
}

export interface BuildTiersInput {
  scales: GanttScale[];
  start: Date;
  end: Date;
  pxPerDay: number;
  /** Tier heights when a scale has none: [upper tiers, bottom tier] */
  heights?: [number, number] | undefined;
  weekStart?: 0 | 1 | undefined;
  locale?: string | undefined;
  labels?: GanttLabels | undefined;
  now?: Date | undefined;
  /**
   * Read date-only `start` / `end` (UTC midnight) as local days. Default `true`; `buildTimeline`
   * passes `false` because its bounds are already local.
   */
  normalizeDateOnly?: boolean | undefined;
}

/**
 * Period boundaries (start dates) of a unit inside [start, end), the first one possibly before
 * `start`. `start` and `end` are local dates (already normalised), like every timeline bound.
 */
export function unitBoundaries(start: Date, end: Date, unit: TimeUnit, step: number, weekStart: 0 | 1): Date[] {
  const out: Date[] = [];
  let cur = periodStart(start, unit, step, weekStart);
  // Hard cap protects against runaway configs (e.g. hour scale over decades)
  for (let i = 0; cur < end && i < 50_000; i++) {
    out.push(cur);
    cur = periodNext(cur, unit, step);
  }
  return out;
}

export function buildTiers(input: BuildTiersInput): ScaleTier[] {
  const { scales, pxPerDay, weekStart = 1, locale, now = new Date() } = input;
  const local = (d: Date) => (input.normalizeDateOnly === false ? d : toLocalDay(d));
  const start = local(input.start);
  const end = local(input.end);
  const labels = input.labels ?? DEFAULT_LABELS;
  const [upperH, bottomH] = input.heights ?? [32, 28];
  // Bounds and cells are local dates: x without date-only normalisation (see `periodStart`)
  const origin = calendarDays(start, false);
  const xOf = (d: Date) => Math.round((calendarDays(d, false) - origin) * pxPerDay);
  const totalWidth = xOf(end);
  let y = 0;

  return scales.map((scale, i) => {
    const step = scale.step ?? 1;
    const isBottom = i === scales.length - 1;
    const height = scale.height ?? (isBottom ? bottomH : upperH);
    const ctx: ScaleFormatContext = {
      unit: scale.unit,
      step,
      labels,
      weekStart,
      ...(locale !== undefined && { locale }),
    };
    const cells: ScaleCell[] = [];

    for (const cellStart of unitBoundaries(start, end, scale.unit, step, weekStart)) {
      const cellEnd = periodNext(cellStart, scale.unit, step);
      const x0 = Math.max(0, xOf(cellStart));
      const x1 = Math.min(totalWidth, xOf(cellEnd));
      if (x1 <= x0) continue;
      cells.push({
        start: cellStart,
        end: cellEnd,
        x: x0,
        width: x1 - x0,
        label: formatScaleLabel(scale, cellStart, cellEnd, ctx),
        className: scale.className?.(cellStart, cellEnd),
        isCurrent: now >= cellStart && now < cellEnd,
      });
    }

    const tier: ScaleTier = {
      unit: scale.unit,
      step,
      y,
      height,
      align: scale.align ?? (isBottom ? 'center' : 'start'),
      cells,
    };
    y += height;
    return tier;
  });
}
