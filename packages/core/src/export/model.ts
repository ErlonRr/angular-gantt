// ─────────────────────────────────────────────────────────────
//  gantry · export/model.ts
//  The export model (Phase 12, D2–D4): the whole drawing of a chart
//  snapshot — sizes, the theme every paint is resolved against, the
//  rows, the table, the timeline, the legend, the empty state — in
//  drawing coordinates with every colour concrete (no `var(`). The SVG
//  serializer (`renderExportSvg`), the pagination (`paginateChart`)
//  and the PNG plan (`planRaster`) read it; no binding computes any of
//  it. Layout, top to bottom: the header row (table column headers |
//  timeline tiers and marker lane), the body rows, the legend strip.
// ─────────────────────────────────────────────────────────────

import type { GanttFlatRow, GanttTheme } from '../types';
import type { ResolvedImageExport } from '../render/config';
import { MARKER_LANE_HEIGHT, markerLaneShown } from '../render/markers';
import { resolvePaint, rowPaint } from '../render/paint';
import { themeMetrics } from '../render/theme';
import type { TimelineModel } from '../render/timeline';
import { buildLegend } from '../state/legend';
import { calendarDays, formatDate } from '../gantt-math';
import { exportTheme, exportTimeline, type ChartExportSource } from './source';
import { buildTimelinePart, exportBodyHeight, type ExportTimeline, type Stroke } from './timeline';
import { buildTablePart, type ExportTable } from './table';
import { buildLegendPart, type ExportLegend } from './legend';

/** One body row: its background across the drawing (zebra, row colour) and its separator. */
export interface ExportRow {
  /** The task id */
  id: string;
  /** Top of the row, relative to the body (the header's bottom) */
  y: number;
  height: number;
  /** Resolved background colour */
  fill: string;
  /** The row separator (`gridLines.horizontal`), or `null` */
  separator: Stroke | null;
}

/** Everything an export draws, in drawing px (before `scale`). */
export interface ExportModel {
  /** Size of the drawing: table + timeline wide; header + body + legend tall */
  width: number;
  height: number;
  /** The export theme (`exportTheme`): every paint below is resolved against it */
  theme: Required<GanttTheme>;
  /** Background colour, or `null` for a transparent image */
  background: string | null;
  /** `theme.fontFamily` */
  fontFamily: string;
  /** Chart font size in px (`themeMetrics(theme).fontPx`: what bar labels and fitting use) */
  fontPx: number;
  /** `<title>` (`title`, else `labels.ariaChart`) */
  title: string;
  /** `<desc>` (`description`, else `labels.exportDescription(count, start, end)`) */
  description: string;
  /** `lang` of the image: the chart's locale (`'en'` without one: the default labels) */
  lang: string;
  /** Height of the header: tiers and marker lane (the table's column headers match it) */
  headerHeight: number;
  /** Height of the body: every shown row (`EXPORT_EMPTY_ROWS` rows when there is none) */
  bodyHeight: number;
  /** The shown rows in display order */
  rows: ExportRow[];
  /** The task list (split and table views, with columns), else `null`; its left edge is x 0 */
  table: ExportTable | null;
  /** The timeline (split and chart views) at `timeline.x` = the table's width, else `null` */
  timeline: ExportTimeline | null;
  /** The legend strip at the bottom (`legend` with entries, not in the table view), else `null` */
  legend: ExportLegend | null;
  /**
   * No row to draw: `labels.emptyState` centred in the body (drawing coordinates: `x` the
   * drawing's middle, `y` the body's), else `null`
   */
  empty: { text: string; x: number; y: number } | null;
}

/**
 * The dates `labels.exportDescription` names: the earliest start and the latest end of the drawn
 * rows' tasks as the Start / End columns show them, kept inside the drawn range (`x0…x1`).
 */
function describedDates(
  source: ChartExportSource,
  rows: readonly GanttFlatRow[],
  timeline: TimelineModel,
  x0: number,
  x1: number,
): { start: Date; end: Date } | null {
  const norm = source.config.normalizeDateOnly;
  let start: Date | null = null;
  let end: Date | null = null;
  let startDays = Infinity;
  let endDays = -Infinity;
  for (const { task } of rows) {
    const s = task.start;
    const e = task.end ?? task.start;
    const sd = calendarDays(s, norm);
    const ed = calendarDays(e, norm);
    if (sd < startDays) [startDays, start] = [sd, s];
    if (ed > endDays) [endDays, end] = [ed, e];
  }
  if (!start || !end) return null;
  const first = timeline.toDate(x0);
  // The last instant drawn: the range's end is exclusive
  const last = new Date(timeline.toDate(x1).getTime() - 1);
  return {
    start: calendarDays(first, false) > startDays ? first : start,
    end: calendarDays(last, false) < endDays ? last : end,
  };
}

/**
 * The model of a chart snapshot for one image export (`opts` from `resolveExportCall`): the view
 * (`'auto'` = `source.view`), the theme (`exportTheme`), the range (`exportTimeline`), and the
 * chart's own values for `legend` (`showLegend` with entries), `today` (`showToday`), `title`
 * (`labels.ariaChart`) and `description` (`labels.exportDescription`, dates through `formatDate`
 * with `formats.dateFormat` and the locale) where `opts` leaves them `undefined`.
 *
 * Layout: the table (split and table views) from x 0, the timeline (split and chart views) at the
 * table's width; the header row on top (the timeline's tiers and marker lane: the table view's
 * column headers keep that height too), the body under it, the legend strip at the bottom. Every
 * shown row is drawn (not virtualised); an empty chart draws a body `EXPORT_EMPTY_ROWS` rows tall
 * with `labels.emptyState` in its middle.
 */
export function buildExportModel(source: ChartExportSource, opts: ResolvedImageExport): ExportModel {
  const cfg = source.config;
  const { labels, formats, locale } = source.i18n;
  const view = opts.view === 'auto' ? source.view : opts.view;
  const theme = exportTheme(source, opts.theme);
  const fontPx = themeMetrics(theme).fontPx;
  const today = opts.today ?? cfg.showToday;
  const { timeline, x0, x1 } = exportTimeline(source, opts.range ?? 'all');

  const rows = source.rows;
  const rowHeight = cfg.rowHeight;
  const bodyHeight = exportBodyHeight(rows.length, rowHeight);
  const drawsTimeline = view !== 'table';
  const laneHeight = drawsTimeline && markerLaneShown(cfg, source.annotations, view) ? MARKER_LANE_HEIGHT : 0;
  const headerHeight = timeline.headerHeight + laneHeight;

  // The task list: the split panel's columns at the panel's width, or the table view's at the
  // pane's width; columns wider in total make it wider (`ExportTable.width`)
  const columns = view === 'chart' ? [] : view === 'table' ? source.columns.table : source.columns.split;
  const tableOpts = {
    width: view === 'table' ? (source.tableWidth ?? 0) : source.panelWidth,
    headerHeight,
    theme,
    fontPx,
  };
  const table =
    columns.length > 0 && (view === 'table' || source.panelWidth > 0)
      ? buildTablePart(source, rows, columns, tableOpts)
      : null;
  const tableWidth = table?.width ?? 0;

  const part = drawsTimeline
    ? buildTimelinePart({ source, timeline, x0, x1, x: tableWidth, theme, today, fontPx })
    : null;
  const width = tableWidth + (part?.width ?? 0);

  const horizontal = cfg.gridLines.horizontal;
  const separator: Stroke | null = horizontal && {
    stroke: resolvePaint(horizontal.paint, theme),
    width: horizontal.width,
    dash: horizontal.dash ?? null,
  };
  const exportRows = rows.map((row): ExportRow => ({
    id: row.task.id,
    y: row.visibleIndex * rowHeight,
    height: rowHeight,
    fill: resolvePaint(rowPaint({ row }, false, source.rowStyle(row)), theme),
    separator,
  }));

  // The legend under the body: as the chart's (`showLegend`) unless the call says, never without a timeline
  let legend: ExportLegend | null = null;
  if (part && (opts.legend ?? source.showLegend)) {
    const items = buildLegend({
      showToday: today,
      todayVisible: part.todayX !== null,
      annotations: source.annotations,
      labels,
      criticalPath: cfg.criticalPath,
      baseline: cfg.baseline,
    });
    if (items.length > 0) {
      const strip = buildLegendPart(items, { width, theme, fontPx, title: labels.legend, locale });
      legend = { ...strip, y: headerHeight + bodyHeight };
    }
  }

  const dates = describedDates(source, rows, timeline, x0, x1);
  const fmt = (d: Date) => formatDate(d, formats.dateFormat, locale);
  const description =
    opts.description ??
    (dates ? labels.exportDescription(rows.length, fmt(dates.start), fmt(dates.end)) : labels.emptyState);

  return {
    width,
    height: headerHeight + bodyHeight + (legend?.height ?? 0),
    theme,
    background:
      opts.background === 'transparent'
        ? null
        : opts.background === 'theme' || !opts.background
          ? theme.backgroundColor
          : opts.background,
    fontFamily: theme.fontFamily,
    fontPx,
    title: opts.title ?? labels.ariaChart,
    description,
    lang: locale || 'en',
    headerHeight,
    bodyHeight,
    rows: exportRows,
    table,
    timeline: part,
    legend,
    empty: rows.length === 0 ? { text: labels.emptyState, x: width / 2, y: headerHeight + bodyHeight / 2 } : null,
  };
}
