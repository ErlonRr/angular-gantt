---
'@gantryjs/angular': major
---

**`@gantryjs/angular`: the Angular chart at parity with `<gantry-element>`.** `<gantry>` now renders the same DOM, CSS
classes, windows and accessibility tree as the Web Component, and is rebuilt on Angular's signal APIs: its state is
`linkedSignal` / `model()` / `computed` (no syncing effects), browser work starts in `afterNextRender` and stops
through `DestroyRef` (SSR-safe), custom bars resolve per chart through the injector hierarchy, and the public API is
curated.

### Setup and providers (breaking)

- `GanttModule`, `GanttModule.forRoot()`, `provideGanttLib()` and `BUILT_IN_BAR_DEFS` are removed. A `<gantry>` needs
  no provider (`imports: [GantryComponent]`): the built-in bars, the English labels and the light theme are there.
- `provideGantt(config?, ...features)` (moved out of the theme service) returns `Provider[]` instead of
  `EnvironmentProviders` and works in application (`bootstrapApplication`), route and component `providers`. Each
  level merges its config over the level above: `theme`, `labels` (with `labels.viewModes`) and `formats` (with
  `formats.header`) per key, `darkMode` and `locale` replaced. The nearest level wins; of two `provideGantt` at the
  same level, the last one wins. A chart's `options` still win over all of them.
- New `withBars(...defs)`: custom bars as a `provideGantt` feature (type `GanttFeature`).
- `provideGanttBar(...defs)` takes any number of definitions, returns `Provider[]` and works at every level.
- `GANTT_GLOBAL_CONFIG` and `GANTT_BAR_DEF` are no longer exported; `GANTT_BAR_DEF` has no default value.

### Custom bars (breaking)

- `GanttBarBase` is an abstract `@Directive()` that declares `ctx = input.required<GanttBarContext>()`. Remove your
  own `ctx` input and the `context` getter. The chart keeps the same `ctx` object while the row's data is unchanged,
  so only the bars whose data changed re-render. `GanttBarInputs` is deleted.
- The bar registry is per chart: `GanttBarRegistry` is internal and provided by each `<gantry>` (injecting it outside
  a chart throws), and its runtime `register()` is gone: provide the bar with `provideGanttBar` in the component or
  route that shows it. A type resolves to the nearest level that defines it (a level can replace a built-in type);
  an unknown `barType` draws the `task` bar. A bar provided for one page no longer shows up in the others.
- Bars are direct children of `g.gantt-bars-layer`: no wrapper `<g>` per row and no `g[ganttBarHost]` level. The chart
  creates each bar's `<g>` host in the SVG namespace, stamps `data-task-id` on it (custom bars too), gives it the
  canvas' style scope attribute and dims the dragged bar with a CSS `opacity`. Built-in bars carry `role="listitem"`
  and an accessible name; a custom bar sets its own.

### Public API (breaking)

- `@gantryjs/angular` exports `GantryComponent`, `GanttColumnDefDirective`, `provideGantt`, `withBars`, `GanttGlobalConfig`,
  `GanttFeature`, `provideGanttBar`, `GanttBarDef`, `GanttBarBase`, the built-in bars `GanttTaskBarComponent`,
  `GanttMilestoneComponent` and `GanttGroupBarComponent`, `GanttDataSource`, `createGanttDataSource`,
  `GanttDataSourceConfig`, `ColumnDef`, and everything in `@gantryjs/core`.
- No longer exported (internal): `GanttArrowComponent`, `GanttHeaderComponent`, `GanttTaskListComponent`,
  `GanttCanvasComponent`, `GanttColumnService`, `GanttThemeService`, `GanttI18nService`, `GanttLayoutService`,
  `GanttSortState`, `GanttScrollService`, `GanttDragService`, `GanttDragPreviewComponent`, `DragState`,
  `GanttSelectionService`, `GanttKeyboardDirective`, `GanttLoadMoreComponent`, `GanttToolbarComponent`,
  `GanttBarRegistry`, `GANTT_BAR_DEF`, `GANTT_GLOBAL_CONFIG`. Drive the chart through `<gantry>`'s inputs, outputs and
  methods.
- Deleted: `GanttVirtualScrollDirective`, `GanttAnnotationComponent`, `GanttTooltipDirective`, `GanttTooltipContext`,
  `GanttBarInputs`, and the `gantt-math` / `gantt-data` / `gantt-cpm` re-export modules. Their names still come from
  `@gantryjs/core` through `ngx-gantry`, now as real values: 1.x's type declarations exported 24 of them as type-only
  aliases, so `import { addDays } from '@gantryjs/angular'` failed as a value. Fixed: `addDays`, `clamp`,
  `collectDescendants`, `computeCriticalPath`, `dateToPixel`, `diffDays`, `durationLabel`, `filterVisible`,
  `findRowById`, `flattenTree`, `formatDate`, `longestChain`, `pixelToDate`, `reindexVisible`, `snapToDay`,
  `sortRoots`, `SORT_BY_NAME`, `SORT_BY_PROGRESS`, `SORT_BY_START`, `DEFAULT_COLUMNS`, and the types `SortComparator`,
  `TimelineRange`, `CPMResult`, `ColumnCellContext`.
- Deprecated members removed with them: the `theme` inputs of the task list, load-more footer, toolbar and drag
  preview; the task list's `panelWidthChange`; the drag preview's `barHeight`, `radius` and `unit`; the canvas'
  `selectionChange`; the keyboard directive's `visibleRows`; `GanttScrollService.scrollToDate()` / `scrollToToday()` /
  `scrollToOrigin()` / `visibleRowRange` (use `<gantry>`'s `scrollToDate()`, `scrollToToday()`, `scrollToTask()`);
  `GanttSelectionService.selectedCount` / `hasSelection` / `isSelectedSignal` / `select()` / `toggle()` /
  `getSelectedIds()` / `getSelectedRows()` (use `getSelectedTasks()`, `setSelectedTasks()`, `selectionChange`);
  `GanttLayoutService.layoutParams` / `setTasks()` (its `viewMode` is now `level`); `GanttColumnService.visibleColumns`
  / `gridTemplate` / `totalPanelWidth` / `registerColumn()` / `unregisterColumn()`; `GanttThemeService.init()` /
  `setDarkMode()` / `setOptionsTheme()` / `applyThemeToDom()`; `GanttI18nService.apply()`.
- `GanttColumnDefDirective`: `<gantry>` reads its columns through a content query (a column inside `@if` or
  `<ng-container>` comes and goes with it; a `ganttColumn` outside `<gantry>`'s content is ignored). `getTemplate()`
  is removed and `cellTemplate` is a signal (`contentChild`).
- `GanttDataSourceConfig.injector` is removed (the data source never needs an injection context).
- The task list's own `[tlHeader]` and `[tlFooter]` slots are gone with the public `<gantt-tasklist>` (only a
  standalone task list could fill them). `<gantry>`'s slots are unchanged: `[ganttToolbar]`, `[tlFooter]` (below the
  task list) and `[ganttFooter]`.
- `GantryComponent` and the inner components have no `ngOnInit` / `ngAfterViewInit` / `ngOnDestroy` methods.

### Inputs, outputs and methods

- `viewMode` is a `model()`: `[(viewMode)]="zoom"`. `viewModeChange` still fires for the toolbar, the keyboard,
  `zoomIn()` / `zoomOut()` / `setViewMode()`, a restored state and an `options.viewMode` change, but not when the
  parent sets `[viewMode]` and not on the first render; it is typed `ViewMode | (string & {}) | undefined`. A zoom
  level restored from `options.stateKey` when the chart starts is a change too: it updates `[(viewMode)]` and fires
  `viewModeChange` once (as `<gantry-element>`'s `view-mode-change`). Between `[viewMode]` and `options.viewMode` the
  one that changed last wins (a new `options.viewMode` still overrides a user zoom).
- `darkMode` defaults to `undefined`, so `provideGantt({ darkMode })` now applies (1.x's `false` default overrode it):
  `options.darkMode`, else `[darkMode]`, else `provideGantt({ darkMode })`, else light.
- Boolean inputs (`showToolbar`, `enableDrag`, `enableResize`, `tooltipEnabled`, `showLegend`) accept attribute
  values: `<gantry showLegend>`, `showToolbar="false"`.
- `<gantry [visibleRows]>` is removed: the keyboard reads the rows from the chart.
- New, as on `<gantry-element>`: `view` (the current view, a read-only signal), `resetTheme()` (drops the
  `setTheme()` / `patchTheme()` overrides) and `getBarVisual(id)` (a bar's core geometry and paints, also for rows
  outside the rendered window).
- A new `series` (or new data-source items) resets local drags as in 1.x. `task.collapsed` seeds only the ids the
  chart has never seen (`seedCollapsed` from `@gantryjs/core`, the Web Component's rule): an id seen before keeps the
  user's expand / collapse state, also across an empty series in between or a data-source reset, and an id removed
  and added again is not collapsed again.
- A state change still waiting for its 150 ms debounce (`STATE_SAVE_DELAY`) is written under `options.stateKey` when
  the chart is destroyed, as `<gantry-element>` does when it disconnects (1.x dropped it). `stateChange` does not fire
  then: the chart's outputs are gone.
- Column resizing captures the pointer (no `window` listeners) and reports a width only when it changed.

### Host element and theming (breaking)

- The theme tokens are an inline `[style]` binding on the host (every `--gantt-*` token plus the derived contrast
  tokens), rendered on the server too, with no effect and no flash. A consumer `style` attribute is kept. To set a
  token from a template, use a `[style]` map (`[style]="{ '--gantt-bar': color }"`) or the `--global--` prefix
  (`[style.--global--gantt-bar]="color"`): Angular 22 namespaces a plain `[style.--gantt-bar]` binding, which then
  loses to the host map. Page CSS on `gantry` still needs `!important`. Not tested with Angular's
  `provideCssVarNamespacing()`.
- No `data-theme` attribute: the host has the classes `gantry-dark` (dark theme on), `gantry-dragging` (a bar is
  dragged or resized) and `gantry-loading` (a data-source page is loading). Replace `gantry[data-theme='dark']` with
  `gantry.gantry-dark`.
- The host's chrome (font, colours, layout) and the constant inline styles of inner elements moved into the
  component stylesheets.
- The light theme's current-period header label uses `--gantt-today-label` (`#964B13`, 5.01:1; it was `#B45309` at
  3.97:1, below WCAG AA), and theme-coloured progress uses `--gantt-progress-overlay` (theme key `progressOverlay`);
  both tokens come from `@gantryjs/core`.

### Accessibility and focus (breaking)

- The host is a `region` landmark named by `labels.ariaChart` (`role` and `aria-label` attributes) and no longer a tab
  stop: no `tabindex`, no host focus ring. The tab stops are the Web Component's: the toolbar buttons, the sortable
  column headers, one task-list row (roving `tabindex`: the focused row, else the row focused last while mounted,
  else the first row in view) with the collapse toggles, the splitter handle, its collapse toggle, and the timeline
  viewport (`.gantry-canvas-viewport`, `role="group"`, `tabindex="0"`, named by `labels.ariaChart`; arrow keys scroll
  it). Focus rings use `--gantt-sel-border`. A page that focused `<gantry>` itself should focus one of these.
- The splitter's `role="separator"`, `tabindex="0"` and `aria-orientation` moved to its child
  `.gantry-splitter-handle`, which covers the splitter and gains `aria-valuenow` (the panel width in px),
  `aria-valuemin` (0 when the panel is collapsible, else `panel.minWidth`) and `aria-valuemax` (the widest panel the
  splitter allows), the Web Component's values from `splitterValue()` in `@gantryjs/core`; the collapse
  toggle is its sibling instead of a child of the separator.
- A focused task-list row stays mounted while it is scrolled out of view (`.gantt-tl-row--pinned`), so focus survives
  scrolling. When the focused control disappears, focus moves to the timeline viewport (in the table view, to the task
  list's tab-stop row); pressing a draggable bar focuses the viewport, so `Escape` cancels the drag.
- The task list's `aria-multiselectable` follows `enableSelection` and `multiSelect`.
- Live regions: a polite `.gantt-sr-live` (`role="status"`) announces selection-count changes and the data source's
  load state (`labels.loading`, `labels.announceLoaded(n)`, `labels.allLoaded(n)`); a failed page is announced once in
  `.gantt-sr-alert` (`role="alert"`, `labels.loadError`) — the load-more footer no longer has a `role="alert"` of its
  own.

### Tooltip (breaking)

- One tooltip per chart, inside `<gantry>` (it inherits the `--gantt-*` tokens) and created on the first hover,
  instead of one popover per bar in `<body>`. Its markup is the Web Component's:
  `div.gantt-tooltip[popover=manual][role=tooltip]` (`gantt-tooltip--critical` for critical tasks) >
  `div.gantt-tooltip-title` + `dl.gantt-tooltip-rows` > `div.gantt-tooltip-row` (`gantt-tooltip-row--progress`) >
  `dt.gantt-tooltip-label` + `dd.gantt-tooltip-value` (+ `dd.gantt-tooltip-track > div.gantt-tooltip-fill`). The
  `gantt-tooltip-popover` class and the inline styles are gone: restyle it with `gantry .gantt-tooltip …`.
- It opens after 320 ms and closes after 120 ms (`TOOLTIP_SHOW_DELAY` / `TOOLTIP_HIDE_DELAY`), and hides when a drag
  starts or `tooltipEnabled` turns off.

### DOM and CSS classes (breaking)

- The panes use the Web Component's classes; the old names are dropped: `.gantt-panel-scroll` → `.gantry-panel`,
  `.gantt-timeline-scroll` → `.gantry-canvas-viewport`, `.gantt-timeline-header` → `.gantry-canvas-header-sticky`.
- Header cells, header bands, non-working bands and vertical grid lines are mounted only around the viewport (the
  viewport ± half its width, in 256 px chunks), as in `<gantry-element>` in the same release: DOM queries see only
  the mounted ones; `.g-header` keeps the full width.
- The task list uses the Web Component's markup (classed spans, 24 × 24 px collapse targets, the column resize handle
  inside its header cell; see the task-list changeset). The drag ghost label has the class
  `gantt-drag-preview-label`, the load-more sentinel `gantt-load-sentinel`.

### Rendering and performance

- State lives in signals with the Web Component's equality cut-offs: scrolling inside the overscan or a 256 px chunk,
  re-assigning equal `options` or changing only theme colours re-renders nothing else. No `NgZone`.
- The timeline model is rebuilt once per local day (per hour on hour scales) instead of every minute; the today line
  still follows the one-minute clock.
- Only the arrows crossing the rendered rows are drawn (`buildArrowIndex`), each one memoised and keyed by its link,
  so repeated dependencies no longer trigger `NG0955`.

### Server-side rendering

- SSR-safe: no `window`, `document` or `localStorage` globals (`DOCUMENT`, `Renderer2`). The `ResizeObserver`, the
  load-more `IntersectionObserver`, the clock, the scroll listeners, `matchMedia` and animation frames start after the
  first browser render (`afterNextRender`) and stop through `DestroyRef`. The server HTML has the rows, bars, header
  and theme tokens; with `darkMode: 'auto'` it is light until the browser reports the colour scheme.

### Migration

```ts
// 1.x                                              // 2.0
bootstrapApplication(App, { providers: [            bootstrapApplication(App, { providers: [
  provideGanttLib({ locale: 'it' }),                  provideGantt({ locale: 'it' }),        // optional
  provideGanttBar({ type: 'epic', component: E }),    provideGanttBar({ type: 'epic', component: E }),
]});                                                ]});
@NgModule({ imports: [GanttModule.forRoot()] })     // standalone: imports: [GantryComponent]

// per page / per chart (new)
@Component({ providers: [provideGanttBar({ type: 'epic', component: EpicBar })], … })
// route
{ path: 'plan', providers: [provideGantt({ labels: { legend: 'Legend' } }, withBars(epic))], … }

// custom bar
export class EpicBar extends GanttBarBase {         export class EpicBar extends GanttBarBase {
  ctx = input.required<GanttBarContext>();            geo = computed(() => this.ctx().geometry);
  override get context() { return this.ctx(); }     }
}
inject(GanttBarRegistry).register({…})              // → provideGanttBar({…}) in providers

<gantry [options]="{ viewMode }"                    <gantry [(viewMode)]="zoom" …>
        (viewModeChange)="zoom = $event">
<gantry [style.--gantt-bar]="c">                    <gantry [style]="{ '--gantt-bar': c }">
gantry[data-theme='dark'] …                         gantry.gantry-dark …
body > .gantt-tooltip, .gantt-tooltip-popover       gantry .gantt-tooltip (+ dl / dt / dd classes)
.gantt-panel-scroll / .gantt-timeline-scroll        .gantry-panel / .gantry-canvas-viewport
.gantt-timeline-header                              .gantry-canvas-header-sticky
import { GanttLayoutService, … } from 'ngx-gantry'        not public: use GantryComponent's inputs / methods
```
