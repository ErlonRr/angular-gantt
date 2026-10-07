# Changelog

All notable changes to **Gantry** (`ngx-gantry`) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Multi-framework packages**: `@gantry/core` (framework-free logic), `@gantry/vanilla` (`<gantry-element>` Web Component), and `@gantry/react`, `@gantry/vue`, `@gantry/svelte` bindings, each with a demo app under `apps/`.
- **Column sorting** (`ngx-gantry` and the Web Component): built-in columns are sortable; clicking a header cycles ascending → descending → original order.
- Release tooling with Changesets, CI workflow, and Web Component tests (happy-dom).

### Changed
- `ngx-gantry` now imports its types, timeline math, tree helpers and critical path from `@gantry/core` (no public API change).
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
