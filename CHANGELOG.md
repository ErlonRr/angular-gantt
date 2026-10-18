# Changelog

All notable changes to **Gantry** (`ngx-gantry`) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Multi-framework packages**: `@gantryjs/core` (framework-free logic), `@gantryjs/vanilla` (`<gantry-element>` Web Component), and `@gantryjs/react`, `@gantryjs/vue`, `@gantryjs/svelte` bindings, each with a demo app under `apps/`.
- **Column sorting** (`ngx-gantry` and the Web Component): built-in columns are sortable; clicking a header cycles ascending → descending → original order.
- Release tooling with Changesets, CI workflow, and Web Component tests (happy-dom).

- **Configurable timeline**: N-tier header `scales` (`unit`, `step`, `format`, `className`), named `zoomLevels`, a new **Hour** view, `weekStart`, week label presets (`WEEK_FORMATS`: `W52`, `Week 52`, `4–11`, `4–11 Mar`), sticky upper-tier labels and `fitToWidth`.
- **Period delimiters**: `gridLines.major / minor / horizontal` (colour, width, dash) drawn through header and body — month boundaries now show in Week view too.
- **Non-working time**: `nonWorkingTime` (weekends, holidays, working hours per weekday, intensive hours; shade / hatch / disabled styles) and a `highlightTime` callback.
- **Element styling**: `bar` (height in px or % of the row, radius, progress, label position & template), `milestone` (size, diamond / circle / square), `groupBar` (summary or bar), `arrows` (width, head, rounded corners), per-task `progressColor` / `textColor` / `className`.
- **Task list panel**: `panel` (width in px or %, default 30%; min/max; resizable splitter; collapse toggle that restores the last width), horizontal scroll when columns overflow, a flexible fill column, resizable columns in every binding, `align` and `tableOnly` columns.
- **Views**: `view: 'split' | 'table' | 'chart'` with an animated table view and a toolbar switch; `options.toolbar` configures every toolbar part.
- **State**: `stateKey` (localStorage), `state-change` / `stateChange` event, `getState()` / `setState()`.
- Options playground in `apps/demo-vanilla`.
- **Demo site**: the Angular showcase is now the Gantry site — Home, Playground (every option, code in each framework's syntax, shareable `?setup=` links), Examples, Theming (presets and contrast check), Frameworks and an API reference generated from the Custom Elements Manifest — with its own look (amber accent of the today line, light and dark). The Web Component playground and the React, Vue and Svelte demos share it through the private `apps/demo-kit` package.
- **Split panel vs table view**: the panel next to the timeline is lean (`name`, `start`, `end`, `progress`) and the table view shows every useful field — type, a derived **status** (not started / in progress / overdue / done, with a coloured dot), duration, predecessors, and baseline start/end/variance when `baseline` is on. Choose them by key with `panel.columns` / `table.columns` (built-in keys need no `ColumnDef`), per view with `setColumnVisible(key, visible, view)`. Sorting reorders siblings at every tree level with a numeric collator; custom columns get `sortValue` and a `ColumnContext` (`render(row, ctx)`). New theme keys `statusNotStarted` · `statusInProgress` · `statusOverdue` · `statusDone`, new labels, `GanttTask.status`.
- **Demo data around today**: `createDemoData()` and `anchorToToday(template, { now, at })` in `@gantryjs/core/demo` move a plan by whole weeks so today sits inside it (about 40% in by default). Every demo (playground, React, Vue, Svelte, Angular showcase) now uses them, so the today marker is always inside the plan.
- **`initialScroll`**: `'auto'` (default) centres today only when it is near the tasks, otherwise shows the earliest task, so the first view is no longer empty for past or future projects; also `'today'`, `'start'`, a `Date` or `false`. `TimelineModel.extent` and the `initialScrollLeft()` / `zoomAnchorScroll()` helpers are exported from `@gantryjs/core`.

- **Shared interaction and state logic in `@gantryjs/core`** (both renderers use it instead of their own copies): virtual rows with pinned rows, horizontal windowing helpers, the selection reducer, view / panel-width resolution, versioned state persistence, tooltip and legend models, the keyboard map, grid navigation, keyboard move/resize sessions, accessible task names and screen-reader announcements — all translatable through `GanttLabels`.
- Date formats support `Do` (`'MMM Do'` → `Mar 1st`) and every `Intl` locale; new `dateNames()`, `isoWeek()`, `quarterOf()` helpers.

### Changed
- The framework-free packages are published under the **`@gantryjs`** npm scope (`@gantryjs/core`, `@gantryjs/vanilla`, `@gantryjs/react`, `@gantryjs/vue`, `@gantryjs/svelte`); `ngx-gantry` keeps its name. The repository moved to [github.com/ErlonRr/gantryjs](https://github.com/ErlonRr/gantryjs) (old links redirect).
- `ViewMode`, `DependencyType` and `TaskType` are `as const` objects with a same-name union type instead of TypeScript enums: `ViewMode.Week` reads the same and plain strings such as `'Week'` are accepted. Optional properties of the public types accept `undefined` explicitly (friendly to `exactOptionalPropertyTypes`).
- `ngx-gantry`'s package declares `"type": "module"` (types were ambiguous for ESM resolvers).
- Task-list rows can be focused and selected with Enter / Space in both renderers.
- `ngx-gantry` now imports its types, timeline math, tree helpers and critical path from `@gantryjs/core` (no public API change).
- Angular and the Web Component render from the same `@gantryjs/core` model (`resolveConfig`, `buildTimeline`, `computeBarVisual`, `computeArrowVisual`, `DragSession`), so every option behaves identically. Custom bar components receive the computed geometry in `ctx.visual`.
- Defaults: panel width `'30%'` (was 320px), bars `60%` of the row height, summary-style group bars, weekend shading in Day / Week views.
- **Angular 22** and **TypeScript 6.0**: `ngx-gantry` now requires `@angular/core` / `@angular/common` `^22.0.0` (Node `^22.12` or `>=24`). Dropped unused `@angular/animations`, `@angular/forms`, `zone.js` and the `dayjs` dependency of `ngx-gantry`. Tooling on Vite 8 (Rolldown), Vitest 5, `vite-plugin-dts` 5 with API Extractor, ESLint 10, Changesets 3; `ngx-gantry` gets its own unit tests (`ng test`, Vitest + happy-dom, zoneless TestBed); CI runs on Node 22 and 24.
- Development: ESLint (type-checked TypeScript, Angular templates with accessibility rules, Svelte, Vue, React hooks, and the core purity rules) and Prettier on the whole repository; one strict `tsconfig.base.json` for every package (`verbatimModuleSyntax`, `erasableSyntaxOnly`, and in the libraries `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`); `@gantryjs/core` compiles without DOM types; Angular builds with `strictTemplates`, `typeCheckHostBindings` and extended diagnostics as errors; pnpm catalogs for shared tool versions; Renovate; CI lint, format, time-zone tests and publint for `ngx-gantry`.
- Development: the repository uses one layout for every package — the Angular library moved from `projects/gantry` to `packages/angular` (still published as `ngx-gantry` from `dist/ngx-gantry`) and the Angular showcase from `projects/gantry-demo` to `apps/demo-angular`, which now owns the Angular runtime dependencies the workspace root used to declare.
- Development: Storybook removed (the showcase and the playground are the live demos); the Angular library and showcase build with `@angular/build` (no webpack left in the toolchain); browser QA is a Playwright suite (`pnpm e2e`, frozen clock, every binding) that also runs in CI.
- **Accessible default palette** (WCAG 2.2 AA): bars, arrows and selection `#2563EB`, critical `#DC2626`, today marker `#B45309`, darker muted text and baselines. The 1.x colours remain available as `LegacyLightTheme` / `LegacyDarkTheme`. Labels inside bars switch to a readable colour on custom `barColor`s (new `contrastRatio()` / `readableOn()` in `@gantryjs/core`).
- **Zero runtime dependencies**: `dayjs` is gone. Dates use a built-in `Intl` formatter with dayjs-compatible tokens; `locale` is any BCP 47 tag (no locale import), default `'en'` (the dayjs global locale is no longer read). A few CLDR abbreviations differ from dayjs's locale files (German `Mär`, Spanish `sept`).
- State saved with `stateKey` is versioned (`{"v":2,…}`), validated on load, and v1 snapshots are migrated.
- Bars' accessible names include the type, the dates (with times on hour scales) and the critical state; the tooltip and the legend come from shared core models (the legend can list critical path and baseline).
- Keyboard: `Ctrl/⌘+Shift+A` also selects all, shortcuts no longer fire with `Alt` / `AltGr`, and keys the chart doesn't handle keep their browser default; clearing an empty selection no longer emits `selectionChange`.
- Removed legacy helpers `PX_PER_DAY`, `HEADER_HEIGHTS`, `getTimelineRange`, `generateHeaderRows`, `generateGridLines`, `zoomIn`, `zoomOut`; `DragPreview` is `{ delta, unit }`; `GanttBarContext` fields are required; `criticalIds` is read-only.
- **Theming through CSS variables**: every colour of the render model is a `Paint` (a `var(--gantt-*)` token or an explicit colour) that both renderers apply as a CSS property; bar labels on theme fills use the new contrast tokens `--gantt-bar-text-on-{bar,milestone,critical}`; `resolveConfig(options, i18n, themeMetrics(theme))` takes only the theme metrics (no `cfg.theme`, no resolved colours), and `resolvePaint(paint, theme)` turns a paint into a concrete colour for custom renderers.
- **Web Component accessibility** (breaking for `@gantryjs/vanilla`): the host is no longer a tab stop and has no `data-theme` — it is a `region` named by `labels.ariaChart` through `ElementInternals` (host `role` / `aria-label` attributes where unsupported) with the custom states `:state(dark)`, `:state(dragging)` and `:state(loading)`; focus is delegated to internal tab stops (toolbar → one task-list row → splitter → timeline viewport, each with a focus ring), the splitter's `role="separator"` moved to `.gantry-splitter-handle` (with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, the panel width in px and its range) beside the collapse toggle, a polite `.gantt-sr-live` region announces selection-count and data-source load changes, and focus falls back to the timeline viewport when its control disappears. New labels `ariaToolbar` (also names the Angular toolbar) and `announceLoaded`.
- **One drag ghost for both renderers**: the dashed preview at 35 % opacity with a translatable movement label (`labels.dragDelta`, `+3d` / `-2h`) is computed by `@gantryjs/core` (`computeDragGhostVisual`); the Web Component adopts Angular's look. `isToday` annotations use the today colour in both renderers and in the legend.
- **Framework wrappers** (`@gantryjs/react`, `@gantryjs/vue`, `@gantryjs/svelte`; breaking for all three — see below): listeners are attached before the first property, so events fired while the chart applies its props (`viewModeChange`, `loadError`) reach your callbacks; the chart's first frame already shows your props (no flash of the defaults); a prop set back to `undefined` restores the element default; objects reach the element without cloning (Vue unwraps them with `toRaw`; Svelte copies arrays and plain objects one level instead of `$state.snapshot`, so in-place edits inside an item need a replaced item or `$state.raw`); server rendering is tested in all three. React: `className` now applies on React 18. Vue: the template ref exposes only `element`.
- **Web Component engine** (breaking for `@gantryjs/vanilla`): `<gantry-element>` renders from a reactive graph, once per frame and region by region (keyed DOM nodes; header cells, bands and grid lines mounted only around the viewport), works under a strict CSP and Trusted Types (constructable stylesheets, no inline styles or HTML parsing), applies properties set before it was defined, treats `undefined` as the default, and releases every listener, observer and timer when it disconnects. Its exports are curated to `GantryElement`, `GanttDataSource`, `GANTRY_PROPERTIES` / `GANTRY_EVENTS` and their types plus `@gantryjs/core`: the internal services and fields (`themeSvc`, `layout`, …), `createState`, `paintBar` and the low-level components are gone. New `resetTheme()`. Ships a Custom Elements Manifest (`custom-elements.json`, `customElements` in `package.json`).
- **Readable current-period header label and themable progress overlay**: new derived token `--gantt-today-label` (`todayLabelColor(theme)`, `readableOnTint()`; light theme `#B45309` → `#964B13`, 3.97:1 → 5.01:1 on the today tint) used by the Web Component's header, and theme key `progressOverlay` (`--gantt-progress-overlay`, `#000000`) instead of the literal progress fill — `themeToCss()` writes 42 custom properties. Helpers both renderers share moved into `@gantryjs/core`: `columnsGridTemplate`, `sameVirtualWindow`, `HORIZONTAL_WINDOW_QUANTUM`, `announceLoadState`, `TOOLTIP_SHOW_DELAY` / `TOOLTIP_HIDE_DELAY`, `seedCollapsed`, `clampColumnWidth` (`COLUMN_MIN_WIDTH` / `COLUMN_MAX_WIDTH`), `VIRTUAL_OVERSCAN_ROWS`, `panelWidthRange`, `splitterValue`, `SPLITTER_KEY_STEP`, `SPLITTER_TOGGLE_OFFSET`, `STATE_SAVE_DELAY`, `CLOCK_INTERVAL`.
- **One task-list markup for both renderers**: classed inner spans (`gantt-tl-name`, `gantt-tl-indent`, `gantt-tl-icon`, `gantt-tl-ellipsis`, `gantt-tl-sort-icon` / `--active`) with text colours as stylesheet rules (only a task's `barColor` stays inline), cell texts in the secondary text colour and 24 × 24 px collapse toggles in the Web Component too, a column resize handle fully inside its header cell, and Angular's toolbar slot group classed `gantt-tb-slot gantt-tb-group`.
- **`ngx-gantry` 2.0** (breaking): `<gantry>` renders the Web Component's DOM, classes, windows and accessibility model, on Angular's signal APIs. Optional `provideGantt(config, withBars(…))` / `provideGanttBar(…)` at application, route or component level (`GanttModule`, `forRoot()`, `provideGanttLib()` removed); custom bars extend the `GanttBarBase` directive (it declares `ctx`); `[(viewMode)]` model; boolean attribute inputs; `darkMode` defaults to `undefined` so `provideGantt({ darkMode })` applies; theme tokens as a host `[style]` binding with the classes `gantry-dark` / `gantry-dragging` / `gantry-loading` (no `data-theme`); a `region` host with internal tab stops (no `tabindex`) and `.gantt-sr-live` / `.gantt-sr-alert` live regions; one `<dl>` tooltip per chart inside `<gantry>`; panes `.gantry-panel` / `.gantry-canvas-viewport` / `.gantry-canvas-header-sticky`; header, bands and grid lines windowed horizontally; SSR-safe; new `view`, `resetTheme()` and `getBarVisual()`; a curated public API (the services and inner components are internal); `task.collapsed` seeds only never-seen ids and a pending `stateKey` save is written on destroy, as in `<gantry-element>`.

### Fixed
- `ngx-gantry`: header cells and non-working bands are tracked by position (like the Web Component's keyed layers) and grid lines by index, so a rebuilt timeline patches them in place; development builds no longer warn with NG0956.
- Bars misaligned with day cells outside UTC (`new Date('YYYY-MM-DD')` is now read as a local day) and after daylight-saving changes; `diffDays` off by one across DST.
- `headerHeight` / `subHeaderHeight` ignored by the timeline header (task list and timeline rows out of line).
- Angular task-list rows 1px taller than timeline rows (missing `box-sizing`); last rows misaligned by the horizontal scrollbar; scroll sync lost after toggling the panel; column directive effect re-running itself.
- Header labels overflowing narrow cells; doubled cell borders; current-period highlight on clipped cells; invalid tint with non-hex `todayColor`; "today" going stale after midnight.
- `barRadius` and `criticalColor` ignored by several shapes / arrows; arrows cutting through bars when the successor starts early; arrows ending inside milestones; labels spilling out of bars; double selection tint.
- Dead options now work: `enableSelection`, `multiSelect`, `enableDrag` / `enableResize` in `options`, `task.collapsed`, `options.columns` / `theme` / `darkMode` in Angular; `timelinePadding` in every view; `options` no longer resets `patchTheme()` overrides.
- `rowClick` now always emits a `RowGeometry` (the task list previously emitted a flat row); `rowDblClick` is typed `GanttFlatRow`.
- Tasks with `parentId: null`, an empty or unknown parent, or a parent cycle no longer disappear; a task without `end` is drawn at its start instead of breaking the date columns. The repair is exported as `normalizeTasks()` from `@gantryjs/core`.
- The critical path reads task dates like the bars do: with `endDateMode: 'inclusive'` the last day counts, and hour-level tasks use fractional days (`computeCriticalPath(tasks, { endDateMode, normalizeDateOnly })`).
- Sorting by a column no longer slows down quadratically with the number of rows.
- Angular: bars kept their old position after collapsing, expanding or sorting rows; `selectionChange` was only emitted after a first click on the timeline (task-list, keyboard and API selections were lost); Ctrl/Cmd+A cleared the selection instead of selecting every visible row and ignored `enableSelection` / `multiSelect`; `T` scrolled with outdated math.
- Web Component: toolbar buttons, sortable headers and collapse toggles keep keyboard focus across re-renders; non-working bands and period delimiters are no longer rebuilt on every scroll frame (both renderers now draw them full height); a pending state save is written when the element is removed, and a data source is detached while disconnected and re-synced on reconnect.
- Table view: the hidden timeline is `inert` (out of the tab order and the accessibility tree) and the floating legend hides; column headers show their full label as a tooltip; tooltips compute the duration from the drawn span like the Duration column.
- Keyboard shortcuts no longer fire while typing in inputs, `contenteditable` cells or on the splitter (Angular and Web Component).
- **Data sources** (Angular and Web Component share one loader in `@gantryjs/core`, `PagedLoader`): a failed page is retried automatically (`retries`, `retryDelay`), then shows an error with a **Retry** button (announced once to screen readers; focus stays in the footer) and emits `loadError` / `load-error` instead of re-requesting on every scroll frame; `reset()` replaces the loaded pages instead of appending page 1 again; `initialPage: 0` waits for `loadNext()` (it used to block loading for good); Angular's data source no longer throws when a fetch fails or when created outside an injection context. New labels `loadError` and `retry`.
- Zooming keeps the date at the centre of the viewport in place (it used to keep the pixel offset, jumping to another period); extending the range to earlier dates no longer shifts the view. Smooth scrolling honours `prefers-reduced-motion`.
- Hour view: header cells overlapped or went out of order in time zones away from UTC (an hour boundary on UTC midnight was read as a date-only value).
- Hour view: after a 30-minute daylight-saving change (Lord Howe) every later hour cell started at :30.

## [1.0.1] — 2026-08-08

### Fixed
- **Scroll Tearing & Ping-Pong**: Resolved visual bar duplication during vertical scrolling by replacing fragile microtask lock with a robust scroll-source timeout lock.
- **Vertical Scroll Alignment**: Synchronized task list and SVG canvas vertical scroll positions 1:1 without header height distortion.
- **Today Marker**: Removed top vertical line from header to avoid obscuring date labels, and updated positioning to reflect exact time-of-day.
- **Hit Testing**: Fixed `_geoFromPoint` pointer event row lookup for virtual scrolled rows.
- **Group Bar Defaults**: Ensured `TaskType.Group` resolves to `'group'` bar type by default.

## [1.0.0] — 2026-07-25

First public release.

### Added
- **`<gantry>` component** — root Gantt chart, standalone, `OnPush`, zoneless & signal-based (no RxJS, no `zone.js` required).
- **Task tree** with groups, milestones, collapse/expand, and per-row styling.
- **Dependencies** with all four types (`FS` / `FF` / `SS` / `SF`) and lag, plus a full **Critical Path** computation.
- **Baselines** for planned-vs-actual variance.
- **Drag & resize** of bars via Pointer Events (bar move + edge resize), with per-task `draggable` opt-out.
- **Selection** — single, Ctrl/Cmd-click toggle, Shift-click range, and keyboard (`Esc`, `Ctrl/Cmd+A`, `+/-`, `T`).
- **Tooltip** via the native Popover API (no CDK overlay).
- **Custom bars** through a pluggable `GanttBarRegistry` (`provideGanttBar`).
- **Custom left-panel columns** via the `columns` input or the declarative `<ng-template ganttColumn>` API (rich cell templates, resizable columns, resizable panel).
- **Lazy loading** with `createGanttDataSource` (`resource()` + `linkedSignal`) and an auto/manual "load more" trigger.
- **Timeline views** — Day / Week / Month / Quarter / Year with zoom.
- **Annotations** (vertical lines & shaded regions) and a **today marker**.
- **Legend** overlay (`showLegend`) describing the today line and annotations.
- **Theming** — light / dark / auto via CSS custom properties, live-patchable at runtime.
- **Internationalisation** — every UI string is overridable via `options.labels`
  (or `provideGanttLib({ labels })`), month/day names follow a dayjs `locale`, and
  dates/header labels accept custom `formats` (`dateFormat`, per-view `header`).
- Public math/data/CPM core is framework-free and unit-tested with Vitest.

### Fixed
- Header period labels no longer render as clipped "slivers" at the timeline edges
  in Month/Quarter/Year: sub-period padding is applied only in Day/Week views, so
  coarse views snap to whole periods.
- Virtual scroll no longer under-renders the last rows when the canvas height
  settles after the initial layout — a `ResizeObserver` recomputes the visible
  window, so dependency arrows always connect to real rows (no arrows drawn into
  empty space below the list).

### Dependencies
- Runtime: `dayjs` only. Peer: `@angular/core` & `@angular/common` `>=20.2.0`.

[1.0.1]: https://github.com/ErlonRr/gantryjs/releases/tag/v1.0.1
[1.0.0]: https://github.com/ErlonRr/gantryjs/releases/tag/v1.0.0
