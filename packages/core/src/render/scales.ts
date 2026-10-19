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
  WeekRule,
  WeekStart,
} from '../types';
import { ViewMode, DEFAULT_LABELS } from '../types';
import { calendarDays, toLocalDay } from '../gantt-math';
import { formatDate } from '../format';
import { resolveWeek, weekOfYear } from '../format/week';

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
export function unitStart(date: Date, unit: TimeUnit, step = 1, weekStart: WeekStart = 1): Date {
  return periodStart(toLocalDay(date), unit, step, weekStart);
}

/**
 * `unitStart` for a date that is already local (scale boundaries, bands): no date-only
 * normalisation, so an hour boundary that happens to fall on UTC midnight (16:00 in
 * Los Angeles) is not mistaken for a date-only value.
 */
function periodStart(d: Date, unit: TimeUnit, step: number, weekStart: WeekStart): Date {
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

/**
 * Week number (1–53) of `date`'s local calendar day under a rule (`weekOfYear`) or under the rule
 * a chart with only `weekStart` set numbers by (`resolveWeek`): 1 → ISO-8601, 0 → US (week 1
 * holds January 1, and so does the week's December part), 6 → weeks from Saturday with week 1
 * holding 4 days of the year.
 */
export function weekNumber(date: Date, week: WeekStart | WeekRule = 1): number {
  return weekOfYear(date, typeof week === 'number' ? resolveWeek(undefined, week).rule : week);
}

// ─── Formats ──────────────────────────────────────────────────

/** Inclusive last day of a period whose exclusive end is `end`. */
const lastDay = (end: Date) => new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);

/** The week number of a label: `ctx.week`'s rule (a context built by hand without it: `ctx.weekStart`'s). */
const labelWeek = (start: Date, ctx: ScaleFormatContext): number =>
  weekNumber(start, (ctx as Partial<ScaleFormatContext>).week ?? ctx.weekStart);

/**
 * Ready-made week label formats — pass as a scale's `format`. Week numbers follow the chart's
 * rule (`ScaleFormatContext.week`: `weekNumbering` and `weekStart`) for the week's first day.
 */
export const WEEK_FORMATS = {
  /** "W52" (prefix from `labels.weekPrefix`) */
  number: ((s, _e, ctx) => `${ctx.labels.weekPrefix}${labelWeek(s, ctx)}`) as ScaleFormat,
  /** "Week 52" (word from `labels.week`) */
  label: ((s, _e, ctx) => `${ctx.labels.week} ${labelWeek(s, ctx)}`) as ScaleFormat,
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
    `${ctx.labels.weekPrefix}${labelWeek(s, ctx)} · ${s.getDate()}–${lastDay(e).getDate()}`) as ScaleFormat,
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
  /**
   * The period runs past the timeline range (only the first or last cell of a tier), so the cell
   * shows part of it. Its `label` is `''` when the cell is also narrower than the estimated label
   * plus `HEADER_LABEL_PADDING` (see `partialLabelHidden`); a wider one keeps its label, which
   * sticks to the viewport edge. Set only on such cells.
   */
  partial?: boolean | undefined;
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
  /** First day of the week cells (default: `week`'s first day when it is 0 or 6, otherwise Monday) */
  weekStart?: WeekStart | undefined;
  /** Week-numbering rule of the labels (default: the rule `resolveWeek` gives for `weekStart`) */
  week?: WeekRule | undefined;
  locale?: string | undefined;
  labels?: GanttLabels | undefined;
  now?: Date | undefined;
  /**
   * Read date-only `start` / `end` (UTC midnight) as local days. Default `true`; `buildTimeline`
   * passes `false` because its bounds are already local.
   */
  normalizeDateOnly?: boolean | undefined;
  /** Font size (px) the labels of partial cells are estimated at (default 12) */
  labelFontPx?: number | undefined;
}

/** Horizontal padding of a header label (6 px each side), added to its estimated width. */
export const HEADER_LABEL_PADDING = 12;

/**
 * Average glyph width in em: the estimate of `estimateTextWidth` (render/bars.ts), repeated here
 * because importing bars from scales would close an import cycle (bars → timeline → scales).
 */
const GLYPH_EM = 0.56;

/**
 * A partial cell (clipped by the range) hides its label when it is narrower than the estimated
 * label plus `HEADER_LABEL_PADDING`: a sliver at the edge of the range would only show "2…".
 */
export function partialLabelHidden(label: string, width: number, fontPx = 12): boolean {
  return label !== '' && width < label.length * fontPx * GLYPH_EM + HEADER_LABEL_PADDING;
}

/**
 * Period boundaries (start dates) of a unit inside [start, end), the first one possibly before
 * `start`. `start` and `end` are local dates (already normalised), like every timeline bound.
 */
export function unitBoundaries(start: Date, end: Date, unit: TimeUnit, step: number, weekStart: WeekStart): Date[] {
  const out: Date[] = [];
  let cur = periodStart(start, unit, step, weekStart);
  // Hard cap protects against runaway configs (e.g. hour scale over decades)
  for (let i = 0; cur < end && i < 50_000; i++) {
    out.push(cur);
    cur = periodNext(cur, unit, step);
  }
  return out;
}

/** The week-cell start of a rule's first day: Sunday or Saturday as they are, any other day Monday (as `resolveWeek`). */
const cellWeekStart = (day: number): WeekStart => (day === 0 || day === 6 ? day : 1);

export function buildTiers(input: BuildTiersInput): ScaleTier[] {
  const { scales, pxPerDay, locale, now = new Date(), labelFontPx = 12 } = input;
  const weekStart = input.weekStart ?? (input.week ? cellWeekStart(input.week.firstDay) : 1);
  const local = (d: Date) => (input.normalizeDateOnly === false ? d : toLocalDay(d));
  const start = local(input.start);
  const end = local(input.end);
  const labels = input.labels ?? DEFAULT_LABELS;
  const [upperH, bottomH] = input.heights ?? [32, 28];
  const week = input.week ?? resolveWeek(undefined, weekStart).rule;
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
      week,
      ...(locale !== undefined && { locale }),
    };
    const cells: ScaleCell[] = [];

    for (const cellStart of unitBoundaries(start, end, scale.unit, step, weekStart)) {
      const cellEnd = periodNext(cellStart, scale.unit, step);
      const from = xOf(cellStart);
      const to = xOf(cellEnd);
      const x0 = Math.max(0, from);
      const x1 = Math.min(totalWidth, to);
      if (x1 <= x0) continue;
      const width = x1 - x0;
      const label = formatScaleLabel(scale, cellStart, cellEnd, ctx);
      const partial = from < 0 || to > totalWidth;
      cells.push({
        start: cellStart,
        end: cellEnd,
        x: x0,
        width,
        label: partial && partialLabelHidden(label, width, labelFontPx) ? '' : label,
        className: scale.className?.(cellStart, cellEnd),
        isCurrent: now >= cellStart && now < cellEnd,
        ...(partial && { partial: true }),
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
