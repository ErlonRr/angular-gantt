/**
 * @file export-capture.ts
 * What an export reads from the chart, taken when the export method is called (Phase 12, D27):
 * plain values peeked from the graph (untracked), so `const p = el.exportCsv(); el.tasks = next;`
 * exports the tasks as they were, as in Angular (whose export code is loaded with the chart). The
 * export code (`export/run.ts`, a lazy chunk) loads afterwards and builds core's
 * `ChartExportSource` from it (`export/source.ts`). In the engine, not in `export/` (which only the
 * lazy chunk imports): part of the entry chunk, so reads only.
 */

import { untracked } from '../reactive';
import type { Engine } from './engine';

/** The chart at the call of an export method (`captureExport`). */
export type ExportCapture = ReturnType<typeof captureExport>;

/** Reads what an export draws from `engine`'s graph, now. */
export function captureExport(engine: Engine) {
  const { inputs: I, graph: G, columns } = engine;
  return untracked(() => {
    const config = G.config();
    return {
      config,
      i18n: G.i18n(),
      theme: G.theme(),
      dark: G.isDark(),
      themeOverrides: { ...I.optionsIn().theme, ...I.apiTheme() },
      // The resource view exports its projected rows (`viewTasks`) and the load they were made from
      tasks: G.viewTasks(),
      utilization: G.utilization(),
      rows: G.visibleRows(),
      allRows: G.allRows(),
      rowStyle: G.rowStyle(),
      catalogue: columns.catalogue(),
      split: columns.columnsFor('split', config),
      table: columns.columnsFor('table', config),
      columnCtx: G.columnCtx(),
      rollups: G.rollups(),
      critical: G.critical(),
      annotations: I.annotationsIn(),
      now: I.nowTick(),
      view: I.viewOverride(),
      panelW: I.panelW(),
      mainW: I.mainW(),
      canvasW: I.canvasW(),
      scrollLeft: I.scrollLeft(),
      shared: I.shared(),
      showLegend: I.showLegend(),
      renderBar: I.renderBar(),
    };
  });
}
