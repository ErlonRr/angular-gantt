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

### Changed
- `ngx-gantry` now imports its types, timeline math, tree helpers and critical path from `@gantry/core` (no public API change).
- Angular and the Web Component render from the same `@gantry/core` model (`resolveConfig`, `buildTimeline`, `computeBarVisual`, `computeArrowVisual`, `DragSession`), so every option behaves identically. Custom bar components receive the computed geometry in `ctx.visual`.
- Defaults: panel width `'30%'` (was 320px), bars `60%` of the row height, summary-style group bars, weekend shading in Day / Week views.
- Low-level Angular building blocks changed inputs: `GanttHeaderComponent` / `GanttCanvasComponent` take `[timeline]` + `[config]`, `GanttArrowComponent` takes `[arrow]` (an `ArrowVisual`), the task-list panel resize handle moved to the splitter.

### Fixed
- Bars misaligned with day cells outside UTC (`new Date('YYYY-MM-DD')` is now read as a local day) and after daylight-saving changes; `diffDays` off by one across DST.
- `headerHeight` / `subHeaderHeight` ignored by the timeline header (task list and timeline rows out of line).
- Angular task-list rows 1px taller than timeline rows (missing `box-sizing`); last rows misaligned by the horizontal scrollbar; scroll sync lost after toggling the panel; column directive effect re-running itself.
- Header labels overflowing narrow cells; doubled cell borders; current-period highlight on clipped cells; invalid tint with non-hex `todayColor`; "today" going stale after midnight.
- `barRadius` and `criticalColor` ignored by several shapes / arrows; arrows cutting through bars when the successor starts early; arrows ending inside milestones; labels spilling out of bars; double selection tint.
- Dead options now work: `enableSelection`, `multiSelect`, `enableDrag` / `enableResize` in `options`, `task.collapsed`, `options.columns` / `theme` / `darkMode` in Angular; `timelinePadding` in every view; `options` no longer resets `patchTheme()` overrides.
- `rowClick` now always emits a `RowGeometry` (the task list previously emitted a flat row); `rowDblClick` is typed `GanttFlatRow`.

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
