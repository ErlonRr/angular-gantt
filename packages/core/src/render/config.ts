// ─────────────────────────────────────────────────────────────
//  gantry · render/config.ts
//  `resolveConfig()` — the single place where every option gets its
//  default. Both bindings render from the resolved config, so an option
//  can't be honoured by one and ignored by the other.
// ─────────────────────────────────────────────────────────────

import type {
  GanttOptions,
  GanttScale,
  GanttZoomLevel,
  GanttLength,
  GanttLineStyle,
  GanttHourRange,
  GanttTimeHighlight,
  GanttView,
  GanttTask,
  GanttTooltipRenderContext,
  TimeUnit,
  GanttI18n,
  GanttDensity,
  GanttFlatRow,
  GanttRollupOptions,
  GanttStyleOptions,
  GanttStyleRuleContext,
  GanttTaskStyle,
  ResolvedTaskStyle,
  WeekRule,
  WeekStart,
} from '../types';
import { DEFAULT_ZOOM_LEVELS, findZoomLevel, levelPxPerDay, withLegacyHeaderFormats } from './scales';
import type { ThemeMetrics } from './theme';
import { themeVar, type Paint } from './paint';
import type { InitialScroll } from './viewport';
import { calendarDays } from '../gantt-math';
import { resolveWeek } from '../format/week';

export interface ResolvedLine {
  /** Explicit `GanttLineStyle.color`, else the theme token (`var(--gantt-grid-line)`…) */
  paint: Paint;
  width: number;
  dash?: string | undefined;
}

export interface ResolvedHoliday {
  from: number;
  to: number;
  label?: string | undefined;
  color?: string | undefined;
}

export interface ResolvedNonWorking {
  weekends: Set<number>;
  /** Epoch-day ranges, inclusive */
  holidays: ResolvedHoliday[];
  /** Holiday by epoch day — O(1) lookup while painting bands */
  holidayByDay: ReadonlyMap<number, ResolvedHoliday>;
  /** Working hours for a weekday, sorted by start (null = no hour shading) */
  workingHours: ((weekday: number) => readonly GanttHourRange[]) | null;
  intensive: (GanttHourRange & { color?: string | undefined; label?: string | undefined })[];
  style: 'shade' | 'hatch' | 'disabled';
  showInHeader: boolean;
  minPxPerDay: number;
}

export interface ResolvedToolbar {
  zoom: boolean;
  viewModes: string[] | false;
  today: boolean;
  viewToggle: boolean;
  /** "Fit to screen" button */
  fit: boolean;
  /** Show / hide task list button, first in the toolbar */
  panelToggle: boolean;
  /** Controls that don't fit: into the "More" menu, or wrapped */
  overflow: 'menu' | 'wrap';
}

/** Row height, header tier heights and toolbar control size of a `density`. */
export interface DensityMetrics {
  readonly rowHeight: number;
  /** [upper tiers, bottom tier] */
  readonly tierHeights: readonly [number, number];
  /** Toolbar control size in px (`--gantry-control-size`) */
  readonly controlSize: number;
}

/** The `density` table; `'normal'` is the 1.x geometry. */
export const DENSITY_METRICS: Readonly<Record<GanttDensity, DensityMetrics>> = {
  compact: { rowHeight: 28, tierHeights: [28, 24], controlSize: 28 },
  normal: { rowHeight: 36, tierHeights: [32, 28], controlSize: 32 },
  comfortable: { rowHeight: 44, tierHeights: [36, 32], controlSize: 36 },
};

/** `responsive` with its defaults: below `breakpoint` px the chart shows `view`. */
export interface ResolvedResponsive {
  breakpoint: number;
  view: GanttView;
}

/** `options.styles` with every layer present (an empty style where none is set). */
export interface ResolvedStyleOptions {
  task: ResolvedTaskStyle;
  group: ResolvedTaskStyle;
  milestone: ResolvedTaskStyle;
  parent: ResolvedTaskStyle;
  /** By exact depth; `null` where a level has no style */
  levels: readonly (ResolvedTaskStyle | null)[];
  rule: ((row: GanttFlatRow, ctx: GanttStyleRuleContext) => GanttTaskStyle | null | undefined) | null;
}

/** `options.rollup` with every field set (`true` = the defaults). */
export interface ResolvedRollupOptions {
  progress: 'duration' | 'count' | false;
  dates: boolean;
  color: 'status' | false | ((children: readonly GanttTask[], parent: GanttTask) => string | null | undefined);
  segments: boolean;
}

/**
 * Every option with its default. Colours are not resolved here: the model carries `Paint`s
 * (`var(--gantt-*)` or explicit colours) and the theme reaches pixels through CSS variables.
 */
export interface ResolvedGanttConfig {
  zoomLevels: GanttZoomLevel[];
  level: GanttZoomLevel;
  scales: GanttScale[];
  pxPerDay: number;
  /** First day of the week cells (`weekStart`, else the `weekNumbering` rule's first day) */
  weekStart: WeekStart;
  /** Week-numbering rule of the header labels; its `firstDay` is `weekStart` */
  week: WeekRule;
  fitToWidth: boolean;
  initialScroll: InitialScroll;
  timelinePadding: number;
  /** `density` (default `'normal'`) */
  density: GanttDensity;
  /** Toolbar control size in px, from the density */
  controlSize: number;
  /** [upper tiers, bottom tier] default heights (explicit heights, else the density's) */
  tierHeights: [number, number];
  /** `rowHeight`, else the density's */
  rowHeight: number;
  indentSize: number;
  gridLines: {
    minor: ResolvedLine | null;
    major: ResolvedLine | null;
    horizontal: ResolvedLine | null;
    majorUnit?: TimeUnit | undefined;
  };
  nonWorking: ResolvedNonWorking | null;
  highlightTime?: ((start: Date, unit: 'day' | 'hour') => GanttTimeHighlight | null | undefined) | undefined;
  endDateMode: 'exclusive' | 'inclusive';
  normalizeDateOnly: boolean;
  bar: {
    height: GanttLength;
    radius: number;
    minWidth: number;
    progress: { show: boolean; color?: string | undefined; opacity: number };
    label: {
      position: 'inside' | 'left' | 'right' | 'auto' | 'none';
      template?: ((task: GanttTask) => string) | undefined;
      color?: string | undefined;
    };
    /** Resize handles: width of each pointer target in px */
    handles: { hitSize: number };
  };
  milestone: { size?: number | undefined; shape: 'diamond' | 'circle' | 'square' };
  groupBar: { height: GanttLength; style: 'summary' | 'bar'; showProgress: boolean; collapsed: boolean };
  arrows: {
    width: number;
    headSize: number;
    radius: number;
    color?: string | undefined;
    offset: number;
    routing: 'orthogonal' | 'straight';
  };
  /** Style layers by kind, parent, level and rule */
  styles: ResolvedStyleOptions;
  /** Rollup of parent rows, or `false` */
  rollup: ResolvedRollupOptions | false;
  panel: {
    width: GanttLength;
    minWidth: number;
    maxWidth?: GanttLength | undefined;
    resizable: boolean;
    collapsible: boolean;
    collapsed: boolean;
    /** Explicit split-view column keys; null = derive (see `resolveViewColumns`) */
    columns: string[] | null;
  };
  /** Explicit table-view column keys; null = derive */
  table: { columns: string[] | null };
  view: GanttView;
  /** Narrow-width view switch, or `false` */
  responsive: ResolvedResponsive | false;
  toolbar: ResolvedToolbar | false;
  showToday: boolean;
  baseline: boolean;
  criticalPath: boolean;
  /** `enableSelection` / `multiSelect` (both default true) */
  selection: { enabled: boolean; multi: boolean };
  keyboard: { characterShortcuts: boolean };
  /** Delays in ms; the defaults are `TOOLTIP_SHOW_DELAY` / `TOOLTIP_HIDE_DELAY` */
  tooltip: {
    trigger: 'auto' | 'hover' | 'focus';
    showDelay: number;
    hideDelay: number;
    render?: ((ctx: GanttTooltipRenderContext) => unknown) | undefined;
  };
  legend: { position: 'bottom' | 'toolbar' };
  markers: { lane: 'auto' | boolean };
}

/** `LightTheme.barRadius` / `DarkTheme.barRadius` in px (when no metrics are passed). */
const DEFAULT_BAR_RADIUS = 4;

/**
 * Default tooltip delays in ms: the values of `TOOLTIP_SHOW_DELAY` / `TOOLTIP_HIDE_DELAY`
 * (`state/tooltip.ts`), repeated here so this module does not import the tooltip model; a test
 * keeps them equal.
 */
const DEFAULT_TOOLTIP_SHOW_DELAY = 320;
const DEFAULT_TOOLTIP_HIDE_DELAY = 120;

const line = (style: GanttLineStyle | false | undefined, fallback: ResolvedLine): ResolvedLine | null =>
  style === false
    ? null
    : {
        paint: style?.color ?? fallback.paint,
        width: style?.width ?? fallback.width,
        dash: style?.dash ?? fallback.dash,
      };

/** The style of an unset layer. */
const NO_STYLE: ResolvedTaskStyle = Object.freeze({});

function resolveStyles(o: GanttStyleOptions | undefined): ResolvedStyleOptions {
  return {
    task: o?.task ?? NO_STYLE,
    group: o?.group ?? NO_STYLE,
    milestone: o?.milestone ?? NO_STYLE,
    parent: o?.parent ?? NO_STYLE,
    levels: Array.from(o?.levels ?? [], level => level ?? null),
    rule: o?.rule ?? null,
  };
}

function resolveRollup(r: boolean | GanttRollupOptions | undefined): ResolvedRollupOptions | false {
  if (!r) return false;
  const o: GanttRollupOptions = r === true ? {} : r;
  return {
    progress: o.progress ?? 'duration',
    dates: o.dates ?? true,
    color: o.color ?? false,
    segments: o.segments ?? false,
  };
}

/** A known `density`, else `'normal'` (untyped callers). */
const densityOf = (d: GanttDensity | undefined): GanttDensity =>
  d === 'compact' || d === 'comfortable' ? d : 'normal';

/** Epoch day of a date (local calendar). */
const epochDay = (d: Date) => Math.floor(calendarDays(d));

export function resolveNonWorking(opts: GanttOptions['nonWorkingTime']): ResolvedNonWorking | null {
  if (opts === false) return null;
  const o = opts ?? {};
  const weekends = new Set<number>(o.weekends === false ? [] : Array.isArray(o.weekends) ? o.weekends : [0, 6]);
  const holidays: ResolvedHoliday[] = (o.holidays ?? []).map(h => {
    const hol = h instanceof Date ? { start: h } : h;
    return { from: epochDay(hol.start), to: epochDay(hol.end ?? hol.start), label: hol.label, color: hol.color };
  });

  // One entry per holiday day (ranges are capped at 10 years so a typo can't explode the map)
  const holidayByDay = new Map<number, ResolvedHoliday>();
  for (const h of holidays) {
    for (let d = h.from; d <= Math.min(h.to, h.from + 3660); d++) if (!holidayByDay.has(d)) holidayByDay.set(d, h);
  }

  let workingHours: ResolvedNonWorking['workingHours'] = null;
  const wh = o.workingHours;
  if (wh) {
    // Sorted once per weekday, not on every painted day
    const sorted = (ranges: readonly GanttHourRange[]) => [...ranges].sort((a, b) => a.start - b.start);
    let byWeekday: (readonly GanttHourRange[])[];
    if (Array.isArray(wh)) byWeekday = Array.from({ length: 7 }, () => sorted(wh));
    else if ('start' in wh && 'end' in wh && typeof wh.start === 'number') {
      const r = wh;
      byWeekday = Array.from({ length: 7 }, () => [r]);
    } else {
      const map = wh as Partial<Record<number, GanttHourRange[]>>;
      byWeekday = Array.from({ length: 7 }, (_, day) => sorted(map[day] ?? []));
    }
    workingHours = day => byWeekday[day] ?? [];
  }

  return {
    weekends,
    holidays,
    holidayByDay,
    workingHours,
    intensive: o.intensiveHours ?? [],
    style: o.style ?? 'shade',
    showInHeader: o.showInHeader ?? true,
    minPxPerDay: o.minPxPerDay ?? 12,
  };
}

/**
 * Resolve the options (and the i18n header formats) into the render config. Only theme
 * *metrics* enter it — `metrics.barRadius` is the default `bar.radius` (`themeMetrics(theme)`);
 * theme colours stay out, so a colour-only theme change keeps the config.
 */
export function resolveConfig(
  options: GanttOptions = {},
  i18n?: GanttI18n,
  metrics?: Partial<ThemeMetrics>,
): ResolvedGanttConfig {
  const zoomLevels = options.zoomLevels?.length ? options.zoomLevels : DEFAULT_ZOOM_LEVELS;
  const level = findZoomLevel(zoomLevels, options.viewMode);
  const scales = options.scales?.length ? options.scales : withLegacyHeaderFormats(level, i18n);
  const toolbar = options.toolbar;
  const density = densityOf(options.density);
  const sizes = DENSITY_METRICS[density];
  const week = resolveWeek(options.weekNumbering, options.weekStart, i18n?.locale ?? options.locale);
  const responsive = options.responsive;

  return {
    zoomLevels,
    level,
    scales,
    pxPerDay: levelPxPerDay(options.scales?.length ? { ...level, scales } : level),
    weekStart: week.start,
    week: week.rule,
    fitToWidth: options.fitToWidth ?? true,
    initialScroll: options.initialScroll ?? 'auto',
    timelinePadding: options.timelinePadding ?? 7,
    density,
    controlSize: sizes.controlSize,
    tierHeights: [options.headerHeight ?? sizes.tierHeights[0], options.subHeaderHeight ?? sizes.tierHeights[1]],
    rowHeight: options.rowHeight ?? sizes.rowHeight,
    indentSize: options.indentSize ?? 16,
    gridLines: {
      minor: line(options.gridLines?.minor, { paint: themeVar('gridLine'), width: 1 }),
      major: line(options.gridLines?.major, { paint: themeVar('gridLineMajor'), width: 1 }),
      horizontal: line(options.gridLines?.horizontal, { paint: themeVar('borderColor'), width: 1 }),
      majorUnit: options.gridLines?.majorUnit,
    },
    nonWorking: resolveNonWorking(options.nonWorkingTime),
    highlightTime: options.highlightTime,
    endDateMode: options.endDateMode ?? 'exclusive',
    normalizeDateOnly: options.normalizeDateOnly ?? true,
    bar: {
      height: options.bar?.height ?? '60%',
      radius: options.bar?.radius ?? metrics?.barRadius ?? DEFAULT_BAR_RADIUS,
      minWidth: options.bar?.minWidth ?? 4,
      progress: {
        show: options.bar?.progress?.show ?? true,
        color: options.bar?.progress?.color,
        opacity: options.bar?.progress?.opacity ?? 0.25,
      },
      label: {
        position: options.bar?.label?.position ?? 'auto',
        template: options.bar?.label?.template,
        color: options.bar?.label?.color,
      },
      handles: { hitSize: options.bar?.handles?.hitSize ?? 24 },
    },
    milestone: { size: options.milestone?.size, shape: options.milestone?.shape ?? 'diamond' },
    groupBar: {
      height: options.groupBar?.height ?? (options.groupBar?.style === 'bar' ? '60%' : '40%'),
      style: options.groupBar?.style ?? 'summary',
      showProgress: options.groupBar?.showProgress ?? true,
      collapsed: options.groupBar?.collapsed ?? false,
    },
    arrows: {
      width: options.arrows?.width ?? 1.25,
      headSize: options.arrows?.headSize ?? 5,
      radius: options.arrows?.radius ?? 4,
      color: options.arrows?.color,
      offset: options.arrows?.offset ?? 12,
      routing: options.arrows?.routing ?? 'orthogonal',
    },
    styles: resolveStyles(options.styles),
    rollup: resolveRollup(options.rollup),
    panel: {
      width: options.panel?.width ?? options.panelWidth ?? '30%',
      minWidth: options.panel?.minWidth ?? 120,
      maxWidth: options.panel?.maxWidth,
      resizable: options.panel?.resizable ?? true,
      collapsible: options.panel?.collapsible ?? true,
      collapsed: options.panel?.collapsed ?? options.panelVisible === false,
      columns: options.panel?.columns ?? null,
    },
    table: { columns: options.table?.columns ?? null },
    view: options.view ?? 'split',
    responsive:
      responsive === false ? false : { breakpoint: responsive?.breakpoint ?? 640, view: responsive?.view ?? 'chart' },
    toolbar:
      toolbar === false
        ? false
        : {
            zoom: toolbar?.zoom ?? true,
            viewModes: toolbar?.viewModes ?? zoomLevels.map(l => l.name),
            today: toolbar?.today ?? true,
            viewToggle: toolbar?.viewToggle ?? true,
            fit: toolbar?.fit ?? true,
            panelToggle: toolbar?.panelToggle ?? false,
            overflow: toolbar?.overflow ?? 'menu',
          },
    showToday: options.showToday ?? true,
    baseline: options.baseline ?? false,
    criticalPath: options.criticalPath ?? false,
    selection: { enabled: options.enableSelection ?? true, multi: options.multiSelect ?? true },
    keyboard: { characterShortcuts: options.keyboard?.characterShortcuts ?? true },
    tooltip: {
      trigger: options.tooltip?.trigger ?? 'auto',
      showDelay: options.tooltip?.showDelay ?? DEFAULT_TOOLTIP_SHOW_DELAY,
      hideDelay: options.tooltip?.hideDelay ?? DEFAULT_TOOLTIP_HIDE_DELAY,
      render: options.tooltip?.render,
    },
    legend: { position: options.legend?.position ?? 'bottom' },
    markers: { lane: options.markers?.lane ?? 'auto' },
  };
}

/** Resolve a `GanttLength` against a reference size (`'40%'` of 200 → 80). */
export function resolveLength(len: GanttLength | undefined, reference: number, fallback: number): number {
  if (len == null) return fallback;
  if (typeof len === 'number') return len;
  const pct = parseFloat(len);
  return Number.isFinite(pct) ? (reference * pct) / 100 : fallback;
}
