---
paths:
  - 'packages/core/**'
---

# @gantry/core rules

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
  (range, delimiters, bands, row geometry), `bars.ts`, `arrows.ts`, `drag.ts`, `theme.ts`.
- New theme key: add it to `GanttTheme`, both palettes in `render/theme.ts`, `THEME_CSS_VARS`,
  the README theming tables, and the `@cssprop` list of `<gantry-element>` (then
  `pnpm --filter @gantry/vanilla cem`).
- Dates: x positions via `calendarDays` / `dateToPixel` / `toX`; date-only UTC values are local
  days (`toLocalDay`); `addDays` keeps date-only values date-only. Normalise user dates once at
  the input boundary; dates core generates itself (scale cells, bands, `now`) are already local
  and go through `calendarDays(d, false)`. Format with `formatDate` (`src/format/`, `Intl`-based,
  dayjs-compatible tokens): core has no runtime dependencies.
- Export new public symbols from `src/index.ts`; sample data stays in the `@gantry/core/demo` subpath.
- Tests live in `src/__tests__/`. Build expected dates with `new Date(y, m, d)` so assertions
  hold in any time zone, and run `pnpm test:tz` for date or scale changes.
