# @gantry/vanilla

The Gantry Gantt chart as a framework-agnostic **Web Component**: `<gantry-element>`.
Use it from plain JavaScript or any framework. React, Vue and Svelte users can install
the thin bindings [`@gantry/react`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/react), [`@gantry/vue`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vue) and
[`@gantry/svelte`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/svelte) instead; Angular users, [`ngx-gantry`](https://github.com/ErlonRr/angular-gantt/tree/main/projects/gantry).

Free and MIT licensed. Interactive drag & resize, dependency arrows (FS/SS/FF/SF + lag),
critical path, baselines, milestones, groups, virtual scrolling, sorting, lazy loading,
light/dark theming, i18n, keyboard shortcuts and ARIA.

## Install

```bash
npm i @gantry/vanilla
```

## Usage

```html
<gantry-element id="gantt" style="height: 500px"></gantry-element>

<script type="module">
  import '@gantry/vanilla'; // registers <gantry-element>
  import { ViewMode, DependencyType } from '@gantry/vanilla';

  const gantt = document.getElementById('gantt');
  gantt.tasks = [
    { id: 'design', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
    { id: 'build',  name: 'Build',  start: new Date('2026-01-21'), end: new Date('2026-02-28'),
      dependency: { taskId: 'design', type: DependencyType.FS } },
  ];
  gantt.options = { viewMode: ViewMode.Week, criticalPath: true };

  gantt.addEventListener('task-dragged', e => console.log(e.detail.taskId, e.detail.newStart));
</script>
```

Give the element a height (it fills its container: `display: block; height: 100%`).

## Configuration

`options` accepts every `GanttOptions` field — header tiers & week formats, zoom presets,
period delimiters, weekends / holidays / working hours, bar & arrow sizes, panel splitter,
table view and saved state. See the full guide:
[Configuration](https://github.com/ErlonRr/angular-gantt#configuration).

## Properties

| Property | Type | Default | |
|---|---|---|---|
| `tasks` | `GanttTask[]` | `[]` | Tasks (tree via `parentId`). Replace the array to update. |
| `options` | `GanttOptions` | `{}` | `viewMode`, `rowHeight`, `baseline`, `criticalPath`, `showToday`, `panelWidth`, `locale`, `labels`, `formats`, `theme`, … |
| `columns` | `ColumnDef[]` | built-in | Left-panel columns. `render(row)` returns text; `cellTemplate(row)` returns a DOM `Node`. |
| `annotations` | `GanttAnnotation[]` | `[]` | Highlighted date ranges / markers |
| `darkMode` | `boolean \| 'auto'` | `false` | `'auto'` follows `prefers-color-scheme` |
| `showToolbar` | `boolean` | `true` | Zoom, view-mode pills and *Today* button |
| `enableDrag` / `enableResize` | `boolean` | `true` | Per task: `task.draggable = false` |
| `tooltipEnabled` | `boolean` | `true` | Hover tooltip |
| `showLegend` | `boolean` | `false` | Legend for the today marker and annotations |
| `dataSource` | `{ fetcher(page, pageSize), pageSize?, initialPage?, retries?, retryDelay? }` | `null` | Lazy paging; replaces `tasks` while set. A failed page shows Retry and pauses loading until `dataSource.retry()` |
| `renderBar` | `(ctx, renderDefault) => SVGElement \| null` | — | Replace or decorate a bar's SVG |

Boolean properties and the view mode are also available as attributes:
`dark-mode="auto"`, `view-mode="Week"`, `show-toolbar="false"`, `enable-drag="false"`,
`enable-resize="false"`, `tooltip-enabled="false"`, `show-legend`.

## Events

All are `CustomEvent`s (they bubble and cross the shadow boundary); the payload is in `event.detail`.

| Event | `detail` |
|---|---|
| `task-dragged` | `TaskDragEvent` — `{ taskId, oldStart, oldEnd, newStart, newEnd, daysMoved }` |
| `task-resized` | `TaskResizeEvent` — `{ taskId, handle, oldStart, oldEnd, newStart, newEnd, daysDelta }` |
| `selection-change` | `{ selectedIds: string[] }` |
| `row-click` / `row-dblclick` | `GanttFlatRow` |
| `view-mode-change` | `{ viewMode }` |
| `state-change` | `GanttState` — panel width / collapsed, view, zoom, column widths, collapsed rows, sort |
| `load-error` | `{ error, page }` — a data-source page failed after its automatic retries |

`addEventListener` is typed: `gantt.addEventListener('task-dragged', e => e.detail.daysMoved)`.

## Methods

`zoomIn()`, `zoomOut()`, `setViewMode(mode)`, `scrollToToday()`, `scrollToDate(date)`,
`scrollToTask(id)`, `getSelectedTasks()`, `setSelectedTasks(ids)`, `clearSelection()`,
`selectAll()`, `updateTask(id, patch)`, `appendTasks(tasks)`, `collapseAll()`,
`expandAll()`, `togglePanel()`, `setView('split' | 'table' | 'chart')`, `setColumnVisible(key, visible, view?)`, `toggleColumnVisible(key, view?)`,
`getState()`, `setState(state)`, `getBarVisual(id)`, `setTheme(theme)`, `patchTheme(patch)`.

## Keyboard

Focus the chart, then: `Escape` clears the selection (or cancels a drag), `Ctrl/⌘ + A`
selects all, `+` / `-` zoom, `T` scrolls to today. Sortable column headers respond to
`Enter` / `Space`.

## Theming

Pass any subset of `GanttTheme` via `options.theme` or `setTheme()` / `patchTheme()`
(colors, font, radii). The resolved theme is exposed as `--gantt-*` CSS custom properties
on the element, and its parts are styleable with `::part(toolbar | panel | splitter | timeline)`.

## i18n

Set `options.locale` (and import the matching `dayjs/locale/*`), `options.labels` for any
UI string, and `options.formats` for header/date formats.

## License

MIT
