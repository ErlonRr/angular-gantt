// ─────────────────────────────────────────────────────────────
//  gantry · render/config.ts
//  `resolveConfig()` — the single place where every option gets its
//  default. Both bindings render from the resolved config, so an option
//  can't be honoured by one and ignored by the other.
// ─────────────────────────────────────────────────────────────

import type {
  GanttCalendarOptions,
  GanttCalendarUnit,
  GanttDurationMode,
  GanttEditingOptions,
  GanttExportFormat,
  GanttExportOptions,
  GanttOptions,
  GanttPaperSize,
  GanttScale,
  GanttZoomLevel,
  GanttLength,
  GanttLineStyle,
  GanttHourRange,
  GanttNonWorkingTime,
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
import { DEFAULT_PROGRESS_STEP } from '../interaction/keyboard-edit';
import { buildWorkingTime, type WorkingCalendar } from '../calendar/working-calendar';

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
  /** `'none'`: no weekend, holiday or off-hours band (the time still counts for the calendar) */
  style: 'shade' | 'hatch' | 'disabled' | 'none';
  showInHeader: boolean;
  minPxPerDay: number;
}

// ─── Working calendar (`options.calendar`) ───────────────────

/** Working hours in a day of an hour calendar when `calendar.hoursPerDay` is not set. */
export const DEFAULT_HOURS_PER_DAY = 8;

/**
 * The working hours of an hour calendar (`calendar.unit: 'hour'`) when
 * `nonWorkingTime.workingHours` is not set: 09:00–17:00 (resolved into
 * `ResolvedNonWorking.workingHours`, so the off-hours shading shows the same hours).
 */
export const DEFAULT_WORKING_HOURS: readonly GanttHourRange[] = Object.freeze([Object.freeze({ start: 9, end: 17 })]);

/** `options.calendar` with every default filled (`ResolvedGanttConfig.calendar`). */
export interface ResolvedCalendar {
  /** What durations count (`calendar.durations`, default `'working'`) */
  durations: GanttDurationMode;
  /** Working days or working hours (`calendar.unit`, default `'day'`) */
  unit: GanttCalendarUnit;
  /** Edits skip non-working time (`calendar.skipNonWorking`, default true) */
  skipNonWorking: boolean;
  /** Working hours in a day with `unit: 'hour'` (default 8) */
  hoursPerDay: number;
  /** Weekdays with working time: what `1w` means in a working duration */
  daysPerWeek: number;
  /** The working-time arithmetic, built from the resolved `nonWorkingTime` (`buildWorkingCalendar`) */
  working: WorkingCalendar;
  /**
   * A stable text of everything that changes a measure (durations, unit, skipping, hours per
   * day, the working weekdays, the holidays on them and, with `unit: 'hour'`, each weekday's
   * merged hours): equal keys, equal calendars (`sameDateReading`)
   */
  key: string;
}

/**
 * How task dates are read and measured: the end-date rule, date-only normalisation and the
 * working calendar. A `ResolvedGanttConfig` and a `ColumnContext` are `DateReading`s.
 */
export interface DateReading {
  endDateMode: 'exclusive' | 'inclusive';
  normalizeDateOnly: boolean;
  /** The working calendar; `null` / unset: calendar time */
  calendar?: ResolvedCalendar | null | undefined;
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
  /** Undo / Redo buttons (shown only while the chart keeps history: `editing.history`) */
  undo: boolean;
  /** The Export menu button (`toolbar.export`, default false) */
  export: boolean;
}

// ─── Export and print (`options.export`) ─────────────────────

/**
 * What every image export (SVG, PNG, print) draws, with the defaults filled. `range`, `legend`,
 * `today`, `title` and `description` stay `undefined` ("as the chart") until set: a call fills
 * `range` and `today` (`resolveExportCall`), the model the rest from the chart (`buildExportModel`).
 */
export interface ResolvedImageExport {
  view: 'auto' | GanttView;
  range: 'all' | 'visible' | { start: Date; end: Date } | undefined;
  theme: 'current' | 'light' | 'dark';
  background: 'theme' | 'transparent' | (string & {});
  legend: boolean | undefined;
  today: boolean | undefined;
  title: string | undefined;
  description: string | undefined;
  customBars: 'render' | 'builtin';
}

/** `export.svg` with its defaults. */
export interface ResolvedSvgExport extends ResolvedImageExport {
  /** Default 1 */
  scale: number;
  /** `undefined`: a new `gantry-export-<n>` per image */
  idPrefix: string | undefined;
}

/** `export.png` with its defaults. */
export interface ResolvedPngExport extends ResolvedImageExport {
  /** Default `PNG_DEFAULT_SCALE` (2) */
  scale: number;
  /** Default `PNG_MAX_SIDE` (16 384) */
  maxSide: number;
  /** Default `PNG_MAX_PIXELS` (16 777 216) */
  maxPixels: number;
}

/** `export.print` with its defaults (theme `'light'`). */
export interface ResolvedPrintExport extends ResolvedImageExport {
  paper: GanttPaperSize;
  orientation: 'landscape' | 'portrait' | 'auto';
  /** In mm (default `PRINT_DEFAULT_MARGIN_MM`, 10) */
  margin: number;
  fit: 'width' | 'page' | 'none';
  /** `fit: 'none'` (default 1) */
  scale: number;
  /** `fit: 'width'` (default `PRINT_MIN_SCALE`, 0.5) */
  minScale: number;
  repeatHeader: boolean;
  repeatTable: boolean;
  pageNumbers: boolean;
  /** Default `PRINT_MAX_PAGES` (200) */
  maxPages: number;
}

/** `export.csv` with its defaults. */
export interface ResolvedCsvExport {
  columns: 'visible' | 'all' | readonly string[];
  rows: 'all' | 'shown';
  values: 'data' | 'display';
  delimiter: ',' | ';' | '\t';
  header: boolean;
  bom: boolean;
  neutralizeFormulas: boolean;
}

/** `options.export` with every default filled. */
export interface ResolvedExport {
  /**
   * The file's base name for a format, as configured (`fileName`, default `'gantt'`): not yet
   * sanitized and without the extension, which `exportFileName` adds. The same function for the
   * same string, so equal options resolve equal.
   */
  fileName: (format: 'svg' | 'png' | 'csv') => string;
  /** The Export menu's items: known formats, each once, in the given order */
  formats: GanttExportFormat[];
  svg: ResolvedSvgExport;
  png: ResolvedPngExport;
  csv: ResolvedCsvExport;
  print: ResolvedPrintExport;
}

/** Undo steps kept by default (`editing.history.limit`). */
export const DEFAULT_HISTORY_LIMIT = 100;
/** Window in ms in which changes with the same coalesce key make one undo step (`editing.history.coalesceMs`). */
export const DEFAULT_COALESCE_MS = 800;

/**
 * `options.editing` with every feature resolved. With `enabled: false` every feature is off; drag
 * and resize still follow `enableDrag` / `enableResize` and still go through the change pipeline.
 */
export interface ResolvedEditing {
  /** `editing` is `true` or an object */
  enabled: boolean;
  /** Cell editing */
  cells: boolean;
  /** The progress grip and ↑ / ↓ in move mode, with the step in %; `false` when off */
  progress: { step: number } | false;
  /** Link creation and deletion, and whether a task may link to its own ancestors / descendants */
  dependencies: { create: boolean; delete: boolean; parentChild: boolean };
  /** `editing.validate`, or `null` */
  validate: NonNullable<GanttEditingOptions['validate']> | null;
  /** Undo / redo, or `false` (editing off, `history: false`, or `controlled`) */
  history: { limit: number; coalesceMs: number } | false;
  /** The app owns the tasks: nothing is applied, no history */
  controlled: boolean;
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
  /** Working calendar (`options.calendar`), or `null` when off (the default) */
  calendar: ResolvedCalendar | null;
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
  /** Interactive editing (`editing`, default off) */
  editing: ResolvedEditing;
  /** Export and print defaults (`options.export`) */
  export: ResolvedExport;
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

/** `value` when it is a finite number `ok` accepts, else `fallback` (untyped callers, typos). */
const checked = (value: number | undefined, ok: (n: number) => boolean, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && ok(value) ? value : fallback;

/**
 * `editing`: off unless `true` or an object. In the object form each feature is on unless it is
 * `false` (`dependencies.parentChild` is off unless set); `controlled` turns history off. The
 * progress step must be > 0, the history limit ≥ 1 (whole steps) and `coalesceMs` ≥ 0, else the
 * default is used.
 */
export function resolveEditing(editing: boolean | GanttEditingOptions | undefined): ResolvedEditing {
  if (!editing) {
    return {
      enabled: false,
      cells: false,
      progress: false,
      dependencies: { create: false, delete: false, parentChild: false },
      validate: null,
      history: false,
      controlled: false,
    };
  }
  const o: GanttEditingOptions = editing === true ? {} : editing;
  const controlled = o.controlled ?? false;
  const progress = o.progress ?? true;
  const deps = o.dependencies ?? true;
  const history = o.history ?? true;
  const historyOpts: { limit?: number | undefined; coalesceMs?: number | undefined } | false =
    history === true ? {} : history;
  return {
    enabled: true,
    cells: o.cells ?? true,
    progress:
      progress === false
        ? false
        : { step: checked(progress === true ? undefined : progress.step, n => n > 0, DEFAULT_PROGRESS_STEP) },
    dependencies:
      deps === false
        ? { create: false, delete: false, parentChild: false }
        : deps === true
          ? { create: true, delete: true, parentChild: false }
          : { create: deps.create ?? true, delete: deps.delete ?? true, parentChild: deps.parentChild ?? false },
    validate: o.validate ?? null,
    history:
      controlled || historyOpts === false
        ? false
        : {
            limit: Math.floor(checked(historyOpts.limit, n => n >= 1, DEFAULT_HISTORY_LIMIT)),
            coalesceMs: checked(historyOpts.coalesceMs, n => n >= 0, DEFAULT_COALESCE_MS),
          },
    controlled,
  };
}

/** The base name of an exported file when `export.fileName` is not set. */
export const DEFAULT_EXPORT_FILE_NAME = 'gantt';

/** The toolbar Export menu's items when `export.formats` is not set. */
export const DEFAULT_EXPORT_FORMATS: readonly GanttExportFormat[] = Object.freeze(['svg', 'png', 'csv', 'print']);

const IMAGE_DEFAULTS: ResolvedImageExport = {
  view: 'auto',
  range: undefined,
  theme: 'current',
  background: 'theme',
  legend: undefined,
  today: undefined,
  title: undefined,
  description: undefined,
  customBars: 'render',
};

/**
 * Every format's defaults (`resolveExportFormat` without a base), frozen: shared by every config
 * that sets nothing. The PNG and print numbers are `PNG_DEFAULT_SCALE`, `PNG_MAX_SIDE`,
 * `PNG_MAX_PIXELS`, `PRINT_DEFAULT_MARGIN_MM`, `PRINT_MIN_SCALE` and `PRINT_MAX_PAGES` (`export/`),
 * repeated here so this module imports none of the export code; a test keeps them equal.
 */
const FORMAT_DEFAULTS: { readonly [F in GanttExportFormat]: Readonly<ResolvedExport[F]> } = {
  svg: Object.freeze({ ...IMAGE_DEFAULTS, scale: 1, idPrefix: undefined }),
  png: Object.freeze({ ...IMAGE_DEFAULTS, scale: 2, maxSide: 16_384, maxPixels: 16_777_216 }),
  csv: Object.freeze({
    columns: 'visible',
    rows: 'all',
    values: 'data',
    delimiter: ',',
    header: true,
    bom: true,
    neutralizeFormulas: true,
  }),
  print: Object.freeze({
    ...IMAGE_DEFAULTS,
    theme: 'light',
    paper: 'a4',
    orientation: 'landscape',
    margin: 10,
    fit: 'width',
    scale: 1,
    minScale: 0.5,
    repeatHeader: true,
    repeatTable: true,
    pageNumbers: true,
    maxPages: 200,
  }),
};

/**
 * The numeric fields and the values they accept (others keep the base value); `maxPages` is
 * rounded down to whole pages.
 */
const EXPORT_NUMBERS: Readonly<Record<string, (n: number) => boolean>> = {
  scale: n => n > 0,
  minScale: n => n > 0,
  maxSide: n => n >= 1,
  maxPixels: n => n >= 1,
  maxPages: n => n >= 1,
  margin: n => n >= 0,
};

/**
 * The shorter side of each named paper in mm (`PAPER_SIZES_MM` of `export/paginate.ts`, repeated
 * so this module imports none of the export code; a test keeps them equal).
 */
const PAPER_SHORT_SIDE_MM: Readonly<Record<string, number>> = {
  a4: 210,
  a3: 297,
  letter: 215.9,
  legal: 215.9,
  tabloid: 279.4,
};

/** The shorter side of `paper` in mm, as `paginateChart` reads it (an unknown or invalid paper is A4). */
function paperShortSideMm(paper: GanttPaperSize): number {
  if (typeof paper !== 'object') return PAPER_SHORT_SIDE_MM[paper] ?? 210;
  const short = Math.min(paper.width, paper.height) * (paper.unit === 'in' ? 25.4 : 1);
  // Both sides positive (`NaN` fails too) and finite
  return short > 0 && Number.isFinite(paper.width + paper.height) ? short : 210;
}

/** The function of every config without a `fileName` (or with the default one). */
const defaultFileName = (): string => DEFAULT_EXPORT_FILE_NAME;

/** Most configured names `fileNameOf` keeps a function for (the least recently used goes first). */
const FILE_NAME_CACHE_SIZE = 32;

/** One function per recently configured name (`ResolvedExport.fileName`): equal options resolve equal. */
const fileNameFns = new Map<string, (format: 'svg' | 'png' | 'csv') => string>();

function fileNameOf(name: GanttExportOptions['fileName']): ResolvedExport['fileName'] {
  if (typeof name === 'function') return name;
  if (typeof name !== 'string' || name === DEFAULT_EXPORT_FILE_NAME) return defaultFileName;
  let fn = fileNameFns.get(name);
  // Used again: the most recent one (a Map keeps insertion order)
  if (fn) fileNameFns.delete(name);
  else fn = () => name;
  fileNameFns.set(name, fn);
  if (fileNameFns.size > FILE_NAME_CACHE_SIZE) fileNameFns.delete(fileNameFns.keys().next().value!);
  return fn;
}

/**
 * One format's options over `base` (default: the built-in defaults): a set field of the format
 * wins, an unset one keeps the base value, and so does a number out of range (a scale or limit
 * ≤ 0, a negative margin or one that leaves no room on the paper — twice the margin at least its
 * shorter side —, fewer than 1 page). `resolveConfig` resolves `options.export.<format>`
 * with it, `resolveExportCall` (`export/files.ts`) a call's options over `config.export.<format>`.
 */
export function resolveExportFormat<F extends GanttExportFormat>(
  format: F,
  options: GanttExportOptions[F],
  base?: ResolvedExport[F],
): ResolvedExport[F] {
  const b = base ?? (FORMAT_DEFAULTS[format] as ResolvedExport[F]);
  if (!options) return b;
  const o = options as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = { ...(b as object) };
  for (const key in b) {
    const v = o[key];
    const ok = EXPORT_NUMBERS[key];
    if (v !== undefined && (!ok || (typeof v === 'number' && Number.isFinite(v) && ok(v))))
      out[key] = key === 'maxPages' ? Math.floor(v as number) : v;
  }
  // A print margin set here must leave room on the paper (`paginateChart` throws when the base one doesn't)
  const margin = o['margin'];
  if (
    typeof margin === 'number' &&
    out['margin'] === margin &&
    2 * margin >= paperShortSideMm(out['paper'] as GanttPaperSize)
  )
    out['margin'] = (b as ResolvedPrintExport).margin;
  return out as unknown as ResolvedExport[F];
}

/** `options.export` with every default filled (`ResolvedGanttConfig.export`). */
export function resolveExport(o: GanttExportOptions | undefined): ResolvedExport {
  return {
    fileName: fileNameOf(o?.fileName),
    // The known formats, each once, in order
    formats: o?.formats
      ? o.formats.filter((f, i, all) => DEFAULT_EXPORT_FORMATS.includes(f) && all.indexOf(f) === i)
      : [...DEFAULT_EXPORT_FORMATS],
    svg: resolveExportFormat('svg', o?.svg),
    png: resolveExportFormat('png', o?.png),
    csv: resolveExportFormat('csv', o?.csv),
    print: resolveExportFormat('print', o?.print),
  };
}

/** A known `density`, else `'normal'` (untyped callers). */
const densityOf = (d: GanttDensity | undefined): GanttDensity =>
  d === 'compact' || d === 'comfortable' ? d : 'normal';

/** Epoch day of a date (local calendar). */
const epochDay = (d: Date) => Math.floor(calendarDays(d));

const NON_WORKING_STYLES: readonly ResolvedNonWorking['style'][] = ['shade', 'hatch', 'disabled', 'none'];

/**
 * `options.nonWorkingTime` resolved (`null` for `false`). `defaultHours` are the working hours
 * used when `workingHours` is not set (`resolveConfig` passes `DEFAULT_WORKING_HOURS` for an hour
 * calendar; otherwise unset hours mean no off-hours shading). An unknown `style` reads as `'shade'`.
 */
export function resolveNonWorking(
  opts: GanttOptions['nonWorkingTime'],
  defaultHours?: readonly GanttHourRange[] | null,
): ResolvedNonWorking | null {
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
  // The defaults only stand in for unset hours (an empty list keeps meaning "no working hours")
  const wh = o.workingHours || (defaultHours ? [...defaultHours] : undefined);
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
    style: o.style && NON_WORKING_STYLES.includes(o.style) ? o.style : 'shade',
    showInHeader: o.showInHeader ?? true,
    minPxPerDay: o.minPxPerDay ?? 12,
  };
}

/** `options.calendar` turns on an hour calendar (`unit: 'hour'`). */
const isHourCalendar = (c: GanttOptions['calendar']): boolean =>
  typeof c === 'object' && c !== null && c.unit === 'hour';

/** The working hours to resolve `nonWorkingTime` with: the defaults for an hour calendar without its own. */
const defaultHoursFor = (
  calendar: GanttOptions['calendar'],
  nonWorking: GanttNonWorkingTime | false | undefined,
): readonly GanttHourRange[] | null =>
  isHourCalendar(calendar) && !(nonWorking && nonWorking.workingHours) ? DEFAULT_WORKING_HOURS : null;

/**
 * `options.calendar` resolved over the resolved `nonWorkingTime` (`null` there: no non-working
 * time, every day — and with `unit: 'hour'` every hour — works). Off (`null`) unless `true` or
 * an object, and when the week has no working time. Unknown `durations` / `unit` values read as
 * the defaults; `hoursPerDay` must be finite, more than 0 and at most 24, else 8.
 */
export function resolveCalendar(
  opts: GanttOptions['calendar'],
  nonWorking: ResolvedNonWorking | null,
): ResolvedCalendar | null {
  if (opts !== true && (typeof opts !== 'object' || opts === null)) return null;
  const o: GanttCalendarOptions = opts === true ? {} : opts;
  const unit: GanttCalendarUnit = o.unit === 'hour' ? 'hour' : 'day';
  const built = buildWorkingTime(nonWorking, unit);
  if (!built) return null;
  const { working } = built;
  const durations: GanttDurationMode = o.durations === 'calendar' ? 'calendar' : 'working';
  const skipNonWorking = o.skipNonWorking !== false;
  const hoursPerDay = checked(o.hoursPerDay, n => n > 0 && n <= 24, DEFAULT_HOURS_PER_DAY);
  let daysPerWeek = 0;
  for (let day = 0; day < 7; day++) if (working.hoursOn(day) > 0) daysPerWeek++;
  return {
    durations,
    unit,
    skipNonWorking,
    hoursPerDay,
    daysPerWeek,
    working,
    key: [durations, unit, skipNonWorking ? 'skip' : 'keep', hoursPerDay, built.key].join('|'),
  };
}

/**
 * The working calendar of `options` (`calendar` and `nonWorkingTime`), resolved as the chart
 * resolves them, for scheduling in an app or in Node: `calendar` unset (or `false`) reads as
 * `true` (working days, Saturday and Sunday off). `null` when the week has no working time.
 *
 * ```ts
 * const cal = createWorkingCalendar({ nonWorkingTime: { holidays: [new Date(2026, 11, 25)] } });
 * // Thu 24 Dec is the first working day, Fri 25 is the holiday, Mon 28 is the second: it ends
 * // right after it, at Tue 29 Dec 00:00
 * cal?.addWorking(new Date(2026, 11, 24), 2);
 * ```
 */
export function createWorkingCalendar(
  options: Pick<GanttOptions, 'nonWorkingTime' | 'calendar'> = {},
): WorkingCalendar | null {
  const calendar = options.calendar || true;
  const nonWorking = resolveNonWorking(options.nonWorkingTime, defaultHoursFor(calendar, options.nonWorkingTime));
  return resolveCalendar(calendar, nonWorking)?.working ?? null;
}

/** Just the date reading of `r` (a config, a column context): what `sameDateReading` compares. */
export function dateReadingOf(r: DateReading): DateReading {
  return { endDateMode: r.endDateMode, normalizeDateOnly: r.normalizeDateOnly, calendar: r.calendar ?? null };
}

/**
 * Whether two readings measure task dates the same way: equal end-date rules, equal date-only
 * normalisation and equal calendar keys (`null` and unset are equal). The bindings' cut-off for
 * the critical path, rollups and the column context.
 */
export function sameDateReading(a: DateReading, b: DateReading): boolean {
  return (
    a === b ||
    (a.endDateMode === b.endDateMode &&
      a.normalizeDateOnly === b.normalizeDateOnly &&
      (a.calendar?.key ?? null) === (b.calendar?.key ?? null))
  );
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
  const nonWorking = resolveNonWorking(
    options.nonWorkingTime,
    defaultHoursFor(options.calendar, options.nonWorkingTime),
  );

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
    nonWorking,
    highlightTime: options.highlightTime,
    endDateMode: options.endDateMode ?? 'exclusive',
    normalizeDateOnly: options.normalizeDateOnly ?? true,
    calendar: resolveCalendar(options.calendar, nonWorking),
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
            undo: toolbar?.undo ?? true,
            export: toolbar?.export ?? false,
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
    editing: resolveEditing(options.editing),
    export: resolveExport(options.export),
  };
}

/** Resolve a `GanttLength` against a reference size (`'40%'` of 200 → 80). */
export function resolveLength(len: GanttLength | undefined, reference: number, fallback: number): number {
  if (len == null) return fallback;
  if (typeof len === 'number') return len;
  const pct = parseFloat(len);
  return Number.isFinite(pct) ? (reference * pct) / 100 : fallback;
}
