---
paths:
  - 'packages/core/**'
---

# @gantryjs/core rules

- Framework-free and DOM-free: no imports from `@angular/*`, `react`, `vue`, `svelte`; no
  `document` / `window`. It must run in Node, workers and SSR. `pnpm lint` enforces this (and no
  argless `new Date()` outside default parameters, no `86400000`); core compiles with `lib: ES2022`
  only, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (optional fields are `?: T | undefined`).
- Pure and deterministic: anything time-dependent takes `now` as input (see `buildTimeline`).
- A new option needs three things here: its type in `src/types.ts` (with a JSDoc default),
  its default in `src/render/config.ts` → `resolveConfig()` (and the `ResolvedGanttConfig`
  shape), and the code that reads the resolved value. Bindings never read raw `GanttOptions`
  for rendering.
- Geometry goes in `src/render/`: `scales.ts` (tiers, formats, zoom presets), `timeline.ts`
  (range, delimiters, bands, row geometry), `bars.ts` (with handles, `focusRect`, `hitBox`,
  `hitTestBar`), `arrows.ts`, `drag.ts`, `markers.ts` (marker lane, annotations), `zoom.ts`,
  `viewport.ts`, `readout.ts`, `columns.ts`, `paint.ts`, `theme.ts`, `styles.ts` (the task-style
  resolver; `task-style.ts` is its import-cycle-free leaf), `layout-vars.ts` (the read-only layout
  CSS variables), `overlay.ts` (focus ring, grips, progress grip, link connectors), `links.ts`
  (link preview). Rollups (summary parents computed from their children) live in
  `src/gantt-rollup.ts`. `src/editing/` holds the change pipeline: `changes` (build, apply, invert,
  merge, `deriveOps`), `pipeline` (`prepareChange`), `validate`, `permissions` (`editRules`,
  `cellEditable`), `history`, `cells`, `parse`, `sessions`, `describe`. Every task change goes
  through `prepareChange`, so a binding never validates, derives events or words announcements
  itself; history takes the time as a parameter. UI state machines and models go
  in `src/state/` (`tooltip.ts`, `toolbar.ts`, `menu.ts`, `responsive.ts`, `sync.ts` (sync groups),
  `chart-state.ts`, `legend.ts`, `selection.ts`, …), input reducers in `src/interaction/`
  (`keymap.ts`, `grid-nav.ts`, `timeline-nav.ts`, `roving.ts`, `key-selection.ts`,
  `keyboard-edit.ts`, `gesture.ts`, `autoscroll.ts`, `announce.ts`, `scroll-sync.ts`).
- Task styles have one precedence, resolved only by `createStyleResolver`: theme < bar kind
  (`styles.task` / `group` / `milestone`) < `styles.parent` < `styles.levels[depth]` < rollup colour <
  `styles.rule(row, ctx)` < the deprecated flat fields (`barColor`, `rowColor`, `textColor`,
  `progressColor`, `className`) < `task.style`; `className` accumulates, the critical path still
  overrides the fill. `null` / `undefined` never override; bindings paint the resolved style and
  never read task colours themselves.
- Core owns no timers: a machine returns what to schedule (`reduceTooltip` → `timer` ms, the
  gesture machine → the long-press is the binding's timer) or takes them injected
  (`createAnnouncer(write, { set, clear })`). Numbers both bindings need (`DRAG_THRESHOLD_PX`,
  `LONG_PRESS_MS`, `MARKER_LANE_HEIGHT`, `ANNOUNCE_DEBOUNCE`, …) are exported constants.
- New theme key: add it to `GanttTheme`, both palettes (and the legacy ones) in `render/theme.ts`,
  `THEME_CSS_VARS` (the counts in `__tests__/theme-css.test.ts`), the README theming tables, and
  the `@cssprop` list of `<gantry-element>` (then `pnpm --filter @gantryjs/vanilla cem`).
- New label: `GanttLabels` + `DEFAULT_LABELS` (a required member: `options.labels` stays partial,
  but objects typed as a full `GanttLabels` need it — say so in the changeset).
- Dates: x positions via `calendarDays` / `dateToPixel` / `toX`; date-only UTC values are local
  days (`toLocalDay`); `addDays` keeps date-only values date-only. Normalise user dates once at
  the input boundary; dates core generates itself (scale cells, bands, `now`) are already local
  and go through `calendarDays(d, false)`. Format with `formatDate` (`src/format/`, `Intl`-based,
  dayjs-compatible tokens): core has no runtime dependencies.
- Export new public symbols from `src/index.ts`; sample data stays in the `@gantryjs/core/demo` subpath.
- Tests live in `src/__tests__/`. Build expected dates with `new Date(y, m, d)` so assertions
  hold in any time zone, and run `pnpm test:tz` for date or scale changes.
