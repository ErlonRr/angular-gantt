/**
 * @file source.ts
 * The element's chart as core's `ChartExportSource` (Phase 12, D27), built from the values
 * `captureExport` (`engine/export-capture.ts`) read from the graph when the export method was
 * called — the tasks as then (edits included, a drag in progress not), the zoom level, collapse,
 * sort, column widths and visibility, panel width. Core draws the export from it (`buildExportModel`,
 * `exportChartCsv`), so the same chart gives the same SVG and CSV as `createExportSource` headless
 * and as Angular. Part of the lazy `export/` chunk.
 *
 *   config, i18n, theme, dark   the graph's (zoom level shown; dark from `darkMode` / the scheme)
 *   themeOverrides              `{ ...options.theme, ...setTheme() }`, `null` when empty
 *   tasks, rows, allRows        normalised tasks, shown rows, every row (rows pipeline, `graph/rows.ts`)
 *   columns                     split panel's, table view's and the catalogue (current widths)
 *   rowStyle, segments          the style resolver; rollup segments on the export timeline
 *   view, panelWidth            the view shown; the split panel's width (also in the table view)
 *   tableWidth                  the chart's width (`null` until measured)
 *   viewport                    the timeline px on screen (`null` until measured)
 *   customBar                   `renderBar(ctx, renderDefault)` serialized (`customBars: 'render'`)
 *
 * A custom renderer's node (a decorated `renderDefault()` one included) is serialized by
 * `serializeSvg`; `null` / `undefined`, or a node the sanitiser drops whole, draws core's built-in
 * bar. `renderDefault()` paints the export's visual (its paints already resolved) with
 * `paint/bars.ts`, as the bars layer does.
 */

import {
  exportColumnCatalogue,
  exportSegments,
  resolvePanelWidth,
  themeMetrics,
  type ChartExportSource,
  type ExportCustomBar,
} from '@gantryjs/core';
import type { Engine } from '../engine/engine';
import { createBar } from '../paint/bars';
import type { GanttBarRenderer } from '../types';
import type { ExportCapture } from '../engine/export-capture';
import { serializeSvg } from './serialize';

/** `engine`'s chart as it was at `snap` (the same source `createExportSource` builds for the same inputs). */
export function buildExportSource(
  engine: Engine,
  snap: ExportCapture,
  customBars: 'render' | 'builtin',
): ChartExportSource {
  const { config, allRows, rowStyle, catalogue, themeOverrides, mainW, canvasW, scrollLeft } = snap;
  const renderBar = customBars === 'render' ? snap.renderBar : undefined;
  return {
    config,
    i18n: snap.i18n,
    theme: snap.theme,
    dark: snap.dark,
    themeOverrides: Object.keys(themeOverrides).length ? themeOverrides : null,
    tasks: snap.tasks,
    rows: snap.rows,
    allRows,
    columns: {
      split: snap.split,
      table: snap.table,
      all: exportColumnCatalogue(catalogue.columns, catalogue.builtins),
    },
    columnCtx: snap.columnCtx,
    rowStyle,
    segments: exportSegments({ config, rollups: snap.rollups, allRows, rowStyle }),
    critical: snap.critical?.criticalIds ?? new Set(),
    annotations: snap.annotations,
    now: snap.now,
    view: snap.view,
    // The split panel's width in every view (the CSV's chart-view columns, a split export of a table view)
    panelWidth: resolvePanelWidth({ view: 'split', panel: config.panel, userWidth: snap.panelW, hostWidth: mainW }),
    tableWidth: mainW > 0 ? mainW : null,
    shared: snap.shared,
    showLegend: snap.showLegend,
    viewport: canvasW > 0 ? { x0: scrollLeft, x1: scrollLeft + canvasW } : null,
    customBar: renderBar ? customBarOf(renderBar, engine.ctx.shadow.ownerDocument.defaultView) : null,
  };
}

/**
 * Custom bars of an export (D5): what `renderBar` returns for the export's bar context, serialized;
 * `null` (core's built-in bar) when it returns nothing.
 */
function customBarOf(renderBar: GanttBarRenderer, win: Window | null): ExportCustomBar | null {
  if (!win) return null;
  return ctx => {
    const renderDefault = () =>
      createBar(ctx.visual, {
        fontPx: themeMetrics(ctx.theme).fontPx,
        selected: false,
        draggable: false,
        critical: ctx.isCritical,
      });
    const node = renderBar(ctx, renderDefault);
    // `''`: sanitising dropped the root (not SVG, a script…): the built-in bar
    return (node && serializeSvg(node, win)) || null;
  };
}
