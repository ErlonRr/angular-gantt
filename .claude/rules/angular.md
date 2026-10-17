---
paths:
  - 'packages/angular/**'
  - 'apps/demo-angular/**'
---

# ngx-gantry (Angular) rules

## Style

- Angular 22: standalone components (no `standalone: true`), `ChangeDetectionStrategy.OnPush`, signal APIs
  (`input()`, `output()`, `model()`, `computed()`, `linkedSignal()`, `viewChild()`, `contentChild(ren)()`),
  `input(…, { transform: booleanAttribute })` for boolean inputs, `host: {}` metadata (no `@HostListener` /
  `@HostBinding`), `inject()`, `@if` / `@for` with `track`. Zoneless only: no `NgZone`, never rely on zone.js.
- No geometry, sizes or defaults in a component or template: they come from `@gantry/core`
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
  `tierWindows` / `bandWindow` / `lineWindow`. Header, canvas and task list inject it; keep the windows equal to
  the WC's for the same scroll and size (the paint parity test compares them).
- Consumer-seeded state the user can change is a `linkedSignal` (`tasks`, `collapsedIds`, `level`, `view`,
  `panelWidthPx`, `initialScrollPending`). `viewMode` is a `model()`: the shown `level` is whichever of
  `[viewMode]` / `options.viewMode` changed last, else the user's zoom.
- **Effects whitelist:** the `viewModeChange` emission (model sync + `saveState`), the `loadError` emission, the
  `options.stateKey` restore, the load-state announcement, the bar outlet (component type changes) and
  `afterRenderEffect` / `afterEveryRender` for DOM work (scroll sync and anchoring, tooltip placement, focus
  restore). Each reads its other inputs in `untracked()`. Anything else is a `computed` / `linkedSignal`. Order
  matters: the `viewModeChange` effect is created before the `stateKey` restore, so a restored zoom level emits.
- Shared rules and numbers come from core, never a local copy: `seedCollapsed` (collapse seeding),
  `clampColumnWidth`, `VIRTUAL_OVERSCAN_ROWS`, `splitterValue` / `SPLITTER_KEY_STEP` / `SPLITTER_TOGGLE_OFFSET`,
  `STATE_SAVE_DELAY`, `CLOCK_INTERVAL`, `TOOLTIP_SHOW_DELAY` / `TOOLTIP_HIDE_DELAY`.
- Theme: the host binds `[style]="themeSvc.style()"` (`themeToCss`) and the classes `gantry-dark`,
  `gantry-dragging`, `gantry-loading` (no `data-theme`, no DOM writes from services). Chrome is stylesheet rules on
  `var(--gantt-*)`; paints are bound as `[style.fill]` / `[style.stroke]` / `[style.background-color]`, never as
  presentation attributes. Constant styles belong in the component stylesheet, not in bindings.

## Browser APIs and SSR

- No browser globals in `packages/angular/src/lib/**/*.ts` (ESLint `no-restricted-globals`: `window`, `document`,
  `localStorage`, `matchMedia`, `requestAnimationFrame`, `ResizeObserver`, `IntersectionObserver`…). Use
  `inject(DOCUMENT)`, `Renderer2`, `doc.defaultView`.
- Browser work (observers, listeners, timers, `matchMedia`, animation frames, the popover API, focus) starts in
  `afterNextRender` (`GantryComponent` uses `{ earlyRead: () => this.connectBrowser() }`) or in event handlers,
  and is released through `DestroyRef`. No `ngOnInit` / `ngAfterViewInit` / `ngOnDestroy`.
- `ssr.spec.ts` renders two charts with `renderApplication` while the browser APIs throw: keep it green.

## Bars and providers

- `GanttBarBase` (`bars/bar-base.ts`) is an abstract `@Directive()` declaring
  `ctx = input.required<GanttBarContext>()`; built-in bars extend `GanttBuiltinBar` and paint `ctx.visual`. A bar
  never redeclares `ctx`.
- The canvas renders bars with `[ganttBarOutlet]` on an `<ng-container>` (`bars/bar-outlet.directive.ts`): an SVG
  `<g>` host made with `Renderer2`, `createComponent(type, { hostElement, bindings: [inputBinding('ctx', …)] })`,
  inserted into the container's `ViewContainerRef` (so bars are direct children of `g.gantt-bars-layer`); it stamps
  `data-task-id` and dims the dragged bar. The canvas reuses an unchanged row's `ctx` object (`contexts`
  `linkedSignal`): keep it, or every bar re-renders.
- `provideGantt(config?, ...features)`, `withBars(...defs)` and `provideGanttBar(...defs)` return `Provider[]`
  for application, route and component `providers`. `GANTT_GLOBAL_CONFIG` merges each level over its parent
  (`skipSelf`, `mergeGanttConfig`); `global-config.ts` is a leaf module so `provide.ts` stays off the services'
  import path. `GanttBarRegistry` is provided by the canvas (one per chart): built-in bars, then the
  `GANTT_BAR_SCOPE` chain from the outermost level to the innermost; unknown types fall back to `task`.

## Parity with the Web Component

- Same option names, CSS classes, DOM structure and behaviour as `<gantry-element>`: panes `.gantry-panel`,
  `.gantry-canvas-viewport`, `.gantry-canvas-header-sticky`; `.gantry-splitter` > `.gantry-splitter-handle`
  (`role=separator`) + `.gantry-splitter-toggle`; `g.gantt-bars-layer > g[data-task-id]`; the `gantt-tl-*`
  task-list spans; `div.gantt-tooltip` with `dl.gantt-tooltip-rows`; `.gantt-sr-live` / `.gantt-sr-alert`. When
  you change one painter, change the other (the `gantry-reviewer` agent checks this).
- `e2e/paint.spec.ts` compares the colours both bindings paint. Its keys are the first non-`ng-` class plus the
  sibling index: adding a class to a class-less element, reordering children or adding a wrapper changes keys.
- Accessibility follows the WC's model: the host is `role=region` with `aria-label` (`labels.ariaChart`) and no
  `tabindex`; tab stops toolbar → sortable headers → one task-list row (roving `tabindex`, `data-focus-key`) →
  splitter handle → toggle → timeline viewport (`role=group`, `tabindex=0`); `focusin` writes
  `layout.focusedRowId` (pinned in the window); announcements go through `GanttAnnouncer` (core announce helpers).
- Light DOM: SVG `id`s must be unique per instance (use the canvas `uid`).

## Public API

- `src/public-api.ts` has explicit named exports only, plus `@gantry/core` re-exported as a whole; never a local
  `export *` (the d.ts bundle would get `*_d_exports` namespaces that break api-extractor). Services and inner
  components stay internal.
- The API report `packages/angular/etc/ngx-gantry.api.md` must match: `pnpm build:lib && pnpm api:angular` updates
  it, CI runs `pnpm api:angular:check`. Removing or renaming a public input, output, method or export is a breaking
  change: `ngx-gantry: major` changeset (deprecate first outside a major).

## Verify

- `pnpm --filter @gantry/core build && pnpm build:lib`, then `pnpm build:app`.
- Unit tests: `packages/angular/src/**/*.spec.ts`, run with `pnpm test:angular` (`@angular/build:unit-test`,
  Vitest + happy-dom, specs share one environment). `src/test/dom-shims.ts` (ResizeObserver,
  IntersectionObserver, scrollTo stubs) is loaded by the `setupFiles` of `angular.json`: specs must not import it.
  Provide `provideZonelessChangeDetection()`; await `fixture.whenStable()` instead of `detectChanges()`. Put new
  tests in new spec files.
