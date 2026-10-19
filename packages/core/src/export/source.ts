// ─────────────────────────────────────────────────────────────
//  gantry · export/source.ts
//  The chart an export draws (Phase 12, D2 / D27): a snapshot of
//  everything the painters read — config, i18n, theme, tasks, the
//  shown and all rows, columns with their current widths, styles,
//  segments, the critical ids, annotations, the clock, view and panel
//  widths, the sync group's range, the viewport. Both bindings build
//  it from their graph at call time (`.peek()` / `untracked`), and
//  `createExportSource` builds it headless (Node, workers, SSR) with
//  the Web Component's rows pipeline, so the same chart gives the
//  same SVG and CSV everywhere.
// ─────────────────────────────────────────────────────────────

import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  type ColumnContext,
  type ColumnDef,
  type GanttAnnotation,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttI18n,
  type GanttOptions,
  type GanttRollupInfo,
  type GanttTask,
  type GanttTheme,
  type GanttThemeOverrides,
  type GanttView,
  type ResolvedTaskStyle,
} from '../types';
import { resolveConfig, type ResolvedGanttConfig } from '../render/config';
import type { BarSegment } from '../render/bars';
import { bottomScale, periodNext, unitStart } from '../render/scales';
import { buildTimeline, type SharedTimelineRange, type TimelineModel } from '../render/timeline';
import { resolveTheme, themeMetrics } from '../render/theme';
import { createStyleResolver } from '../render/styles';
import { quantizeNow } from '../render/today';
import {
  buildBuiltinColumns,
  buildColumnContext,
  clampColumnWidth,
  findColumn,
  mergeColumnDefs,
  resolveViewColumns,
} from '../render/columns';
import { taskOwnStyle } from '../render/task-style';
import { computeCriticalPath } from '../gantt-cpm';
import { applyRollups, computeRollups, rollupSegments } from '../gantt-rollup';
import { columnComparator, filterVisible, flattenTree, normalizeTasks, reindexVisible, sortTree } from '../gantt-data';
import { toLocalDay, type TimelineRange } from '../gantt-math';
import { seedCollapsed } from '../state/collapse';
import { viewFromOptions } from '../state/view';

/**
 * Renders one custom bar for an export (D5): the bar's SVG markup (an element, outer markup,
 * sanitized: no `script`, `foreignObject` or `on*`), or `null` for the built-in bar. Its
 * `var(--gantt-*)` paints are resolved with the export theme (`inlineThemeVars`) by
 * `buildTimelinePart`.
 */
export type ExportCustomBar = (ctx: GanttBarContext) => string | null;

/**
 * A collapsed rolled-up parent's child segments on a timeline (`exportSegments`): `toX` is the
 * export timeline's, so a range that moves the timeline's start moves the segments with the bars.
 */
export type ExportSegments = (row: GanttFlatRow, toX: (date: Date) => number) => readonly BarSegment[] | null;

/** A snapshot of a chart: what `buildExportModel` and `exportChartCsv` read. Never mutated. */
export interface ChartExportSource {
  /** The resolved config (zoom level shown, `export` defaults…) */
  readonly config: ResolvedGanttConfig;
  readonly i18n: GanttI18n;
  /** The theme shown: `resolveTheme(dark, themeOverrides)` */
  readonly theme: Required<GanttTheme>;
  /** The dark palette is shown */
  readonly dark: boolean;
  /** The chart's theme overrides (`options.theme` and the theme property / input), or `null` */
  readonly themeOverrides: GanttThemeOverrides | null;
  /** Normalised tasks (rollups applied), in input order */
  readonly tasks: readonly GanttTask[];
  /** The shown rows in display order (collapse and sort applied), reindexed from 0 */
  readonly rows: readonly GanttFlatRow[];
  /** Every row in display order, hidden children of collapsed rows included */
  readonly allRows: readonly GanttFlatRow[];
  /**
   * Columns with their current widths: the split panel's (`split`), the table view's (`table`)
   * and the catalogue of every built-in and custom column (`all`, `exportColumnCatalogue`)
   */
  readonly columns: {
    readonly split: readonly ColumnDef[];
    readonly table: readonly ColumnDef[];
    readonly all: readonly ColumnDef[];
  };
  /** What the cell renderers read (`buildColumnContext`: now, date reading, task index) */
  readonly columnCtx: ColumnContext;
  /** A row's resolved style (core `createStyleResolver`) */
  readonly rowStyle: (row: GanttFlatRow) => ResolvedTaskStyle;
  /**
   * A collapsed rolled-up parent's child segments on the export timeline (`toX`), else `null`
   * (`exportSegments`)
   */
  readonly segments: ExportSegments;
  /** Ids of the tasks on the critical path (empty without `criticalPath`) */
  readonly critical: ReadonlySet<string>;
  readonly annotations: readonly GanttAnnotation[];
  /** The clock tick the chart shows (today line, statuses) */
  readonly now: Date;
  /** The view shown (the responsive switch included) */
  readonly view: GanttView;
  /** Width of the split panel in px */
  readonly panelWidth: number;
  /** Width of the table view's pane in px (the chart's width), `null` when unknown (headless) */
  readonly tableWidth: number | null;
  /** The sync group's shared range, `null` outside a group */
  readonly shared: SharedTimelineRange | null;
  /** The chart shows its legend (`showLegend`) */
  readonly showLegend: boolean;
  /** The timeline px on screen (`range: 'visible'`), `null` headless or while not measured */
  readonly viewport: { readonly x0: number; readonly x1: number } | null;
  /** Custom bars (`customBars: 'render'`, D5), `null` for built-in bars only */
  readonly customBar: ExportCustomBar | null;
}

/** What `createExportSource` builds a chart from, without a binding (Node, workers, SSR). */
export interface GanttHeadlessInput {
  tasks: readonly GanttTask[];
  options?: GanttOptions | undefined;
  /** Custom columns (as the binding's `columns`); `options.columns` wins */
  columns?: readonly ColumnDef[] | undefined;
  /** Annotations; default `options.annotations` */
  annotations?: readonly GanttAnnotation[] | undefined;
  /** The instant drawn as now. Default: the current time */
  now?: Date | undefined;
  /** The dark palette (`darkMode: 'auto'` has no screen to ask). Default `options.darkMode === true` */
  dark?: boolean | undefined;
  /** Collapsed row ids. Default: seeded from `task.collapsed` and `groupBar.collapsed` (`seedCollapsed`) */
  collapsedIds?: Iterable<string> | undefined;
  /** Sort of the rows. Default none */
  sort?: { key: string; dir: 'asc' | 'desc' } | null | undefined;
  /** The view drawn. Default `options.view` (`'chart'` with `panel.collapsed`), else `'split'` */
  view?: GanttView | undefined;
  /** Split panel width in px. Default: `panel.width` in px, else the split columns' total width */
  panelWidth?: number | undefined;
  /** Draw the legend (the element's `showLegend`). Default false */
  showLegend?: boolean | undefined;
  /** Custom bar markup (D5). Default none: built-in bars */
  customBar?: ExportCustomBar | undefined;
}

/**
 * Locale, labels and formats of `options` over the defaults (nested `labels.viewModes` and
 * `formats.header` merged): the Web Component's `i18n`.
 */
function i18nOf(o: GanttOptions): GanttI18n {
  const labels = o.labels ?? {};
  const formats = o.formats ?? {};
  return {
    locale: o.locale,
    labels: { ...DEFAULT_LABELS, ...labels, viewModes: { ...DEFAULT_LABELS.viewModes, ...labels.viewModes } },
    formats: { ...DEFAULT_FORMATS, ...formats, header: { ...DEFAULT_FORMATS.header, ...formats.header } },
  };
}

/**
 * The CSV catalogue (`columns: 'all'`, `ChartExportSource.columns.all`): every built-in column in
 * its order — the consumer's definition in its place when it has the same key — then the
 * consumer's own columns in their order. `columns` are the consumer columns merged over the
 * built-ins (`mergeColumnDefs`), or the built-ins; both with their current widths.
 */
export function exportColumnCatalogue<T extends ColumnDef>(columns: readonly T[], builtins: readonly T[]): T[] {
  const custom = new Map(columns.map(c => [c.key, c]));
  const out = builtins.map(b => custom.get(b.key) ?? b);
  const builtinKeys = new Set(builtins.map(b => b.key));
  for (const c of columns) if (!builtinKeys.has(c.key)) out.push(c);
  return out;
}

/** What `exportSegments` reads: the chart's rollups, rows and styles. */
export interface ExportSegmentsInput {
  config: Pick<ResolvedGanttConfig, 'rollup' | 'endDateMode' | 'normalizeDateOnly' | 'bar'>;
  /** Rolled-up values by parent id (`computeRollups`); empty without `rollup` */
  rollups: ReadonlyMap<string, GanttRollupInfo>;
  /** Every row in display order (`ChartExportSource.allRows`): the children's styles */
  allRows: readonly GanttFlatRow[];
  rowStyle: (row: GanttFlatRow) => ResolvedTaskStyle;
}

/**
 * `ChartExportSource.segments`, as both bindings draw them (`rollup.segments`): a collapsed
 * rolled-up parent's children (`rollupSegments`), each in its row's style colour (its own style
 * when it has no row), on the timeline of `toX`; `null` for every other row.
 */
export function exportSegments(input: ExportSegmentsInput): ExportSegments {
  const { config: cfg, rollups, allRows, rowStyle } = input;
  const rollup = cfg.rollup;
  if (!rollup || !rollup.segments || rollups.size === 0) return () => null;
  let rowById: Map<string, GanttFlatRow> | undefined;
  const styleOf = (child: GanttTask): ResolvedTaskStyle => {
    rowById ??= new Map(allRows.map(r => [r.task.id, r]));
    const row = rowById.get(child.id);
    return row ? rowStyle(row) : taskOwnStyle(child);
  };
  return (row, toX) => {
    if (!row.hasChildren || !row.isCollapsed) return null;
    const info = rollups.get(row.task.id);
    return info ? rollupSegments(info, { toX, cfg, styleOf }) : null;
  };
}

/**
 * The split panel's width without a measured host: `panel.width` in px, else (a percentage of a
 * host there is none of) the split columns' total width.
 */
function headlessPanelWidth(width: ResolvedGanttConfig['panel']['width'], columns: readonly ColumnDef[]): number {
  if (typeof width === 'number' && Number.isFinite(width)) return Math.max(0, width);
  return columns.reduce((sum, c) => sum + c.width, 0);
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * A chart snapshot without a binding: the Web Component's rows pipeline (normalise → rollups →
 * flatten → sort → shown rows), `buildBuiltinColumns` + `mergeColumnDefs` + `resolveViewColumns`,
 * `createStyleResolver`, `rollupSegments` and `computeCriticalPath`. Pure: the same input gives
 * the same source, so `exportChartSvg(createExportSource(input))` is deterministic.
 */
export function createExportSource(input: GanttHeadlessInput): ChartExportSource {
  const { now = new Date() } = input;
  const options = input.options ?? {};
  const i18n = i18nOf(options);
  const dark = input.dark ?? options.darkMode === true;
  const themeOverrides = options.theme ?? null;
  const theme = resolveTheme(dark, themeOverrides ?? undefined);
  const config = resolveConfig(options, i18n, { barRadius: themeMetrics(theme).barRadius });
  // Rollup statuses and style rules read the day (`quantizeNow`), the cells the exact tick
  const nowDay = quantizeNow(now, bottomScale(config.scales).unit);
  const dates = { endDateMode: config.endDateMode, normalizeDateOnly: config.normalizeDateOnly };

  const tasks = normalizeTasks([...input.tasks]);
  const critical = config.criticalPath ? computeCriticalPath(tasks, dates).criticalIds : null;
  const rollup = config.rollup;
  const rollups = rollup ? computeRollups(tasks, rollup, { now: nowDay, dates }) : new Map<string, GanttRollupInfo>();
  const columnCtx = buildColumnContext({ tasks, config: dates, now, locale: i18n.locale });

  // Columns: the consumer's (`options.columns` wins) over the built-ins, each at its width
  const builtinDefs = buildBuiltinColumns(i18n.labels, i18n.locale, i18n.formats.dateFormat);
  const customDefs = options.columns?.length ? options.columns : (input.columns ?? null);
  const apply = (c: ColumnDef): ColumnDef => ({
    ...c,
    width: clampColumnWidth(c.width, c),
    visible: c.visible ?? true,
  });
  const builtins = builtinDefs.map(apply);
  const catalogue = (customDefs ? mergeColumnDefs(customDefs, builtinDefs) : builtinDefs).map(apply);
  const viewColumns = (view: 'split' | 'table') =>
    resolveViewColumns({ columns: catalogue, builtins, custom: customDefs !== null, view, config });
  const split = viewColumns('split');

  // Rows: rolled up before the sort (a parent sorts by its rolled-up values), then the shown ones
  const collapsed = new Set(
    input.collapsedIds ?? seedCollapsed(input.tasks, undefined, config.groupBar.collapsed).collapse,
  );
  let allRows = applyRollups(flattenTree(tasks, collapsed), rollups, rollup);
  if (input.sort) {
    const column = findColumn(catalogue, builtins, input.sort.key);
    allRows = sortTree(allRows, columnComparator(input.sort.key, input.sort.dir, { column, ctx: columnCtx }));
  }
  const rows = reindexVisible(filterVisible(allRows));

  const rowStyle = createStyleResolver({ config, critical, rollups, now: nowDay });
  return {
    config,
    i18n,
    theme,
    dark,
    themeOverrides,
    tasks,
    rows,
    allRows,
    columns: { split, table: viewColumns('table'), all: exportColumnCatalogue(catalogue, builtins) },
    columnCtx,
    rowStyle,
    segments: exportSegments({ config, rollups, allRows, rowStyle }),
    critical: critical ?? NO_IDS,
    annotations: input.annotations ?? options.annotations ?? [],
    now,
    view: input.view ?? viewFromOptions(options) ?? config.view,
    panelWidth: input.panelWidth ?? headlessPanelWidth(config.panel.width, split),
    tableWidth: null,
    shared: null,
    showLegend: input.showLegend ?? false,
    viewport: null,
    customBar: input.customBar ?? null,
  };
}

/**
 * The theme an export draws with (D4): `'current'` = `source.theme`; `'light'` / `'dark'` =
 * `resolveTheme(mode === 'dark', source.themeOverrides)`.
 */
export function exportTheme(source: ChartExportSource, mode: 'current' | 'light' | 'dark'): Required<GanttTheme> {
  if (mode !== 'light' && mode !== 'dark') return source.theme;
  return resolveTheme(mode === 'dark', source.themeOverrides ?? undefined);
}

/** Earliest start and latest end of two ranges (either may be missing). */
function unionRange(a: TimelineRange | null | undefined, b: TimelineRange): TimelineRange {
  if (!a) return b;
  return { start: a.start <= b.start ? a.start : b.start, end: a.end >= b.end ? a.end : b.end };
}

const validDate = (d: unknown): d is Date => d instanceof Date && Number.isFinite(d.getTime());

/**
 * The timeline an export draws (D6): `buildTimeline` with `now: quantizeNow(now, unit)` and no
 * viewport fill; `x0` / `x1` are the drawn px. `'all'` = the natural range (with `shared`);
 * `'visible'` = `source.viewport` (`'all'` when `null`); dates extend the range, then clip to them.
 *
 * `'visible'` keeps the timeline the chart shows: with `fitToWidth` the end is extended by whole
 * bottom cells up to the viewport's right edge, as on screen. Dates are user dates (`toX`, read
 * per `normalizeDateOnly`), extended to whole bottom-scale cells for the timeline, then clipped
 * exactly; reversed dates are swapped, and invalid or equal ones draw `'all'`.
 */
export function exportTimeline(
  source: ChartExportSource,
  range: 'all' | 'visible' | { start: Date; end: Date },
): { timeline: TimelineModel; x0: number; x1: number } {
  const cfg = source.config;
  const bottom = bottomScale(cfg.scales);
  const base = {
    tasks: [...source.tasks],
    config: cfg,
    i18n: source.i18n,
    now: quantizeNow(source.now, bottom.unit),
    shared: source.shared,
  };
  const clampX = (x: number, total: number) => Math.min(Math.max(Math.round(x), 0), total);

  const vp = range === 'visible' ? source.viewport : null;
  if (vp && Number.isFinite(vp.x0) && Number.isFinite(vp.x1) && vp.x1 - vp.x0 >= 1) {
    // As on screen: the fill to the viewport's right edge only with `fitToWidth` (the loop's guard)
    const timeline = buildTimeline({ ...base, viewportWidth: Math.ceil(vp.x1) });
    const x0 = clampX(vp.x0, timeline.totalWidth);
    const x1 = clampX(vp.x1, timeline.totalWidth);
    if (x1 > x0) return { timeline, x0, x1 };
  }

  if (typeof range === 'object' && range !== null && validDate(range.start) && validDate(range.end)) {
    const [from, to] = range.start <= range.end ? [range.start, range.end] : [range.end, range.start];
    const norm = (d: Date) => (cfg.normalizeDateOnly ? toLocalDay(d) : d);
    const step = bottom.step ?? 1;
    // Whole bottom cells around the dates, so the header's first and last cells are whole
    const start = unitStart(norm(from), bottom.unit, step, cfg.weekStart);
    const lastCell = unitStart(norm(to), bottom.unit, step, cfg.weekStart);
    const end = lastCell.getTime() === norm(to).getTime() ? lastCell : periodNext(lastCell, bottom.unit, step);
    const shared: SharedTimelineRange = {
      range: unionRange(source.shared?.range, { start, end }),
      extent: source.shared?.extent ?? null,
    };
    const timeline = buildTimeline({ ...base, shared });
    const x0 = clampX(timeline.toX(from), timeline.totalWidth);
    const x1 = clampX(timeline.toX(to), timeline.totalWidth);
    if (x1 > x0) return { timeline, x0, x1 };
  }

  const timeline = buildTimeline(base);
  return { timeline, x0: 0, x1: timeline.totalWidth };
}
