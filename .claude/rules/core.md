---
paths:
  - 'packages/core/**'
---

# @gantry/core rules

- Framework-free and DOM-free: no imports from `@angular/*`, `react`, `vue`, `svelte`; no
  `document` / `window`. It must run in Node, workers and SSR.
- Pure and deterministic: anything time-dependent takes `now` as input (see `buildTimeline`).
- A new option needs three things here: its type in `src/types.ts` (with a JSDoc default),
  its default in `src/render/config.ts` → `resolveConfig()` (and the `ResolvedGanttConfig`
  shape), and the code that reads the resolved value. Bindings never read raw `GanttOptions`
  for rendering.
- Geometry goes in `src/render/`: `scales.ts` (tiers, formats, zoom presets), `timeline.ts`
  (range, delimiters, bands, row geometry), `bars.ts`, `arrows.ts`, `drag.ts`, `theme.ts`.
- New theme key: add it to `GanttTheme`, both palettes in `render/theme.ts`, `THEME_CSS_VARS`,
  and the README theming table.
- Dates: x positions via `calendarDays` / `dateToPixel` / `toX`; date-only UTC values are local
  days (`toLocalDay`); `addDays` keeps date-only values date-only. dayjs plugin imports keep
  the `.js` extension (plain Node ESM needs it).
- Export new public symbols from `src/index.ts`; sample data stays in the `@gantry/core/demo` subpath.
- Tests live in `src/__tests__/`. Build expected dates with `new Date(y, m, d)` so assertions
  hold in any time zone, and run `pnpm test:tz` for date or scale changes.
