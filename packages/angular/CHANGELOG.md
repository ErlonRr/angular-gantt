# @gantryjs/angular

## 2.0.0

### Major Changes

- 639ad08: Accessible default palette (WCAG 2.2 AA): bar labels reach 4.5:1 and bars, markers and arrows 3:1. Labels inside bars switch to a readable colour on custom `barColor`s (`contrastRatio()`, `readableOn()`). The previous colours are exported as `LegacyLightTheme` / `LegacyDarkTheme`.
- 6b74328: Requires Angular 22 (`@angular/core` and `@angular/common` `^22.0.0`) and TypeScript 6.0; Node `^22.12` or `>=24`. `dayjs` is no longer a dependency.
- df3f3be: The Angular package is published as **`@gantryjs/angular`** (formerly `ngx-gantry`), next to the other
  `@gantryjs/*` packages and versioned with them: `npm i @gantryjs/angular`, `import { GantryComponent } from '@gantryjs/angular'`.
- 1cedb3f: **No more `dayjs`: zero runtime dependencies.** Dates are formatted by a built-in, `Intl`-based formatter
  with dayjs-compatible tokens (`YYYY YY M MM MMM MMMM Q D DD Do d dd ddd dddd H HH h hh m mm s ss A a W WW [text]`).
  `locale` is any BCP 47 tag (`'it'`, `'de-CH'`, `'pt-BR'`) and needs no `import 'dayjs/locale/…'`; unknown or malformed tags
  fall back to `'en'`, which is also the default — the dayjs global locale (`dayjs.locale('it')`) is no longer read, so set
  `locale` explicitly. Names come from CLDR, so a few abbreviations change (German `Mär`, Spanish `sept` / `a. m.`,
  lowercase Catalan months, Russian `июн.`), and a short month after a day number uses the format-context form (`5 мар.`).
  New exports: `dateNames(locale, kind)`, `resolveFormatLocale`, `isoWeek`, `isoWeekYear`, `quarterOf`, `dayOfYear`, `ISO_FORMAT`.
  
  **Shared logic in `@gantryjs/core`**, used by both renderers instead of their own copies:
  virtual rows (`computeVirtualWindow` with pinned rows, `isIndexMounted`, `virtualIndexes`), horizontal windowing
  (`computeHorizontalWindow`, `tiersInRange`, `bandsInRange`, `linesInRange`, `sameHorizontalWindow`), selection
  (`selectionClick`, `selectAllRows`, `selectionOf`, `emptySelection`, `shouldEmitSelection`), view and panel width
  (`viewFromOptions`, `viewFromState`, `resolvePanelWidth`, `clampPanelWidth`), versioned state persistence
  (`GANTT_STATE_VERSION`, `parseState`, `serializeState`, `normalizeState`, `readStoredState`, `writeStoredState`),
  tooltip and legend models (`buildTooltipModel`, `buildLegend`), keyboard (`resolveKey`, `navigateGrid`,
  `KeyboardEditSession`), screen-reader text (`taskAccessibleName`, `announce*`).
  
  Breaking: stored state is written as version 2 (`{"v":2,…}`; v1 snapshots are migrated, invalid fields are dropped,
  snapshots from a newer version are ignored); `GanttLabels` has new required members for accessible names
  (`ariaProgress`, `ariaCritical`, `ariaBaseline`, `ariaDateRange`, `ariaDateFormatShort`, `ariaDateFormatLong`,
  `ariaTimeFormat`, `ariaListSeparator`), announcements (`announce*`), tooltip rows (`ttCritical`, `ttCriticalValue`,
  `ttFloat`, `ttFloatDays`, `ttSuccessors`) and the legend (`legendCritical`, `legendBaseline`) — `options.labels` stays
  partial; `GanttBarContext` fields are required; `DragPreview` is `{ delta, unit }` (`daysDelta` is deprecated);
  `criticalIds` is a `ReadonlySet`; the legacy helpers `PX_PER_DAY`, `HEADER_HEIGHTS`, `getTimelineRange`,
  `generateHeaderRows`, `generateGridLines`, `zoomIn`, `zoomOut` are removed (use `buildTimeline` and the zoom levels).
  
  Fixed: the Hour view drew overlapping, out-of-order header cells in time zones west or east of UTC (an hour boundary
  on UTC midnight was read as a date-only value); holidays are looked up in O(1) while painting.
  
  Renderers (`<gantry-element>` and `<gantry>` behave the same):
  
  - Bars' accessible names come from `taskAccessibleName`: name, type, dates (with the time of day when a task
    doesn't start or end at midnight; formats `labels.ariaDateFormatShort` / `ariaDateFormatLong` / `ariaTimeFormat`),
    progress (rounded, clamped), "critical" and "planned baseline shown" (not for milestones).
  - The tooltip shows critical path, float, baseline start / end / variance, predecessors and successors when that data
    exists; milestones show one date row (Angular's "◆ Milestone" badge is gone); progress is clamped to 0–100 and its
    fill follows the critical colour. Angular's tooltip now has `role="tooltip"` and the shared `gantt-tooltip` class.
  - The legend honours `showToday` and lists the critical path (bar) and baseline (strip) when those options are on; the
    swatch geometry comes from `@gantryjs/core` (`legendSwatch`, `LEGEND_SWATCH_SIZE`).
  - Keyboard: `Ctrl/⌘+Shift+A` also selects all; shortcuts no longer fire with `Alt` / `AltGr`; unhandled keys
    (`F`, `Ctrl+Z`, `Ctrl+Y`) keep their browser default.
  - `selection-change` / `selectionChange` is no longer emitted when clearing an already empty selection.
  - `setState()` drops invalid fields (e.g. `panelWidth: 0`); an explicit `panel.collapsed: false` beats `panelVisible: false`.
  - `@gantryjs/vanilla`: the element's selection and tooltip internals that implement this are private in 2.0 (see the
    `wc-engine` changeset); the `virtual-scroll` entry no longer has its own `computeVirtualWindow` (use the core one).
  - `@gantryjs/angular`: the selection service, task list, tooltip and canvas these changes touched are internal in
    `@gantryjs/angular` (see its changeset); use `<gantry>`'s `selectionChange`, `getSelectedTasks()` and
    `setSelectedTasks()`.
- 7bf8c1b: **`@gantryjs/angular`: the Angular chart at parity with `<gantry-element>`.** `<gantry>` now renders the same DOM, CSS
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
    inside its header cell; see the task-list changeset). The load-more sentinel has the class `gantt-load-sentinel`;
    the drag ghost has no label any more (the drag readout chip shows the move).
  
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
- 6522a87: Breaking changes in low-level APIs: `selectionChange` on `<gantry>` reports every selection (canvas, task list, keyboard, API; the inner components that emitted their own are internal in `@gantryjs/angular`); `GanttDataSource.page()` is the last page loaded (0 before the first load) and `createGanttDataSource()` no longer needs an injection context; `GanttLabels` has new required members — `loadError`, `retry`, `colId`, `colType`, `colStatus`, `colPredecessors`, `colBaselineStart`, `colBaselineEnd`, `colVariance`, `statusNotStarted`, `statusInProgress`, `statusOverdue`, `statusDone`, `typeTask`, `typeMilestone`, `typeGroup`, `ariaTaskList`, `dependency(name, type, lagDays)` and `varianceDays(days)` (only objects typed as a full `GanttLabels` need them — `options.labels` stays partial). The default split panel shows `name`, `start`, `end`, `progress` (Duration moved to the table view; restore it with `panel: { columns: ['name', 'start', 'end', 'duration', 'progress'] }`). `ColumnCellContext` gains `ctx`; `<ng-template ganttColumn>` inputs left unset inherit from a built-in column with the same key.
- 8891728: **Task styles, rolled-up segments and row hover in `<gantry>`.** Built-in bars take their extra classes from the resolved style (`options.styles`, `task.style.className`, the deprecated `task.className`) through `ctx.visual.className`; a collapsed parent with `rollup.segments` draws its children as `rect.gantt-bar-segment` inside its bar; row backgrounds and the task-list icon use the style's `rowColor` / `color` in both panes. The row under a mouse or pen pointer is tinted in both panes (`rect.gantt-row-hover` and `.gantt-tl-row--hover`, theme key `rowHoverBg`; `transparent` turns it off), replacing the task list's `:hover` brightness filter; it clears on leave, scroll and drag start and is hidden in forced colours.
  
  **Phase 10 surface of `<gantry>`.** New `[syncGroup]` input (a `createGanttSyncGroup()` group, default `null`) joins the charts that share it. The host gets `data-density` and, below `responsive.breakpoint`, `data-narrow`; its style map now carries the read-only `--gantt-row-height` and `--gantt-bar-height` and the toolbar's `--gantry-control-size` next to the theme tokens. With `rollup`, a parent row carries a copy of its task with the rolled-up progress, dates and status (columns, sorting, bars, custom bars and accessible names read it); `rowClick`, `rowDblClick` and `getSelectedTasks()` keep the raw task. `groupBar.collapsed` collapses every new parent. Bars and custom bars get the row's resolved style (`options.styles`, `task.style`): custom bars read it in `ctx.style` and their host gets its classes. `fitToScreen()` fits the shared extent inside a group, and `getState().view` keeps the wide view while the chart is narrow. Zoom anchoring now reads the viewport's own `scrollLeft`, so a zoom right after a programmatic scroll keeps the right date in place.
  
  **Synchronised charts.** Charts that share one `[syncGroup]` (core `createGanttSyncGroup()`) share their timeline range (same start, so a date sits at the same x in every chart), zoom level, horizontal scroll and panel width, like `<gantry-element>`. A chart that joins a group that already has a scroll position opens there instead of at `initialScroll`. A scroll the group applied is never sent back: a chart that cannot scroll as far stops at its own end without pulling the others back. A zoom level the chart doesn't have is ignored. A level the group applies still updates `[(viewMode)]` and the saved state, but only the chart where the user zoomed announces it. Applying the group's panel width doesn't save the chart's state (a later save, after a zoom or a collapse, keeps the width shown), and the splitter sends its width when a drag ends instead of on every move. A chart leaves its group when it is destroyed or when `[syncGroup]` changes to another group, `null` or `undefined`.
  
  **Narrow charts, the More menu and the panel toggle.** Below `responsive.breakpoint` (640 px by default) the chart switches to `responsive.view` (`'chart'`) once it is measured, restores the wide view when it widens again, and lets a view the user picks while narrow win until then; the forced view is never saved (`getState().view` keeps the wide view, no `stateChange`). With `toolbar.overflow: 'menu'` (the default) the toolbar moves the zoom levels, then the views, then Today into a More menu button (WAI-ARIA menu: ↓/↑, Home/End, Enter/Space, Esc, Tab, outside press) when the chart's width, less the `[ganttToolbar]` content and a legend in the toolbar, is too small; `'wrap'` keeps wrapping. `toolbar.panelToggle` adds a pressed task-list button first, and the toolbar controls follow `density` (28 / 32 / 36 px). A toolbar that fits renders as before.
  
  **Tooltip and drag readout fixes.** An open tooltip now follows its row: its content is built again only when the task object, its critical-path flag or the labels (locale and formats included) change, then it is measured and placed again by its bar. A clock tick, other tasks or a new `options.tooltip.render` function alone no longer rebuild it, so `render` and the `<ng-template ganttTooltip>` context run again only on those changes. A keyboard focus that reaches a bar before its bar is rendered (before the chart's first render) opens its tooltip once the bar is there. The tooltip's progress fill takes the colour of the row's resolved style (`options.styles`, `task.style`, the deprecated flat colours), which is the colour of the bar, and the critical colour on the critical path. The drag readout chip writes its dates in `formats.readoutFormat` when it is set. The drag ghost no longer renders the empty movement-label slot: the `.gantt-drag-preview-label` node and its styles are gone (the readout chip shows the move).
  
  **Column definitions.** A cell template now works in a declarative column: put the `<ng-template let-row>` inside an `<ng-container ganttColumn>` (inside an `<ng-template ganttColumn>` the content query never saw it, so the cell stayed the default one). Over a column of your own `[columns]`, a `ganttColumn` overrides only what it sets: its cell keeps the column's `sortable` and `sortValue` (a cell of your own over a built-in column still sorts only when told). New `[sortValue]` input.
  
  **`GanttDataSource.destroy()`**, as on the Web Component's data source: drops a load in flight and stops paging (`hasMore()` turns false). **Load more is a button again.** The lazy data source's footer always shows the Load more button, as `<gantry-element>` does (with auto-load it also loads when the footer scrolls into view), so keyboard and switch users can load the next page; the "All loaded" line drops its check-mark glyph.
  
  **`initialScroll` in the final viewport.** The first scroll uses the timeline width the panes have once measured (the first render may still show the provisional panel width), so the date it centres sits at the centre, as in `<gantry-element>` (it was off by half the panel's growth).
  
  **Review fixes.** The drag ghost and the readout follow the row's styled height and radius; `togglePanel()` and the toolbar's task-list button switch the table view to the chart view; an open tooltip is rebuilt when its row's style changes; `setState()` re-checks the narrow width at once, and `setView()` with the view already shown no longer counts as the user's pick while narrow. The load-more footer keeps its button while a page loads ("Loading…", `aria-disabled`; the spinner is gone), as `<gantry-element>`.
  
  **Breaking**
  
  - Charts narrower than 640 px change by default: `responsive` (`{ breakpoint: 640, view: 'chart' }`) shows the timeline alone below the breakpoint (`getState().view` keeps the wide view), and `toolbar.overflow: 'menu'` moves the zoom levels, the views and Today into a More menu when the toolbar doesn't fit instead of wrapping. Set `responsive: false` and `toolbar: { overflow: 'wrap' }` for the previous layout.
  - A mouse press on a bar now focuses that bar instead of the timeline viewport (a touch or pen drag too), without showing its focus ring, and a mouse press on a bar that cannot be dragged prevents the native focus and text selection too; Escape during a press only cancels the press (the chart's shortcuts and the page don't see it).
  - On the server, fewer header cells, bands and grid lines are rendered, windowed like a 1024 px viewport instead of mounting the whole timeline (the browser renders the rest after it measures).
  - The drag ghost's `.gantt-drag-preview-label` node and its styles are gone.
- 2d41fde: **Editing surface.** Every task change — a drag, a resize, keyboard move mode (↑/↓ now change the progress with `editing.progress`), the API — goes through one change pipeline: new outputs `beforeChange` (veto with `preventDefault()`), `tasksChange`, `taskUpdated`, `taskProgressChanged`, `dependencyCreated`, `dependencyDeleted` and `historyChange`; new methods `undo()`, `redo()`, `clearHistory()`, `addDependency()`, `removeDependency()`, `editCell()` and `focusTask()`, and the signals `canUndo` / `canRedo`. Edits are written to the data source (new `GanttDataSource.patch()`: they survive the next page) or to `series`, and so are `updateTask()` / `appendTasks()`. New `<ng-template ganttCellEditor let-edit>` directive (`CellEditorTemplateContext`) for custom cell editors; `ColumnDef.editor` accepts it or a function.
  
  **Edit with the pointer in `<gantry>`** (with `options.editing`), as in `<gantry-element>`. The hovered bar, the one focused from the keyboard and, on touch screens, the selected bars now show a progress grip (`rect.gantt-progress-grip`) and two link connectors (`rect.gantt-link-connector`, with `--source` / `--target` / `--invalid` while a link is made). Drag the grip to change the progress (live fill, one `taskProgressChanged` and one undo step on release). Drag from a connector to another bar to link them, or click (tap) a connector and then the target bar; `path.gantt-link-preview` shows the link meanwhile. Click a dependency arrow to select it (`dependencies.delete`). The cursor follows the part under the pointer (`ew-resize`, `crosshair`, `pointer` over an arrow). The progress grip and the connectors are hit only where they show, so a press inside a narrow bar still moves it.
  
  A bar can be dragged when its row's edit rules allow it. A rolled-up parent (`rollup.dates`) and an `editable: false` task no longer start a drag or get `gantt-bar-draggable` (also in a custom bar's `ctx.draggable`). With `editing` off, the chart looks and behaves as before.
  
  **Draw and delete links in `<gantry>`** (`options.editing.dependencies`), as in `<gantry-element>`: drag from a bar's connector to another bar, click a connector then the target, or press **L** on a bar, move to another with the arrow keys and press Enter (FS); the type follows the ends (FS, SS, FF, SF), invalid targets (the same task, a duplicate, a loop, a parent ↔ child link, a read-only task) create nothing and are announced, and the host has the `gantry-linking` class while a link is drawn. Click an arrow to select it (`gantt-arrow--selected`, Highlight in forced colours), then Delete or Backspace removes it; Escape deselects. Every link change goes through the pipeline (`(beforeChange)`, `(dependencyCreated)` / `(dependencyDeleted)`, undo).
  
  **Undo keys:** Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo while the chart keeps a history (`editing.history`), except in text entry, inside an open cell editor and in move mode, where the browser's own keys stay.
  
  **Cell editing in `<gantry>`** (`options.editing.cells`), as in `<gantry-element>`. F2, Enter, a double-click (`rowDblClick` still emits) or typing a character opens a task-list cell's editor; Enter commits, Tab / Shift+Tab commit and edit the next / previous editable cell, Escape cancels, and leaving the cell commits a valid value. Each commit is one undoable `'cell'` change through the pipeline (`beforeChange` can veto it); an invalid value keeps the editor open with `aria-invalid` and the message under the cell. Cells carry `aria-readonly` while cell editing is on, and `editCell()` now opens an editor. `ganttColumn` gains the inputs `editable` (also a bare attribute), `editor`, `editorOptions`, `exportValue`, `parse` and `validate`; an `<ng-template ganttCellEditor let-edit>` inside `<ng-container ganttColumn>` is the column's custom editor, and the cell template is the other `<ng-template>`.
  
  A custom cell editor (template or function) gets the chart's editor look, focus ring, invalid outline and forced-colours rules: they reach the consumer's node through its `gantt-tl-editor` class.
  
  **Undo and Redo in the toolbar of `<gantry>`.** While the chart keeps history (`options.editing` on, not controlled) and `toolbar.undo` is on (the default), the toolbar shows Undo and Redo icon buttons after the panel toggle, as `<gantry-element>` does. They are `aria-disabled` while there is nothing to undo or redo, stay in the toolbar's arrow-key set and never move into the More menu. Dragging a progress grip shows the new progress ("45%") in the readout chip; a disabled Undo / Redo is `GrayText` in forced colours.
  
  `GanttDataSource.patch(update)` is new: it edits the loaded items without refetching, keeping the paging state (a page in flight is appended to the patched list; `setStatic()` and `reset()` drop the patch), so edits survive the next page.
  
  **Breaking:** `(rowClick)` emits the clicked row (`GanttFlatRow`) from both panes, like every other binding, instead of its `RowGeometry` (`$event.row.task` → `$event.task`). `series` is a model: bind `[(series)]` to get the tasks the chart applied (one-way `[series]` still works).
  
  **Review fixes.** Controlled and handled changes propose the app's own tasks; Enter / F2 / L ending a click-mode link makes FS; an undo / redo step that validation rejects is dropped; keys typed right after the key that opens a cell editor reach it; the selected link clears when it disappears, doesn't flicker when clicked again and has a halo; the link preview follows a zoom; `focusTask()` shows the focus ring after a mouse click.
- 316c052: **`<gantry>`: keyboard, touch, zoom, chart states and accessibility**, the same as `<gantry-element>`.
  
  **New**
  
  - Inputs `loading` (boolean attribute) and `errorMessage`, the `retry` output (`RetryEvent`: `{ source: 'error' | 'dataSource' }`), `[ganttEmpty]` content for the empty state, `fitToScreen()`, and `<ng-template ganttTooltip>` (`GanttTooltipTemplateDirective`, `GanttTooltipTemplateContext`: `$implicit` / `model`, `task`, `row`) for the tooltip's content, which wins over `options.tooltip.render`. The body shows a loading skeleton (the host is `aria-busy`), an error box (`role="alert"`) whose Retry emits `retry` (and calls `dataSource.retry()` after a failed first page), or the empty box.
  - Every Phase 9 option: `keyboard.characterShortcuts`, `tooltip` (`trigger`, `showDelay`, `hideDelay`, `render`), `legend.position`, `markers.lane`, `bar.handles.hitSize` and `toolbar.fit`.
  - Keyboard: the task list is a row-first treegrid (↑/↓, PgUp/PgDn, Home/End between rows, the header row above the first, →/← expand / collapse or into the cells, Enter activates or sorts, Space / Shift+Space / Ctrl+Space select); the bars rove (↑/↓ between bars, ←/→ pan one header cell) and Enter / F2 start move mode (←/→ move, Shift+←/→ and Alt+←/→ resize, Enter commits with the same `taskDragged` / `taskResized` as a drop, Esc cancels); F fits the tasks to the screen; expand / collapse and move-mode steps are announced. The focused bar's ring and the resize grips are drawn in one overlay, for custom bars too.
  - Pointer and touch: touch and pen drag after a 350 ms long-press (moving earlier pans; a tap toggles the tooltip), auto-scroll near the viewport's edges, 24 px resize targets with grips; Ctrl/⌘ + wheel, trackpad and touch pinches and Safari's gesture events zoom around the pointer (`viewModeChange` reports each level).
  - The tooltip opens on hover, on keyboard focus and on a tap, the pointer can rest on it, Escape closes it, and its bar is `aria-describedby` it. A drag readout chip shows the new dates while a bar is dragged, resized or moved from the keyboard. The marker lane under the header tiers holds the today chip and the annotation labels.
  - Forced colors: under `@media (forced-colors: active)` the chart paints with system colours, as the Web Component does. Custom bar components keep their own paints (style encapsulation) unless they add forced-colors rules.
  
  **Breaking**
  
  - Every bar, custom ones included, is stamped by the chart as an `option` of the timeline's `listbox` (`labels.ariaBars`): `role="option"`, `aria-label`, `aria-roledescription`, `aria-selected`, `aria-posinset` / `aria-setsize` among the visible rows, a roving `tabindex`, `data-bar-type` and `data-focus-key`; the chart's values win over a custom bar's own `role` / `aria-label`. Built-in bars no longer bind `role="listitem"` / `aria-label`.
  - Tab order: toolbar (one roving stop) → task list (one stop) → splitter → toggle → bars (one roving stop). The timeline viewport is a tab stop only while no bar is mounted; sortable header cells and collapse toggles are no longer tab stops; header cells' focus key is `head:<column>` (was `sort:<column>`). Enter on a movable bar starts move mode instead of selecting it, and Space toggles a row in multiple selection.
  - Toolbar (painted from core `buildToolbar`, the Web Component's markup): icon buttons (zoom out, zoom in, Fit) and Today with an icon instead of the glyphs; the zoom levels and views are radio groups (`aria-checked` instead of `aria-pressed`, checked by Space / Enter / click), the views icon-only ("Table and chart", "Table only", "Chart only"); 32 px controls with `data-focus-key`. `role="toolbar"` and its `aria-label` move from `<gantt-toolbar>` to `div.gantt-toolbar`; `[ganttToolbar]` content stays between Today and the view switch, outside the roving set.
  - The legend is an in-flow strip under the panes (`div.gantt-legend.gantt-legend--bottom`, after `.gantry-main`) instead of a box floating over the bars, or the toolbar's last child with `legend.position: 'toolbar'`.
  - A mouse press drags a bar only after a 3 px move (a smaller move is a click); a touch press only after the long-press. The cursor comes from a `data-cursor` attribute on the canvas instead of an inline style.
  - The tooltip is anchored below its bar instead of following the pointer.
  - Announcements are debounced (250 ms, the last one wins) and zoom changes are announced.
  - The header grows by an 18 px marker lane when an annotation has a label (`markers.lane: false` keeps the old height), and annotation labels leave the canvas while the lane shows. The task-list footer only shows under rows (a first data-source page loads and fails in the chart state).
  - Every focus ring, the splitter's and its toggle's included, uses `--gantt-focus-ring` (was `--gantt-sel-border`); the host sets `line-height: normal`; both panes get `scroll-padding-top`.
  
  **Fixed:** the timeline `<svg>` was an extra, unnamed tab stop in Chromium (its focus listeners made it focusable; they moved to an HTML ancestor); load-state announcements no longer depend on effect timing.
  
  - Scroll sync no longer writes the task list's stale offset back over a keyboard move at key-repeat speed (the focused bar ended under the header): it mirrors at once through core `createScrollMirror`, as the Web Component.
  - A focused bar scrolls into view with its whole focus ring below the sticky header and inside the timeline (core `timelineScrollPadding`).
  - While the state box covers the body, the timeline, the splitter and the task-list rows are `inert`, and focus on them moves to Retry, else the toolbar.
  - Without rows (loading, empty, a failed first page) the first task-list header cell is the list's tab stop.
  - The loading box has a visually hidden `labels.loading` text (`span.gantt-state-message`).
  - The `gantry-loading` host class also follows the `loading` input; the drag readout chip is attached only while it shows the new dates; shortcuts work on the splitter's collapse toggle (only the handle keeps its keys).
- c8b61c7: **Theming through CSS variables.** Every colour of the render model is now a `Paint`: a CSS colour
  value that is either a theme token (`var(--gantt-*)`) or an explicit task / option colour passed
  through as is. Both renderers apply paints as CSS properties, and the theme reaches the pixels only
  through custom properties. The resolved config no longer carries the theme.
  
  ### `@gantryjs/core` (breaking)
  
  - `resolveConfig(options, theme, i18n)` becomes `resolveConfig(options?, i18n?, metrics?)`, where
    `metrics` is `Partial<ThemeMetrics>` (pass `themeMetrics(theme)`; only `barRadius` is read, as the
    default `bar.radius`). `ResolvedGanttConfig.theme` is removed.
  - The resolved-colour fields are replaced by paints:
  
    | Removed                                             | Replacement                                                                  |
    | --------------------------------------------------- | ---------------------------------------------------------------------------- |
    | `BarVisual.fill`, `.label.color`, `.progress.color` | `BarVisual.paint.{body,label,progress}`, plus `BarVisual.tone`               |
    | `ArrowVisual.color`                                 | `ArrowVisual.paint`                                                          |
    | `TimeBand.color`                                    | `TimeBand.paint` (bands merge by kind and paint)                             |
    | `ResolvedLine.color`                                | `ResolvedLine.paint`                                                         |
    | `LegendItem.color`                                  | `LegendItem.paint`                                                           |
    | `CellVisual.dotColor`                               | `CellVisual.dotPaint`                                                        |
    | `statusColor(status, theme)`                        | `statusPaint(status)`                                                        |
    | `TooltipModel.colors`, `TooltipColors`              | `TooltipModel.critical` + `TooltipModel.paint.progress` (chrome: CSS tokens) |
  
  - No more theme inputs: `buildTooltipModel`'s `config` has no `theme`, `buildLegend` takes no
    `theme`, `computeCellVisual(col, row, ctx)` drops its fourth argument, and `computeTimeBands`
    reads no `cfg.theme`. `computeBarVisual` takes `fontPx` and `barTextColor` (the label colour on an
    explicit `task.barColor`, default `'#FFFFFF'`) from `themeMetrics(theme)`.
  - Bar labels on theme fills use the contrast tokens `--gantt-bar-text-on-bar`,
    `--gantt-bar-text-on-milestone` and `--gantt-bar-text-on-critical`
    (`readableOn(fill, barTextColor)`). A page-CSS override of `--gantt-bar`, `--gantt-milestone` or
    `--gantt-critical` must also set the matching token, or use `setTheme()`.
  - Custom renderers: get a concrete colour with `resolvePaint(paint, theme)` (it accepts the bar
    context's `ctx.theme`).
  - `annotationPaint()` gives `isToday` annotations the today colour (the Web Component used to ignore
    `isToday`; Angular already drew them in the today colour), so the line, its region and its legend
    swatch agree in both renderers.
  - New label `dragDelta(amount, unit)` (`'+3d'` / `'-2h'`), deprecated in the same release: the drag
    readout chip shows the move instead. Like the other new `GanttLabels` members, only objects typed as
    a full `GanttLabels` need it; `options.labels` stays partial.
  - New exports: `Paint`, `ThemeColorKey`, `themeVar`, `isThemeVar`, `resolvePaint`, `PAINTS`,
    `rowPaint`, `annotationPaint`, `statusPaint`, `themeToCss`, `CONTRAST_CSS_VARS`, `ThemeMetrics`,
    `themeMetrics`, `sameThemeMetrics`, `BarTone`, `BarPaint`, `TooltipPaint`, `headerCellBorder`,
    `buildArrowIndex` (`ArrowIndex`, `ArrowLink`), `computeDragGhostVisual` (`GhostVisual`,
    `GhostLabel`), `DRAG_SOURCE_OPACITY`, `quantizeNow`, `todayX`, `periodNext`,
    `VIEWPORT_FALLBACK_HEIGHT`.
  
  ```ts
  // before
  const cfg = resolveConfig(options, theme, i18n);
  bar.setAttribute('fill', visual.fill);
  // after
  const cfg = resolveConfig(options, i18n, themeMetrics(theme));
  bar.style.setProperty('fill', visual.paint.body); // or resolvePaint(visual.paint.body, theme)
  ```
  
  ### `@gantryjs/vanilla`
  
  - The theme variables live in a `:host` stylesheet inside the shadow root instead of the host's
    inline style: page CSS on `gantry-element` overrides them, and a string `style` attribute (for
    example Svelte's `style=`) or `setAttribute('style', …)` no longer wipes them.
  - With `darkMode: 'auto'`, an OS colour-scheme flip re-renders the chart at once.
  - Colours are set through the CSSOM, never as presentation attributes or style text, so a task
    colour such as `'red;background:url(x)'` can no longer inject CSS.
  - Custom `renderBar`: `ctx.visual.fill`, `ctx.visual.label.color` and `ctx.visual.progress.color`
    are gone; `ctx.visual.paint.{body,label,progress}` may be `var()` strings — apply them as style
    properties or resolve them with `resolvePaint(paint, ctx.theme)`. `ctx.theme` is the element's
    resolved theme.
  - The built-in bar a custom `renderBar` gets from `renderDefault()` paints with the `--gantt-*`
    variables, so it needs them in scope (inside the element or on an ancestor). The low-level painters
    (`paintBar`, `GanttCanvasProps`, `GanttTaskListProps`, …) are no longer exported (see the engine
    changeset).
  - `@gantryjs/react`, `@gantryjs/vue` and `@gantryjs/svelte` follow in the same release (fixed version
    group); no API change there.
  
  ### `@gantryjs/angular` (breaking)
  
  `@gantryjs/angular` re-exports `@gantryjs/core`, so every core change above reaches Angular users. In
  particular, **custom bars** registered with `provideGanttBar()` that read `ctx.visual.fill`,
  `ctx.visual.label.color` or `ctx.visual.progress.color` must switch to `ctx.visual.paint.body` /
  `.label` / `.progress`: bind them as styles (`[style.fill]="ctx.visual.paint.body"`) or resolve them
  to colours with `resolvePaint(paint, ctx.theme)`. Code calling `resolveConfig`, `statusColor` or
  reading `TooltipModel.colors` migrates as described in the `@gantryjs/core` section.
  
  - Paints are bound through `[style.fill]` / `[style.stroke]` / `[style.background-color]`. Page CSS
    that targeted SVG `fill` / `stroke` presentation attributes no longer applies; restyle through the
    `--gantt-*` tokens.
  - The theme service also writes the contrast tokens (`themeToCss`).
  - Header cell borders come from core (`headerCellBorder`).
  - The chart's resolved theme reaches custom bars as `ctx.theme`; the `resolveConfig` call site
    passes the theme metrics, so a colour-only theme change re-renders no geometry.
  - The task list, load-more footer and drag preview are painted with the chart's `--gantt-*` tokens
    (their `theme` inputs are gone in `@gantryjs/angular`, where these components are internal).

### Minor Changes

- 2cf00e4: Fully configurable chart, rendered from one shared core model in every binding: N-tier header scales with custom formats (ISO / Sunday weeks, "W52", "4–11 Mar"…), zoom presets and an Hour view; period delimiters through header and body; weekends, holidays, working and intensive hours; bar / milestone / group / arrow sizing and styling; a resizable, collapsible task-list panel (30% by default, remembers its last width) with horizontal scroll, a split / table / chart view switch and persisted UI state (`stateKey`, `state-change`). Fixes time-zone and daylight-saving misalignment, header/row misalignment, label overflow and many smaller rendering bugs.
- 6522a87: Data sources share one framework-free loader (`PagedLoader` in `@gantryjs/core`): failed pages retry automatically with exponential backoff (`retries`, `retryDelay`), then show an error with a Retry button, emit `loadError` / `load-error` and pause until `retry()` — no more request storm. `reset()` replaces instead of duplicating, `initialPage` works (`0` = wait for `loadNext()`), and Angular's `GanttDataSource` gains `error()`, `nextPage()` and `retry()` and no longer needs an injection context. New labels `loadError` and `retry`.
- 6522a87: New `initialScroll` option: `'auto'` (default) centres today only when it is near the tasks and otherwise shows the earliest task, so the first view always has bars; also `'today'`, `'start'`, a `Date` or `false`. Zooming now keeps the date at the viewport centre in place, an earlier range start no longer shifts the view, and smooth scrolling honours `prefers-reduced-motion`.
- 19d6e62: Gantry is now available for every framework: `@gantryjs/core` (framework-free logic), `@gantryjs/vanilla` (`<gantry-element>` Web Component), and `@gantryjs/react`, `@gantryjs/vue`, `@gantryjs/svelte` bindings. `@gantryjs/angular` now builds on `@gantryjs/core` and gains column sorting (built-in columns are sortable).
- c8b61c7: The drag ghost is painted from the model `@gantryjs/core` computes (`computeDragGhostVisual`), the same one the Web Component
  uses: a dashed outline at 35 % opacity (the drag readout chip shows the new dates). The drag preview component is
  internal in `@gantryjs/angular`.
- d78716b: **`<gantry>` exports and prints the plan**: `exportSvg()`, `exportCsv()`, `exportPng()`, `download(format, options?)` and `print()` (all async) draw every shown row from the chart's model, not from the painted DOM, and give the same SVG and CSV as `<gantry-element>`. `exportPng()` and `print()` reject with a `RangeError` past the canvas limits or `maxPages`. Custom bar components are rendered off-screen once each and saved as drawn (attributes and inline styles, with core's markup rules: no script, style, animation, event handler, remote link or `url(…)`; component stylesheets don't travel; a subclass of a built-in bar counts as custom; `customBars: 'builtin'` draws built-in bars instead). `exportSvg()` and `exportCsv()` also work during server rendering (custom bars drawn as built-in); `exportPng()`, `download()` and `print()` need a browser and reject on the server before `beforeExport`. New type `GanttDownloadOptions` (a format's options and `fileName`).
  
  New outputs: `beforeExport` before a `download()` or `print()` (call `preventDefault()` on it, synchronously, to cancel), then `export` with the file name and size or the page count. Downloads go through a temporary blob link in the host, PNGs through a canvas, prints through a hidden `about:blank` frame built with DOM APIs; PNG and print need `img-src blob:` under a Content Security Policy.
  
  **Toolbar Export menu** (`toolbar.export`, default off), as in `<gantry-element>`: an Export menu button after the views opens a menu of `export.formats` (SVG image, PNG image, CSV table, Print…) with the More menu's keys and focus rules. Only one of the two menus is open at a time; when the toolbar is too narrow, the formats become a section of More. Choosing a format runs `download()` or `print()` with `trigger: 'toolbar'`; a failure goes to the alert region ("Couldn’t export the PNG image", "Couldn’t print the chart").
  
  **`@media print` rules**: Ctrl+P prints the mounted chart without the toolbar, splitter, load-more footer, live regions, tooltip, readout, overlays and scrollbars, with exact colours (`print()` prints every row). In forced colours, the open More or Export button is shown in Highlight.
- ab1e292: Working calendar (`options.calendar`) in the Angular chart: the critical path, the rollups and the column context follow the calendar (a zoom or a theme change keeps them), and a pointer drop, a move-mode commit or a start cell keeps a task's working length as one `taskDragged`. No new inputs or outputs.
- b4636c8: Resource view in the Angular chart: the new `resources` input (people and teams), `options.rows: 'resources'` and the toolbar's rows toggle (`toolbar.rowsToggle`) show one row per resource, team and Unassigned with its daily load against its capacity (`g.gantt-load`), the part above it hatched, a tooltip with the day's load and tasks, the Resources, Capacity and Peak load columns, the exports and an editable Resources cell; `getState()` / `setState()` carry `rows`. Tasks mode (`rows` unset) draws and exports exactly as before.
- cdcf5cd: `ViewMode`, `DependencyType` and `TaskType` are now `as const` objects with a same-name union type (no TS enums): `ViewMode.Week` reads the same and plain strings are accepted. Optional properties of the public types accept `undefined` explicitly, so projects using `exactOptionalPropertyTypes` can pass `undefined`. `@gantryjs/angular` declares `"type": "module"`. Task-list rows can be focused and selected with Enter / Space.
  
  New `GanttThemeOverrides` type for `options.theme`, `setTheme()` and `patchTheme()`: any token may be `undefined` (keeps the built-in value).
- 6522a87: Split panel vs table view: the panel next to the timeline shows `name`, `start`, `end`, `progress`; the table view shows type, a derived status (with a coloured dot), duration, predecessors and, with `baseline`, baseline start/end and variance. `panel.columns` / `table.columns` pick columns by key (built-ins need no definition), `setColumnVisible(key, visible, view)` works per view, sorting reorders siblings at every tree level, and custom columns get `sortValue` and a `ColumnContext`. Visible changes: the default panel drops Duration; Duration reads the drawn span (one day longer with `endDateMode: 'inclusive'`); code building a full `GanttLabels` object needs the new keys.

### Patch Changes

- 334435c: Header cells and non-working bands are tracked by position, like the Web Component's keyed layers, and grid lines by index: a rebuilt timeline (new tasks, a zoom, a loaded page) patches them in place instead of re-creating every node, and development builds no longer warn with NG0956.
- 6522a87: Angular: bars follow their rows after collapse / sort, `selectionChange` is emitted for every selection (task list, keyboard, API), Ctrl/Cmd+A selects all visible rows and honours `enableSelection` / `multiSelect`. Shortcuts are ignored while typing in inputs or `contenteditable` cells. The resolved config gains `selection: { enabled, multi }`.
- d2e5d4c: Bug fixes: tasks with a `null`, empty, unknown or cyclic `parentId` no longer disappear and a task without `end` no longer breaks the date columns (new `normalizeTasks()`); the critical path reads dates like the bars (`endDateMode: 'inclusive'` counts the last day, hour-level tasks use fractional days); column sorting is linear-time.
- 7bf8c1b: **One task-list markup for both renderers.** `<gantry-element>` and `<gantry>` render the task list
  with the same elements, classes and colours:
  
  - Every inner span has a class: the header label `gantt-tl-ellipsis`, the sort icon
    `gantt-tl-sort-icon` (`gantt-tl-sort-icon--active` on the sorted column), and the name cell
    `span.gantt-tl-name` > `button.gantt-collapse-btn` | `span.gantt-tl-indent` · `span.gantt-tl-icon` ·
    `span.gantt-tl-ellipsis`. Text colours, sizes and weights are stylesheet rules on the theme tokens:
    header labels and group names `--gantt-text` (groups 600), leaf names and cell texts
    `--gantt-text-sec`, sort and task icons `--gantt-text-muted` (an active sort icon `--gantt-text`).
    Only a task's `barColor` stays an inline colour, on its icon.
  - The column resize handle lies inside its header cell (`right: 0`): all 6 px can be grabbed (the
    header cell clipped half of it before).
  - `@gantryjs/vanilla`: cell texts use the secondary text colour (`--gantt-text-sec`, was `--gantt-text`),
    the collapse toggle is a 24 × 24 px target (WCAG 2.5.8; it was 20 px wide) and leaf names are
    indented to match (4 px more), and rows with children get the class `gantt-tl-row--group`, as in Angular.
  - `@gantryjs/angular`: the toolbar group that holds `[ganttToolbar]` content has the classes
    `gantt-tb-slot gantt-tb-group` (in that order; was `gantt-tb-group gantt-tb-slot`), and the task-list
    `grid-template-columns` comes from `columnsGridTemplate()` in `@gantryjs/core`.
- c8b61c7: **Accessibility of `<gantry-element>`.** The host is a landmark region instead of a tab stop, and keyboard focus moves
  through the controls inside it.
  
  ### `@gantryjs/vanilla` (breaking)
  
  - **No `tabindex` on the host.** The element no longer makes itself focusable: the shadow root delegates focus, so
    `el.focus()` focuses the first internal tab stop. The tab stops are,
    in order: the toolbar buttons, the task list (one row at a time: the focused row, else the row focused last while it
    is mounted, else the first row in view; the other rows have `tabindex="-1"`), the splitter, its collapse toggle and the
    timeline viewport (`role="group"`, `tabindex="0"`, named by `labels.ariaChart`; arrow keys scroll it). Each shows a
    focus ring in `--gantt-sel-border` on keyboard focus. A page that set `tabindex` on the element should remove it.
  - **No `data-theme` on the host.** Use the `dark` custom state instead: `gantry-element:state(dark) { … }` replaces
    `gantry-element[data-theme="dark"]` (Chromium 90–124 use the legacy `:--dark`). The host also exposes `:state(dragging)`
    while a bar is dragged or resized and `:state(loading)` while a data-source page loads.
  - **`role="region"` through `ElementInternals`.** The host is a region named by `labels.ariaChart` (kept in sync when the
    labels change) without adding attributes; a `role` or `aria-label` the page sets on the element still wins. Engines
    without ARIA on `ElementInternals` get `role="region"` and `aria-label` host attributes when the element connects.
  - **The splitter's separator is a child of `.gantry-splitter`.** `role="separator"`, `tabindex="0"` and the new
    `aria-valuenow` (the panel width in px), `aria-valuemin` (0 when the panel is collapsible, else `panel.minWidth`) and
    `aria-valuemax` (the widest panel the splitter allows; core `splitterValue()`) moved to `.gantry-splitter-handle`,
    which covers the splitter box; the collapse toggle is its sibling, no longer nested inside the separator (whose
    children are presentational). `::part(splitter)` is still the box. Keyboard handling is unchanged.
  - **Live region.** A polite `.gantt-sr-live` (`role="status"`) announces changes of the number of selected tasks
    (`labels.announceSelection`) and the data source's load state (`labels.loading`, then `labels.announceLoaded(n)` or
    `labels.allLoaded(n)`); a failed page is still announced once in `.gantt-sr-alert`.
  - When the focused control disappears (its row was removed), focus goes to the timeline viewport (in the table view, to
    the task list's tab-stop row) instead of the host. A press on a bar focuses that bar.
  - The toolbar is named by `labels.ariaToolbar`.
  
  ### `@gantryjs/core`
  
  New labels in `GanttLabels` / `DEFAULT_LABELS`: `ariaToolbar` (`'Chart toolbar'`, the toolbar's accessible name) and
  `announceLoaded(count)` (`'20 tasks loaded'`, read when a data-source page loads and more remain). They are required
  members of `GanttLabels`: only objects typed as a full `GanttLabels` need them, `options.labels` stays partial.
  
  ### `@gantryjs/angular`
  
  The toolbar is named by `labels.ariaToolbar`, like the Web Component's.
- 6522a87: Web Component: focus stays on toolbar buttons, sort headers and collapse toggles across re-renders; bands and vertical grid lines are built once per timeline instead of on every scroll frame (Angular draws them full height too, so scrolling no longer rewrites them); a pending state save is written on disconnect and the data source re-syncs on reconnect.
- Updated dependencies [639ad08]
- Updated dependencies [6522a87]
- Updated dependencies [2cf00e4]
- Updated dependencies [7bf8c1b]
- Updated dependencies [1cedb3f]
- Updated dependencies [6522a87]
- Updated dependencies [6522a87]
- Updated dependencies [6522a87]
- Updated dependencies [19d6e62]
- Updated dependencies [d2e5d4c]
- Updated dependencies [8891728]
- Updated dependencies [2d41fde]
- Updated dependencies [d78716b]
- Updated dependencies [ab1e292]
- Updated dependencies [b4636c8]
- Updated dependencies [316c052]
- Updated dependencies [cdcf5cd]
- Updated dependencies [6522a87]
- Updated dependencies [c8b61c7]
- Updated dependencies [c8b61c7]
  - @gantryjs/core@2.0.0
