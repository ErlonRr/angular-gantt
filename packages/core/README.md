# @gantryjs/core

Framework-free core of the [Gantry](https://github.com/ErlonRr/gantryjs/tree/main#readme) Gantt chart: domain types,
timeline math, tree helpers and critical-path computation. No DOM, no framework —
runs in browsers, Node, workers and SSR. No runtime dependencies.

You usually don't install this directly: it powers [`@gantryjs/angular`](https://github.com/ErlonRr/gantryjs/tree/main/packages/angular)
(Angular) and [`@gantryjs/vanilla`](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla) (Web Component, used by the React, Vue and
Svelte bindings), and every binding re-exports it. Use it on its own to compute
schedules server-side or to build your own renderer.

## Install

```bash
npm i @gantryjs/core
```

## What's inside

| Area             | Exports                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types            | `GanttTask`, `GanttDependency`, `GanttOptions`, `GanttTheme`, `ColumnDef`, `GanttAnnotation`, `TaskDragEvent`, `TaskResizeEvent`, `RetryEvent`, … and `ViewMode`, `TaskType`, `DependencyType` (`as const` objects with same-name types: `ViewMode.Week` works as a value and as a type)                                                             |
| Timeline math    | `dateToPixel`, `pixelToDate`, `calendarDays`, `addDays`, `formatDate`, `durationLabel`                                                                                                                                                                                                                                                               |
| Render model     | `resolveConfig` (every option default), `buildTimeline`, `computeRowGeometries`, `computeBarVisual` / `hitTestBar`, `computeArrowVisual`, `computeMarkerLane`, `DragSession`, `formatDragReadout`, `wheelZoom` / `fitZoomLevel` / `anchoredScrollLeft`, `LightTheme` / `DarkTheme`, `themeToCss`                                                     |
| Interaction      | `resolveKey` (the key map), `navigateGrid` / `navigateTimeline`, `tabStopIndex`, `KeyboardEditSession`, the pointer gesture machine (`startGesture`, `DRAG_THRESHOLD_PX`, `LONG_PRESS_MS`), `autoScrollDelta`, `createAnnouncer`, `taskAccessibleName`                                                                                               |
| State models     | `buildToolbar`, `resolveChartState` / `skeletonRows`, `buildLegend` / `legendPlacement`, `buildTooltipModel` / `reduceTooltip` / `placeTooltip`, selection and saved state                                                                                                                                                                           |
| Tree data        | `flattenTree`, `filterVisible`, `reindexVisible`, `sortRoots`, `columnComparator`, `findRowById`, `collectDescendants`, `buildDefaultColumns`                                                                                                                                                                                                        |
| Editing          | `GanttChange` and the pipeline (`taskChange` / `dragChange` / `progressChange` / `linkChange`, `applyChange`, `invertChange`, `prepareChange`), `GanttHistory`, `validateChange` / `editRules` / `cellEditable`, `resolveCellEditor` / `commitCellValue`, `parsePredecessors` / `parseDuration`, `ProgressSession` / `LinkSession`, `resolveEditing` |
| Export           | `createExportSource` (a chart snapshot without a binding), `exportChartSvg`, `exportChartCsv`, `exportChartPages` (print pages), `buildExportModel` / `renderExportSvg`, `paginateChart`, `planRaster`, `exportFileName` / `exportFileText`, `resolveExportCall`, `sanitizeSvgMarkup` (the custom-bar markup rules)                                  |
| Scheduling       | `computeCriticalPath(tasks, resolveConfig(options))` (CPM with FS/SS/FF/SF dependencies and lag, in working time with a `calendar`), `longestChain`                                                                                                                                                                                                  |
| Working calendar | `createWorkingCalendar` (`WorkingCalendar`: `addWorking`, `snapStart` / `snapEnd`, `workingDuration`…), `formatDuration` / `formatFloat`, `taskDuration` / `spanDuration` / `measureBetween` / `addDuration`, `snapTaskStart` / `snapTaskEnd` / `followTaskEnd`, `editCalendar`, `dateReadingOf` / `sameDateReading`, `DEFAULT_WORKING_HOURS`        |
| i18n             | `DEFAULT_LABELS`, `DEFAULT_FORMATS`                                                                                                                                                                                                                                                                                                                  |

Every Gantry binding paints these models, which is why an option behaves the same everywhere;
the options themselves are documented in the main README's
[Configuration](https://github.com/ErlonRr/gantryjs#configuration).

```ts
import { computeCriticalPath, DependencyType } from '@gantryjs/core';

const { criticalIds } = computeCriticalPath([
  { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20') },
  {
    id: 'b',
    name: 'Build',
    start: new Date('2026-01-21'),
    end: new Date('2026-02-28'),
    dependency: { taskId: 'a', type: DependencyType.FS },
  },
]);
```

Exports run here too, with no DOM: the same chart gives the same SVG and CSV as the bindings' `exportSvg()` /
`exportCsv()`, so you can render a plan on a server or in a worker
([Export and print](https://github.com/ErlonRr/gantryjs#export-and-print)):

```ts
import { createExportSource, exportChartCsv, exportChartPages, exportChartSvg, exportFileText } from '@gantryjs/core';

const source = createExportSource({ tasks, options: { viewMode: 'Week' }, now: new Date(2026, 0, 15) });
const svg = exportFileText('svg', exportChartSvg(source, { theme: 'light' })); // an .svg file's text
const csv = exportChartCsv(source, { columns: 'all', delimiter: ';' }); // RFC 4180, formulas neutralised
const { pages } = exportChartPages(source, { paper: 'a4' }); // one SVG per printed page
```

`@gantryjs/core` is published one file per module, so a bundler leaves out what an app never imports (the export
code, for instance, until a chart exports).

Sample data for demos and docs lives in a separate entry point, `@gantryjs/core/demo`:

```ts
import { createDemoData, anchorToToday, DEMO_TASKS } from '@gantryjs/core/demo';

const { tasks, annotations } = createDemoData(); // today ≈ 40% into the plan
const later = createDemoData({ now: new Date(2027, 0, 4), at: 0.8 });
const mine = anchorToToday(myTemplate, { at: 0.5 }).tasks; // any template, whole-week shift
```

`DEMO_TASKS` / `DEMO_ANNOTATIONS` are the fixed 2026 reference plan.

## License

MIT
