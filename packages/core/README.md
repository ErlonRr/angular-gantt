# @gantry/core

Framework-free core of the [Gantry](https://github.com/ErlonRr/angular-gantt/tree/main#readme) Gantt chart: domain types,
timeline math, tree helpers and critical-path computation. No DOM, no framework —
runs in browsers, Node, workers and SSR. No runtime dependencies.

You usually don't install this directly: it powers [`ngx-gantry`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/angular)
(Angular) and [`@gantry/vanilla`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla) (Web Component, used by the React, Vue and
Svelte bindings), and every binding re-exports it. Use it on its own to compute
schedules server-side or to build your own renderer.

## Install

```bash
npm i @gantry/core
```

## What's inside

| Area          | Exports                                                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types         | `GanttTask`, `GanttDependency`, `GanttOptions`, `GanttTheme`, `ColumnDef`, `GanttAnnotation`, `TaskDragEvent`, `TaskResizeEvent`, … and `ViewMode`, `TaskType`, `DependencyType` (`as const` objects with same-name types: `ViewMode.Week` works as a value and as a type) |
| Timeline math | `dateToPixel`, `pixelToDate`, `getTimelineRange`, `generateHeaderRows`, `generateGridLines`, `zoomIn`, `zoomOut`, `PX_PER_DAY`, `formatDate`, `durationLabel`                                                                                                              |
| Tree data     | `flattenTree`, `filterVisible`, `reindexVisible`, `sortRoots`, `columnComparator`, `findRowById`, `collectDescendants`, `buildDefaultColumns`                                                                                                                              |
| Scheduling    | `computeCriticalPath` (CPM with FS/SS/FF/SF dependencies and lag), `longestChain`                                                                                                                                                                                          |
| i18n          | `DEFAULT_LABELS`, `DEFAULT_FORMATS`                                                                                                                                                                                                                                        |

```ts
import { computeCriticalPath, DependencyType } from '@gantry/core';

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

Sample data for demos and docs lives in a separate entry point, `@gantry/core/demo`:

```ts
import { createDemoData, anchorToToday, DEMO_TASKS } from '@gantry/core/demo';

const { tasks, annotations } = createDemoData(); // today ≈ 40% into the plan
const later = createDemoData({ now: new Date(2027, 0, 4), at: 0.8 });
const mine = anchorToToday(myTemplate, { at: 0.5 }).tasks; // any template, whole-week shift
```

`DEMO_TASKS` / `DEMO_ANNOTATIONS` are the fixed 2026 reference plan.

## License

MIT
