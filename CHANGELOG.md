# Changelog

All notable changes to **Gantry** (`ngx-gantry`) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Multi-framework packages**: `@gantry/core` (framework-free logic), `@gantry/vanilla` (`<gantry-element>` Web Component), and `@gantry/react`, `@gantry/vue`, `@gantry/svelte` bindings, each with a demo app under `apps/`.
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
- **Split panel vs table view**: the panel next to the timeline is lean (`name`, `start`, `end`, `progress`) and the table view shows every useful field — type, a derived **status** (not started / in progress / overdue / done, with a coloured dot), duration, predecessors, and baseline start/end/variance when `baseline` is on. Choose them by key with `panel.columns` / `table.columns` (built-in keys need no `ColumnDef`), per view with `setColumnVisible(key, visible, view)`. Sorting reorders siblings at every tree level with a numeric collator; custom columns get `sortValue` and a `ColumnContext` (`render(row, ctx)`). New theme keys `statusNotStarted` · `statusInProgress` · `statusOverdue` · `statusDone`, new labels, `GanttTask.status`.
- **Demo data around today**: `createDemoData()` and `anchorToToday(template, { now, at })` in `@gantry/core/demo` move a plan by whole weeks so today sits inside it (about 40% in by default). Every demo (playground, React, Vue, Svelte, Angular showcase) now uses them, so the today marker is always inside the plan.
- **`initialScroll`**: `'auto'` (default) centres today only when it is near the tasks, otherwise shows the earliest task, so the first view is no longer empty for past or future projects; also `'today'`, `'start'`, a `Date` or `false`. `TimelineModel.extent` and the `initialScrollLeft()` / `zoomAnchorScroll()` helpers are exported from `@gantry/core`.

### Changed
- `ngx-gantry` now imports its types, timeline math, tree helpers and critical path from `@gantry/core` (no public API change).
- Angular and the Web Component render from the same `@gantry/core` model (`resolveConfig`, `buildTimeline`, `computeBarVisual`, `computeArrowVisual`, `DragSession`), so every option behaves identically. Custom bar components receive the computed geometry in `ctx.visual`.
- Defaults: panel width `'30%'` (was 320px), bars `60%` of the row height, summary-style group bars, weekend shading in Day / Week views.
- Low-level Angular building blocks changed inputs: `GanttHeaderComponent` / `GanttCanvasComponent` take `[timeline]` + `[config]`, `GanttArrowComponent` takes `[arrow]` (an `ArrowVisual`), the task-list panel resize handle moved to the splitter.
- Development: Storybook removed (the showcase and the playground are the live demos); the Angular library and showcase build with `@angular/build` (no webpack left in the toolchain); browser QA is a Playwright suite (`pnpm e2e`, frozen clock, every binding) that also runs in CI.
- **Accessible default palette** (WCAG 2.2 AA): bars, arrows and selection `#2563EB`, critical `#DC2626`, today marker `#B45309`, darker muted text and baselines. The 1.x colours remain available as `LegacyLightTheme` / `LegacyDarkTheme`. Labels inside bars switch to a readable colour on custom `barColor`s (new `contrastRatio()` / `readableOn()` in `@gantry/core`).

### Fixed
- Bars misaligned with day cells outside UTC (`new Date('YYYY-MM-DD')` is now read as a local day) and after daylight-saving changes; `diffDays` off by one across DST.
- `headerHeight` / `subHeaderHeight` ignored by the timeline header (task list and timeline rows out of line).
- Angular task-list rows 1px taller than timeline rows (missing `box-sizing`); last rows misaligned by the horizontal scrollbar; scroll sync lost after toggling the panel; column directive effect re-running itself.
- Header labels overflowing narrow cells; doubled cell borders; current-period highlight on clipped cells; invalid tint with non-hex `todayColor`; "today" going stale after midnight.
- `barRadius` and `criticalColor` ignored by several shapes / arrows; arrows cutting through bars when the successor starts early; arrows ending inside milestones; labels spilling out of bars; double selection tint.
- Dead options now work: `enableSelection`, `multiSelect`, `enableDrag` / `enableResize` in `options`, `task.collapsed`, `options.columns` / `theme` / `darkMode` in Angular; `timelinePadding` in every view; `options` no longer resets `patchTheme()` overrides.
- `rowClick` now always emits a `RowGeometry` (the task list previously emitted a flat row); `rowDblClick` is typed `GanttFlatRow`.
- Tasks with `parentId: null`, an empty or unknown parent, or a parent cycle no longer disappear; a task without `end` is drawn at its start instead of breaking the date columns. The repair is exported as `normalizeTasks()` from `@gantry/core`.
- The critical path reads task dates like the bars do: with `endDateMode: 'inclusive'` the last day counts, and hour-level tasks use fractional days (`computeCriticalPath(tasks, { endDateMode, normalizeDateOnly })`).
- Sorting by a column no longer slows down quadratically with the number of rows.
- Angular: bars kept their old position after collapsing, expanding or sorting rows; `selectionChange` was only emitted after a first click on the timeline (task-list, keyboard and API selections were lost); Ctrl/Cmd+A cleared the selection instead of selecting every visible row and ignored `enableSelection` / `multiSelect`; `T` scrolled with outdated math.
- Web Component: toolbar buttons, sortable headers and collapse toggles keep keyboard focus across re-renders; non-working bands and period delimiters are no longer rebuilt on every scroll frame (both renderers now draw them full height); a pending state save is written when the element is removed, and a data source is detached while disconnected and re-synced on reconnect.
- Table view: the hidden timeline is `inert` (out of the tab order and the accessibility tree) and the floating legend hides; column headers show their full label as a tooltip; tooltips compute the duration from the drawn span like the Duration column.
- Keyboard shortcuts no longer fire while typing in inputs, `contenteditable` cells or on the splitter (Angular and Web Component).
- **Data sources** (Angular and Web Component share one loader in `@gantry/core`, `PagedLoader`): a failed page is retried automatically (`retries`, `retryDelay`), then shows an error with a **Retry** button (announced once to screen readers; focus stays in the footer) and emits `loadError` / `load-error` instead of re-requesting on every scroll frame; `reset()` replaces the loaded pages instead of appending page 1 again; `initialPage: 0` waits for `loadNext()` (it used to block loading for good); Angular's data source no longer throws when a fetch fails or when created outside an injection context. New labels `loadError` and `retry`.
- Zooming keeps the date at the centre of the viewport in place (it used to keep the pixel offset, jumping to another period); extending the range to earlier dates no longer shifts the view. Smooth scrolling honours `prefers-reduced-motion`.

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

[1.0.1]: https://github.com/ErlonRr/angular-gantt/releases/tag/v1.0.1
[1.0.0]: https://github.com/ErlonRr/angular-gantt/releases/tag/v1.0.0
