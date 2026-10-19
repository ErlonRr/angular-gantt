# Gantry

Free, MIT-licensed Gantt chart for every framework, published on npm. Goal: the most
configurable open-source Gantt — every option behaves identically in every binding.

```
@gantryjs/core              types · render model · timeline math · CPM     packages/core
 ├── @gantryjs/angular      native Angular 22 (zoneless, signals, OnPush)  packages/angular
 └── @gantryjs/vanilla      <gantry-element> Web Component (shadow DOM)    packages/vanilla
      ├── @gantryjs/react   React 18/19 wrapper                            packages/react
      ├── @gantryjs/vue     Vue 3.5 render-function wrapper                packages/vue
      └── @gantryjs/svelte  Svelte 5 runes wrapper                         packages/svelte
apps/demo-angular  the Gantry site (Angular) · apps/demo-*  Vite demos (demo-vanilla = options playground)
apps/demo-kit  the demos' shared look (site.css, gs- classes), theme switch, playground model, examples gallery
```

## Architecture (read before changing rendering)

All geometry and every default live in `packages/core/src/render/`:
`resolveConfig()` (the only place options get defaults) → `buildTimeline()` (range, header
tiers, period delimiters, non-working bands, today) → `computeRowGeometries()` →
`computeBarVisual()` / `computeArrowVisual()`; drag/resize math in `DragSession`.
Every edit — drag, resize, move mode, progress grip, cell, link, API, undo — is one `GanttChange` built and
checked in `packages/core/src/editing/` (`changes`, `pipeline` → `prepareChange`, `validate`, `permissions`
→ `editRules`, `history`, `cells`, `parse`, `sessions`); the bindings only run the pipeline
(`before-change` → apply → events) and paint it.
Exports (SVG, PNG, CSV, print) are re-rendered from the model in `packages/core/src/export/` (`createExportSource` →
`buildExportModel` → `exportChartSvg` / `exportChartCsv` / `exportChartPages`); the bindings only build the source from
their graph and run the DOM helpers (download, rasterize, print frame, serialize custom bars).
Angular (`packages/angular/src/lib`) and the Web Component (`packages/vanilla/src`) only
**paint** that model. If two bindings disagree, the bug is in the one that computes instead of painting.

## Commands

pnpm 10.33 workspace. If `pnpm` fails (unconfigured mise shim) use `npx -y pnpm@10.33.0 <cmd>`.

| Task                                                                                                                                      | Command                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unit tests: core (Node) + Web Component (happy-dom) with Vitest, then @gantryjs/angular (`ng test`, Vitest + happy-dom, zoneless TestBed) | `pnpm test` · core only: `npx vitest run --project core` · Angular only: `pnpm test:angular` |
| Date code in other time zones                                                                                                             | `pnpm test:tz`                                                                               |
| Typecheck packages, demos, e2e and the Angular projects                                                                                   | `pnpm typecheck`                                                                             |
| Lint (type-checked TS, Angular templates + a11y, Svelte, Vue, React hooks, core rules)                                                    | `pnpm lint`                                                                                  |
| Format (Prettier; formatting-only commits go in `.git-blame-ignore-revs`)                                                                 | `pnpm format` · `pnpm format:check`                                                          |
| Build everything (packages → @gantryjs/angular → site → demos → composed site)                                                            | `pnpm build`                                                                                 |
| Deployed site only (Vercel: Angular site + the four Vite demos under /wc/ /react/ /vue/ /svelte/)                                         | `pnpm build:site`                                                                            |
| Examples gallery: regenerate the code tabs' sources after editing case files · CI check                                                   | `pnpm gallery:sources` · `pnpm gallery:check`                                                |
| Angular library only (needs `@gantryjs/core` built)                                                                                       | `pnpm --filter @gantryjs/core build && pnpm build:lib`                                       |
| Dev servers                                                                                                                               | `pnpm dev:angular` · `dev:vanilla` (playground) · `dev:react` · `dev:vue` · `dev:svelte`     |
| Browser QA, Playwright (alignment, drag, panel, table view, parity, console errors)                                                       | `pnpm build && pnpm e2e` (`-g vanilla` to filter) — or `/gantry-visual-qa`                   |
| Screenshot baselines (Playwright container = CI pixels)                                                                                   | `pnpm e2e:visual` to compare · `pnpm e2e:update` to regenerate                               |
| Release notes for a change                                                                                                                | `pnpm changeset`                                                                             |

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
- Demo pages use `demo-kit` (`site.css` `gs-` classes, never element selectors: the Angular chart
  renders in the light DOM). A new option gets a control in `PLAYGROUND_SECTIONS`
  (`apps/demo-kit/src/playground.ts`), which both playgrounds render, and every feature has an
  examples-gallery case in all five frameworks (`.claude/rules/docs-and-release.md`).
- Loop breaker: if a build or test fails twice with the same error, stop and report instead of retrying.

## Gotchas

- Web Component: no attributes/styles in the constructor (`document.createElement` throws) —
  do it in `connectedCallback`; module top level must stay SSR-safe (guard `document`/`HTMLElement`).
- Web Component is CSP-strict (constructable stylesheets): no `innerHTML`, `style=`, `cssText` —
  ESLint enforces it; colours are `Paint`s applied through the CSSOM. After changing its public
  properties, events or JSDoc, run `pnpm --filter @gantryjs/vanilla cem` (CI checks the manifest).
- Angular renders in the light DOM: SVG `id`s must be unique per instance (use the canvas `uid`).
- New optional DOM nodes are built detached and attached by their region only while shown, in both bindings (paint snapshots rely on it).
- In Chromium an SVG element with focus/blur/focusin/focusout listeners becomes a Tab stop: listen on an HTML ancestor.
- Workspace packages export a `@gantryjs/source` condition; demos, tests and typecheck read the
  TypeScript sources. Published packages are ESM-only with bundled `.d.ts`.
- `@gantryjs/angular` publishes from `dist/gantryjs-angular` (`publishConfig.directory`);
  `scripts/resolve-workspace-deps.mjs` rewrites `workspace:` ranges after `ng build`.
- Node ≥ 22 shadows happy-dom's `localStorage` in tests — the element tests polyfill it.
- Visual verification needs a browser: the Playwright suite uses its bundled Chromium (install it
  once with `npx playwright install chromium`); `pnpm e2e:update` runs in the Playwright container CI uses.
