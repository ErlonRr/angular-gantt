---
paths:
  - 'packages/angular/**'
  - 'apps/demo-angular/**'
---

# @gantryjs/angular rules

## Style

- Angular 22: standalone components (no `standalone: true`), `ChangeDetectionStrategy.OnPush`, signal APIs
  (`input()`, `output()`, `model()`, `computed()`, `linkedSignal()`, `viewChild()`, `contentChild(ren)()`),
  `input(…, { transform: booleanAttribute })` for boolean inputs, `host: {}` metadata (no `@HostListener` /
  `@HostBinding`), `inject()`, `@if` / `@for` with `track`. Zoneless only: no `NgZone`, never rely on zone.js.
- No geometry, sizes or defaults in a component or template: they come from `@gantryjs/core`
  (`resolveConfig`, `buildTimeline`, `computeBarVisual`, the window helpers…). Components paint the model.

## State: the layout service is the graph

- `GantryComponent` binds its inputs into its per-chart services **once, in its constructor**
  (`themeSvc.bind`, `i18n.bind`, `colSvc.bind`, `layout.bindTasks` / `bindState` / `bindConfig` /
  `bindColumns`); everything downstream is `computed` or `linkedSignal`. Never copy inputs into services with an
  effect.
- `GanttLayoutService` mirrors the Web Component's graph (`packages/vanilla/src/engine/graph/*`): input signals
  (tasks source, options, the `viewMode` model, `viewportWidth` / `viewportHeight`, scroll offsets, `now`,
  `focusedRowId`) → computeds with the **same** core calls and equality cut-offs (`sameVirtualWindow`,
  `sameHorizontalWindow`, `quantizeNow` + `getTime`): `timeline`, `todayX`, `rowGeometries` / `geometryById`,
  `vWindow` (focused and dragged rows pinned), `mountedGeometries`, `hWindow` (`HORIZONTAL_WINDOW_QUANTUM`),
  `tierWindows` / `bandWindow` / `lineWindow`, `markerLane` / `headerHeight` (tiers + marker lane: use it for
  everything below the header, never `timeline().headerHeight`), `chartState`, `legendItems` / `legendPlacement`,
  `levelLabel`. The interaction inputs mirror the WC's too: `focusedRowId`, `hoveredBarId`, `focusVisibleBarId`,
  `zoomAnchorX` (consumed once by core `anchoredScrollLeft`) and `scrollRequest` (`fitToScreen`). Header, canvas
  and task list inject it; keep the windows equal to the WC's for the same scroll and size (the paint parity test
  compares them).
- Consumer-seeded state the user can change is a `linkedSignal` (`tasks`, `collapsedIds`, `level`, `view`,
  `panelWidthPx`, `initialScrollPending`). `viewMode` is a `model()`: the shown `level` is whichever of
  `[viewMode]` / `options.viewMode` changed last, else the user's zoom.
- Phase 10 graph additions: `mainWidth`, `hoveredRowId`, `shared` (the sync group's range, date equality),
  `rollups` (`computeRollups`, cut-off on the rolled-up fields; `applyRollups` runs before `sortTree`, and
  `seedCollapsed(tasks, seen, groupBar.collapsed)` seeds only when the tasks change), `timeline` over the shared range
  plus `naturalRange` (what the chart reports to its group), `critical` / `criticalIds`, `rowStyle` (core
  `createStyleResolver`, layer-by-layer equality) and `barSegments` (`rollupSegments`). Canvas rows, task-list rows and
  icons, bars and the tooltip read the resolved style from `layout.rowStyle()`, never `task.style` or the flat colour
  fields; events carry the consumer's task (`rollupSource`). On the server `hWindow` uses a 1024 px fallback width.
- **Effects whitelist:** the `viewModeChange` emission (model sync + zoom announcement + `saveState`; a level applied
  by the sync group is not announced: `sync.takeGroupLevel`), the `loadError` emission, the `options.stateKey`
  restore, the sync-group connection (created after the restore; `GanttSync` in `sync/gantt-sync.ts` reports level,
  panel width and natural range, writes `shared` / `level` / `panelWidthPx` without saving state), the responsive
  effect (re-reads the last width when `options.responsive` or `layout.view` change; `GanttResponsive` →
  core `reduceResponsive` → `layout.view` without `saveState`), the history sync (`editor.syncHistory` follows
  `cfg().editing.history`: creates, reconfigures or drops the `GanttHistory`, emitting `historyChange` when its state
  changed), the load-state announcement (subscribed to the data
  source's `ɵsubscribe`, not inferred from signals), the bar outlet (component type changes, the host attributes it
  stamps) and `afterRenderEffect` / `afterEveryRender` for DOM work (scroll sync in the WC's order: fit request →
  group scroll → `initialScroll` → zoom anchoring / `sync.correct`; focus restore; tooltip placement and the tooltip
  triggers in `tooltip/tooltip-state.ts`: keyboard focus — retried on `mountedGeometries` only while its bar is
  missing —, drag start, rule changes, row gone). The open tooltip's content is a `computed` with a cut-off (task
  object, critical flag, labels, the row's resolved style compared with core `sameTaskStyle`), never the clock. Each effect reads its other inputs in `untracked()`. Anything else
  is a `computed` / `linkedSignal`. Order matters: the `viewModeChange` effect is created before the `stateKey`
  restore, so a restored zoom level emits.
- Editing (Phase 11): every task change goes through `GanttEditorService.commit` (`editing/gantt-editor.service.ts`,
  the same algorithm as the WC's `engine/edit.ts`), built from the raw task. Links: `GanttLinkService`
  (`editing/link.ts`, bar visuals bound by the keyboard directive) owns `layout.link` / `selectedLinkKey`; the
  keyboard directive routes L / Delete / Ctrl+Z / Esc and ignores keys inside `.gantt-tl-cell--editing`. Cell
  editing: `GanttCellEditService` (`editing/cell-edit.ts`) owns `layout.cellEdit`; the task list mounts the editor
  with `[ganttCellEditorMount]` (once per start, so typing never re-renders it), fulfils `cells.takeFocusRequest()`
  after render, and runs `handleCellKey` on its own `keydown` before the chart keymap; the editor's message also
  goes to `.gantt-sr-alert`; the key or dblclick that opens an editor calls `ApplicationRef.tick()` (only from those
  handlers) so fast typing reaches the field; the editor rules are `:host ::ng-deep` so a consumer's custom editor
  gets them. `layout.arrowIndex` is shared by the canvas and the link service; `selectedLinkKey` is a
  `linkedSignal` over it (cleared when the link disappears); the canvas draws `linkPreviewD` from the current bars.
- Pointer: a mouse press on a bar focuses it (`preventDefault` + `focusBar` with `preventScroll`; touch / pen focus it
  when a drag starts); Escape during a press belongs to the press (window capture listener in
  `GanttDragService.trackPress`, removed when it ends). Row hover: the canvas (`rowIndexAtY`) and the task list
  (delegated `pointerover` / `pointerleave`, bound in `afterNextRender`) write `layout.hoveredRowId`; cleared on
  pointer leave, drag start, scroll of either pane (unless pressing) and destroy. `GanttScrollService.group` ports the
  WC's `viewportSync` (echo guard, queued group scroll, scroll reports).
- Shared rules and numbers come from core, never a local copy: `seedCollapsed` (collapse seeding),
  `clampColumnWidth`, `VIRTUAL_OVERSCAN_ROWS`, `splitterValue` / `SPLITTER_KEY_STEP` / `SPLITTER_TOGGLE_OFFSET`,
  `STATE_SAVE_DELAY`, `CLOCK_INTERVAL`; the tooltip's timing from `cfg().tooltip` through `reduceTooltip` and its
  position from `placeTooltip`; `hitTestBar`, the gesture machine (`startGesture`…, `DRAG_THRESHOLD_PX`,
  `LONG_PRESS_MS`), `autoScrollDelta`, `wheelZoom` / `pinchZoomSteps`, `fitZoomLevel` / `fitScrollLeft`,
  `anchoredScrollLeft`; `resolveKey`, `navigateGrid` / `navigateTimeline`, `tabStopIndex`, `gridTabStop`,
  `KeyboardEditSession`, `createAnnouncer`, `createScrollMirror` (scroll sync), `timelineScrollPadding`, `bodyHeight` /
  `pageRowCount`; `buildToolbar`, `resolveChartState` / `skeletonRows`, `legendPlacement`, `computeMarkerLane`,
  `computeAnnotationVisuals`, `formatDragReadout` / `placeDragReadout`, `HATCH_PATTERN`; `layoutToolbar` /
  `estimateToolbarWidth`, `reduceMenu` / `toolbarMenuKey` / `toolbarMenuItems` / `toolbarMenuChecked`,
  `reduceResponsive` / `persistedView`, `layoutCssVars`, `createStyleResolver`, `computeRollups` / `applyRollups` /
  `rollupSegments` / `rollupSource`, `createEchoGuard`, `sharedExtent`.
- Theme: the host binds `[style]="themeSvc.style()"` (`themeToCss`) and the classes `gantry-dark`,
  `gantry-dragging`, `gantry-loading` (no `data-theme`, no DOM writes from services). Chrome is stylesheet rules on
  `var(--gantt-*)`; paints are bound as `[style.fill]` / `[style.stroke]` / `[style.background-color]`, never as
  presentation attributes. Constant styles belong in the component stylesheet, not in bindings.

## Browser APIs and SSR

- No browser globals in `packages/angular/src/lib/**/*.ts` (ESLint `no-restricted-globals`: `window`, `document`,
  `localStorage`, `matchMedia`, `requestAnimationFrame`, `ResizeObserver`, `IntersectionObserver`…). Use
  `inject(DOCUMENT)`, `Renderer2`, `doc.defaultView`.
- Browser work (observers, listeners, timers, `matchMedia`, animation frames, the popover API, focus) starts in
  `afterNextRender` (`GantryComponent` uses `{ earlyRead: () => this.connectBrowser() }`; the canvas binds its
  pointer, touch and zoom listeners in `connectPointer()`) or in event handlers, and is released through
  `DestroyRef`. No `ngOnInit` / `ngAfterViewInit` / `ngOnDestroy`. Timers go through `DOCUMENT.defaultView`
  (e.g. the announcer's), never on the server.
- `ssr.spec.ts` renders three charts with `renderApplication` while the browser APIs throw (one long enough to prove
  the windowed header): keep it green. The responsive view is decided after the first measurement, so the server
  and the first browser frame render the wide layout.

## Bars and providers

- `GanttBarBase` (`bars/bar-base.ts`) is an abstract `@Directive()` declaring
  `ctx = input.required<GanttBarContext>()`; built-in bars extend `GanttBuiltinBar` and paint `ctx.visual`. A bar
  never redeclares `ctx`.
- The canvas renders bars with `[ganttBarOutlet]` on an `<ng-container>` (`bars/bar-outlet.directive.ts`): an SVG
  `<g>` host made with `Renderer2`, `createComponent(type, { hostElement, bindings: [inputBinding('ctx', …)] })`,
  inserted into the container's `ViewContainerRef` (so bars are direct children of `g.gantt-bars-layer`); it stamps
  every bar, custom ones included, as an `option` of the svg `listbox` (`data-task-id`, `data-bar-type`,
  `data-focus-key`, `role`, `aria-label`, `aria-roledescription`, `aria-selected`, `aria-posinset` /
  `aria-setsize`, the roving `tabindex` from `GanttBarFocusService`, `aria-describedby` while its tooltip shows)
  after the component's own host attributes, and dims the dragged bar. Built-in bars bind no role or name of their
  own. The focus ring and grips are `g[ganttBarOverlay]` (one per chart), not part of a bar. The canvas reuses an
  unchanged row's `ctx` object (`contexts` `linkedSignal`): keep it, or every bar re-renders.
- `provideGantt(config?, ...features)`, `withBars(...defs)` and `provideGanttBar(...defs)` return `Provider[]`
  for application, route and component `providers`. `GANTT_GLOBAL_CONFIG` merges each level over its parent
  (`skipSelf`, `mergeGanttConfig`); `global-config.ts` is a leaf module so `provide.ts` stays off the services'
  import path. `GanttBarRegistry` is provided by the canvas (one per chart): built-in bars, then the
  `GANTT_BAR_SCOPE` chain from the outermost level to the innermost; unknown types fall back to `task`.

## Parity with the Web Component

- Same option names, CSS classes, DOM structure and behaviour as `<gantry-element>`: panes `.gantry-panel`,
  `.gantry-canvas-viewport`, `.gantry-canvas-header-sticky`; `.gantry-splitter` > `.gantry-splitter-handle`
  (`role=separator`) + `.gantry-splitter-toggle`; `g.gantt-bars-layer > g[data-task-id]` + `g.gantt-bar-overlay`;
  the `gantt-tl-*` task-list spans; the `gantt-tb-*` toolbar; `div.gantt-legend`; `div.gantt-state`;
  `div.gantt-drag-readout`; `.g-header` tiers + `div.g-marker-lane`; `div.gantt-tooltip` with
  `dl.gantt-tooltip-rows`; `.gantt-sr-live` / `.gantt-sr-alert`. New components use attribute selectors on the
  element the WC renders (`div[ganttLegend]`, `div[ganttChartState]`, `div[ganttDragReadout]`, `g[ganttBarOverlay]`,
  `g[ganttAnnotations]`, `svg[ganttIcon]`), never a wrapper element (D26), and optional nodes are attached with
  `@if` only while shown (D27): the row-hover `rect.gantt-row-hover` (after `g.gantt-rows`, before `g.gantt-bands`),
  `rect.gantt-bar-segment`s (after the bar body), the toolbar's More menu. Bars carry `visual.className` (custom bars
  too, through the outlet). When you change one painter, change the other (the `gantry-reviewer` agent checks
  this).
- Working calendar (Phase 13): the same cut-off in `GanttLayoutService` (`dateReading`, `cpmConfig`, `rollupInput`
  equal on `sameDateReading`); `dragChange(…, untracked(layout.cfg))`; `taskChange(…, { dates })` in
  `drag/keyboard-edit.ts` and `editing/cell-edit.ts`; the tooltip's config `Pick` includes `'calendar'` and its
  refresh key the float and the date reading, like the WC's.
- `e2e/paint.spec.ts` compares the colours both bindings paint. Its keys are the first non-`ng-` class plus the
  sibling index: adding a class to a class-less element, reordering children or adding a wrapper changes keys.
- Accessibility follows the WC's model: the host is `role=region` with `aria-label` (`labels.ariaChart`),
  `aria-busy` from `chartState.busy`, and no `tabindex`; tab stops toolbar (one roving stop) → task list (one stop:
  row-first treegrid, header cells / rows / cells with `data-focus-key`) → splitter handle → toggle → the bars' tab
  stop (`GanttBarFocusService`, core `tabStopIndex`; the viewport `role=group` is `tabindex=0` only while no bar is
  mounted). Keys go through `ɵGanttKeyboardDirective` (`a11y/grid-keys.ts`, `a11y/timeline-keys.ts`,
  `drag/keyboard-edit.ts`); `focusin` writes `layout.focusedRowId` (pinned in the window), keyboard modality
  `layout.focusVisibleBarId`; announcements go through `GanttAnnouncer` (core `createAnnouncer`, debounced). Never
  bind `focus` / `blur` / `focusin` / `focusout` on an SVG element (Chromium makes it a Tab stop): the canvas
  listens on its host. Focus rings use `--gantt-focus-ring`, and every component's `styles` carry its
  `@media (forced-colors: active)` rules (custom bars don't get the built-in bars' ones).
- Light DOM: SVG `id`s must be unique per instance (use the canvas `uid`).

## Public API

- `src/public-api.ts` has explicit named exports only, plus `@gantryjs/core` re-exported as a whole; never a local
  `export *` (the d.ts bundle would get `*_d_exports` namespaces that break api-extractor). Services and inner
  components stay internal.
- Export (Phase 12): `GanttExportService` (`export/gantt-export.service.ts`, provided by `GantryComponent` and bound
  once in its constructor) runs the WC's `export/run.ts` steps; `export/source.ts` builds the source in `untracked`
  (theme overrides from `GanttThemeService.overrides`). The DOM helpers (`export/{download,rasterize,print,serialize}.ts`,
  the WC's bodies with `setAttribute` / `style.setProperty`) sit behind the internal `GANTT_EXPORT_DOM` token (specs
  replace it). Custom bars: `GanttCanvasComponent.renderCustomBarMarkup(ctx)` renders a non-built-in component
  (identity check against `BUILTIN_BARS`) off-screen with `createComponent` on a detached `g`, strips Angular
  attributes, serializes, destroys; on the server bars are built-in and `exportPng()` / `download()` / `print()`
  reject before `beforeExport`. Print CSS: `styles/print.css.ts` last in `GantryComponent`'s `styles` plus a
  `@media print` block in each component painting a hidden node (toolbar, load-more, tooltip, readout, bar overlay,
  drag preview, canvas row hover / link preview), no `!important`. Toolbar: one `@if` menu block after the opener's
  group, `exportState` beside `menuState`.
- The API report `packages/angular/etc/gantryjs-angular.api.md` must match: `pnpm build:lib && pnpm api:angular`
  updates it, CI runs `pnpm api:angular:check`. Removing or renaming a public input, output, method or export is a
  breaking change: `'@gantryjs/angular': major` changeset (deprecate first outside a major).

## Verify

- `pnpm --filter @gantryjs/core build && pnpm build:lib`, then `pnpm build:app`.
- Unit tests: `packages/angular/src/**/*.spec.ts`, run with `pnpm test:angular` (`@angular/build:unit-test`,
  Vitest + happy-dom, specs share one environment). `src/test/dom-shims.ts` (ResizeObserver,
  IntersectionObserver, scrollTo stubs) is loaded by the `setupFiles` of `angular.json`: specs must not import it.
  Provide `provideZonelessChangeDetection()`; await `fixture.whenStable()` instead of `detectChanges()`. Put new
  tests in new spec files.
