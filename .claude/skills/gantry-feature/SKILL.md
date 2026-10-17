---
name: gantry-feature
description: Add or change a Gantry feature or configuration option end to end — core render model, Angular and Web Component painters, React/Vue/Svelte bindings, tests, playground, docs and changeset. Use when asked for a new option, a new visual capability, a rendering change, or to "make X configurable".
argument-hint: '[feature or option to add/change]'
---

# Add or change a Gantry feature

Request: $ARGUMENTS

Gantry's promise is that **one option behaves identically in every binding**. That holds only
if the value is resolved and the geometry computed once, in `@gantry/core`, and both renderers
just paint it. Work through the steps in order; skip a step only when it truly does not apply.

## 0. Design the API first (tell the user before coding)

- Name, type, default, and where it lives. Prefer an existing group — `bar`, `milestone`,
  `groupBar`, `arrows`, `gridLines`, `nonWorkingTime`, `panel`, `toolbar`, `scales` /
  `zoomLevels` — over a new top-level key. Per-task overrides go on `GanttTask`.
- Conventions: sizes are `GanttLength` (px or `'60%'`); colours come from theme keys
  (overridable per option); `false` disables a feature; defaults must not change existing
  output unless that is the point (then it's called out in the changeset).
- Breaking? (renamed/removed option, changed default output, changed public component input)
  → `major` bump for that package, or find a non-breaking shape.

## 1. Core (`packages/core/src`)

1. Type + JSDoc (with the default) in `types.ts`.
2. Default in `render/config.ts` → `resolveConfig()` and the `ResolvedGanttConfig` field.
3. Compute in `render/*`: put results on `TimelineModel`, `BarVisual` or `ArrowVisual` so
   painters only read them. Keep it pure (pass `now`, never read the DOM).
4. New theme key → `GanttTheme`, both palettes + `THEME_CSS_VARS` in `render/theme.ts`.
5. Tests in `__tests__/render.test.ts` (TZ-safe dates: `new Date(y, m, d)`).

## 2. Painters — change both, in the same session

- Web Component: `packages/vanilla/src/…` (canvas / header / tasklist / element).
- Angular: `packages/angular/src/lib/…` (canvas template / header / tasklist / gantry.component).
- Same CSS class names and DOM structure, so the QA script and user CSS work on both.
- New property or event → `packages/vanilla/src/types.ts` (`GantryProperties` +
  `GANTRY_PROPERTIES`, `GantryEventDetailMap` + `GANTRY_EVENTS`) **and** an Angular
  `input()` / `output()`; then add the name to the explicit destructure in
  `packages/svelte/src/Gantry.svelte` (React and Vue derive it automatically).
- Element test in `packages/vanilla/src/__tests__/gantry-element.test.ts` for any interaction.

File-by-file map: [parity-map.md](parity-map.md).

## 3. Show and document it

- Playground control: `apps/demo-kit/src/playground.ts` (`PLAYGROUND_DEFAULTS`, `PLAYGROUND_SECTIONS`,
  `playgroundOptions()`): the vanilla playground and the site's `/playground` both render it.
- Root `README.md` → "Configuration" (snippet + one-line explanation); theming table for new
  theme keys; package READMEs only when the element/binding API surface changes.
- `CHANGELOG.md` → `## [Unreleased]`; a `.changeset/*.md` with the right bumps.

## 4. Verify (in this order)

```bash
pnpm test && pnpm test:tz        # unit tests, date code in other time zones
pnpm typecheck                   # all packages (+ demos: pnpm --filter demo-<x> typecheck)
pnpm build                       # packages → ngx-gantry → showcase → demos
```

Then run the `/gantry-visual-qa` skill (or ask the `gantry-visual-qa` agent) on at least the
playground and the Angular showcase, and ask the `gantry-reviewer` agent to review the diff
for parity and invariants. Report what was verified and what was not.
