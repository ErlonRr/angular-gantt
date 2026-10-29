// ─────────────────────────────────────────────────────────────
//  gantry · export/source.ts
//
//  The chart as core's `ChartExportSource` (Gantry 2 phase 12, D27), the
//  Web Component's `export/source.ts`: a snapshot read from the chart's
//  layout graph at call time, `untracked` — the tasks as now (edits
//  included, a drag in progress not), the zoom level, collapse, sort,
//  column widths and visibility, panel width. Core draws the export from
//  it (`buildExportModel`, `exportChartCsv`), so the same chart gives the
//  same SVG and CSV as `createExportSource` headless and as the Web
//  Component.
//
//    config, i18n, theme, dark   the graph's (zoom level shown)
//    themeOverrides              the theme service's overrides (`provideGantt({ theme })`,
//                                `options.theme`, `setTheme()` / `patchTheme()`); `null` when empty
//    tasks, rows, allRows        normalised tasks, shown rows, every row (the resource view's
//                                projected rows in `rows: 'resources'`, with their `utilization`)
//    columns                     split panel's, table view's and the catalogue
//                                (current widths)
//    rowStyle, segments          the style resolver; rollup segments on the
//                                export timeline
//    view, panelWidth            the view shown; the split panel's width (also
//                                in the table view)
//    tableWidth                  the chart's width (`null` until measured)
//    viewport                    the timeline px on screen (`null` until measured)
//    customBar                   custom bar components rendered off-screen
//                                (`GanttCanvasComponent.renderCustomBarMarkup`)
// ─────────────────────────────────────────────────────────────

import { untracked } from '@angular/core';
import {
  exportColumnCatalogue,
  exportSegments,
  resolvePanelWidth,
  type ChartExportSource,
  type ExportCustomBar,
  type GanttOptions,
  type GanttThemeOverrides,
} from '@gantryjs/core';

import type { GanttLayoutService } from '../layout/gantt-layout.service';
import type { GanttThemeService } from '../services/gantt-theme.service';
import type { GanttI18nService } from '../services/gantt-i18n.service';
import type { GanttColumnService } from '../columns/gantt-column.service';
import type { GanttScrollService } from '../scroll/gantt-scroll.service';

/** What a snapshot reads: the chart's services and the inputs no service holds. */
export interface GanttExportGraph {
  readonly layout: GanttLayoutService;
  readonly theme: GanttThemeService;
  readonly i18n: GanttI18nService;
  readonly columns: GanttColumnService;
  readonly scroll: GanttScrollService;
  /** The chart's `options` (its `theme`: the overrides the light and dark exports keep) */
  readonly options: () => GanttOptions;
  /** The chart's `showLegend` input */
  readonly showLegend: () => boolean;
}

/**
 * A snapshot of the chart (the same source `createExportSource` builds for the same inputs);
 * `customBar` draws the custom bars (`null`: built-in bars only).
 */
export function buildExportSource(graph: GanttExportGraph, customBar: ExportCustomBar | null): ChartExportSource {
  return untracked(() => snapshot(graph, customBar));
}

function snapshot(graph: GanttExportGraph, customBar: ExportCustomBar | null): ChartExportSource {
  const { layout: L, theme: T, columns } = graph;
  const config = L.cfg();
  const dark = T.isDark();
  const theme = T.resolvedTheme();
  const allRows = L.allRows();
  const rowStyle = L.rowStyle();
  const mainW = L.mainWidth();
  const canvasW = L.viewportWidth();
  const scrollLeft = graph.scroll.scrollLeft();
  return {
    config,
    i18n: graph.i18n.bundle(),
    theme,
    dark,
    // The overrides as written (global config, `options.theme`, `setTheme()`): a light or dark export re-resolves them
    themeOverrides: nonEmpty(T.overrides()),
    // In the resource view `tasks` and `rows` are the projected rows (the headless source's too)
    tasks: L.viewTasks() ?? L.tasks(),
    rows: L.visibleRows(),
    allRows,
    columns: {
      split: columns.columnsFor('split', config),
      table: columns.columnsFor('table', config),
      all: exportColumnCatalogue(columns.columns(), columns.builtins()),
    },
    columnCtx: L.columnContext(),
    rowStyle,
    segments: exportSegments({ config, rollups: L.rollups(), allRows, rowStyle }),
    critical: L.criticalIds(),
    annotations: L.annotations(),
    now: new Date(L.now()),
    view: L.view(),
    // The split panel's width in every view (the CSV's chart-view columns, a split export of a table view)
    panelWidth: resolvePanelWidth({
      view: 'split',
      panel: config.panel,
      userWidth: L.panelWidthPx(),
      hostWidth: mainW,
    }),
    tableWidth: mainW > 0 ? mainW : null,
    shared: L.shared(),
    showLegend: graph.showLegend(),
    viewport: canvasW > 0 ? { x0: scrollLeft, x1: scrollLeft + canvasW } : null,
    customBar,
    utilization: L.utilization(),
  };
}

/** `null` when there are no overrides (as the Web Component passes them). */
function nonEmpty(overrides: GanttThemeOverrides): GanttThemeOverrides | null {
  return Object.keys(overrides).length ? overrides : null;
}
