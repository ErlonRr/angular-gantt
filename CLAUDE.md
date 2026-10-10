# Gantry

Free, MIT-licensed Gantt chart for every framework, published on npm. Goal: the most
configurable open-source Gantt — every option behaves identically in every binding.

```
@gantry/core        types · render model · timeline math · CPM          packages/core
 ├── ngx-gantry      native Angular 20 (zoneless, signals, OnPush)       projects/gantry
 └── @gantry/vanilla <gantry-element> Web Component (shadow DOM)         packages/vanilla
      ├── @gantry/react   React 18/19 wrapper                            packages/react
      ├── @gantry/vue     Vue 3.5 render-function wrapper                packages/vue
      └── @gantry/svelte  Svelte 5 runes wrapper                         packages/svelte
apps/demo-*  Vite demos (demo-vanilla = options playground) · projects/gantry-demo  Angular showcase
```

## Architecture (read before changing rendering)

All geometry and every default live in `packages/core/src/render/`:
`resolveConfig()` (the only place options get defaults) → `buildTimeline()` (range, header
tiers, period delimiters, non-working bands, today) → `computeRowGeometries()` →
`computeBarVisual()` / `computeArrowVisual()`; drag/resize math in `DragSession`.
Angular (`projects/gantry/src/lib`) and the Web Component (`packages/vanilla/src`) only
**paint** that model. If two bindings disagree, the bug is in the one that computes instead of painting.

## Commands

pnpm 10.33 workspace. If `pnpm` fails (unconfigured mise shim) use `npx -y pnpm@10.33.0 <cmd>`.

| Task                                                                                | Command                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Unit tests (core in Node + Web Component in happy-dom, ~3 s)                        | `pnpm test` · one project: `npx vitest run --project core`                               |
| Date code in other time zones                                                       | `pnpm test:tz`                                                                           |
| Typecheck all packages                                                              | `pnpm typecheck`                                                                         |
| Build everything (packages → ngx-gantry → showcase → demos)                         | `pnpm build`                                                                             |
| Angular library only (needs `@gantry/core` built)                                   | `pnpm --filter @gantry/core build && pnpm build:lib`                                     |
| Dev servers                                                                         | `pnpm dev:angular` · `dev:vanilla` (playground) · `dev:react` · `dev:vue` · `dev:svelte` |
| Browser QA, Playwright (alignment, drag, panel, table view, parity, console errors) | `pnpm build && pnpm e2e` (`-g vanilla` to filter) — or `/gantry-visual-qa`               |
| Screenshot baselines (Playwright container = CI pixels)                             | `pnpm e2e:visual` to compare · `pnpm e2e:update` to regenerate                           |
| Release notes for a change                                                          | `pnpm changeset`                                                                         |

Iterate with `pnpm test` + `pnpm typecheck`; run `pnpm build` and the browser QA before
calling UI work done.

## Rules

- **Never** run `git commit`, `git push`, `git tag` or any publish command unless the user
  explicitly asks in this turn. Commits are one-line Conventional Commits:
  `feat(core): …`, `fix(vanilla): …`, `fix(gantry): …` (Angular), `docs: …`, `chore(release): …`.
- New or changed option / visual feature → follow the `/gantry-feature` skill (core model →
  both painters → bindings → tests → playground → docs → changeset). No option may be honoured
  by one binding and ignored by another.
- Never compute positions, sizes or defaults in a painter; add them to `packages/core/src/render`.
- Dates: the x axis is local calendar days. Use `calendarDays` / `dateToPixel` / `timeline.toX`,
  `addDays` (keeps date-only values date-only) and `toLocalDay`; never `ms / 86_400_000` for
  positions. Date code needs tests that pass under `pnpm test:tz`.
- Public API changes need a changeset with the right bump (`major` for breaking changes) and
  an update to the README "Configuration" section.
- Accessibility is part of done: roles, `aria-*`, keyboard paths and focus styles for anything interactive.
- Loop breaker: if a build or test fails twice with the same error, stop and report instead of retrying.

## Gotchas

- Web Component: no attributes/styles in the constructor (`document.createElement` throws) —
  do it in `connectedCallback`; module top level must stay SSR-safe (guard `document`/`HTMLElement`).
- Angular renders in the light DOM: SVG `id`s must be unique per instance (use the canvas `uid`).
- Workspace packages export a `@gantry/source` condition; demos, tests and typecheck read the
  TypeScript sources. Published packages are ESM-only with bundled `.d.ts`.
- `ngx-gantry` publishes from `dist/ngx-gantry` (`publishConfig.directory`);
  `scripts/resolve-workspace-deps.mjs` rewrites `workspace:` ranges after `ng build`.
- Node ≥ 22 shadows happy-dom's `localStorage` in tests — the element tests polyfill it.
- Visual verification needs a browser: the Playwright suite uses its bundled Chromium (install it
  once with `npx playwright install chromium`); `pnpm e2e:update` runs in the Playwright container CI uses.
