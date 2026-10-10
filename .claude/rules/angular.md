---
paths:
  - 'projects/gantry/**'
---

# ngx-gantry (Angular) rules

- Angular 22 style: standalone components, `ChangeDetectionStrategy.OnPush`, signal APIs
  (`input()`, `output()`, `computed()`, `viewChild()`), `@if` / `@for` with `track`. Must work
  zoneless — never rely on zone.js to trigger change detection.
- `GantryComponent` resolves options with `resolveConfig()` and binds them through
  `layout.bindConfig()`; read geometry from `GanttLayoutService` signals and core visuals —
  never re-implement core math in a component.
- Built-in bars render `ctx.visual` (`bars/builtin-bar.ts`); custom bars registered with
  `provideGanttBar()` get the same context. Keep `GanttBarBase` / `GanttBarContext` compatible.
- Light DOM: SVG `id`s must be unique per instance (use the canvas `uid`).
- Effects that write signals read their other inputs inside `untracked()` to avoid loops.
- Public API is `src/public-api.ts`. Keep input/output names stable — deprecate, don't remove,
  and record intentional breaks in the changeset.
- Match the Web Component: same option names, same CSS classes, same behaviour. When you
  change one painter, change the other (the `gantry-reviewer` agent checks this).
- Verify with `pnpm --filter @gantry/core build && pnpm build:lib`, then `pnpm build:app`.
- Unit tests: `projects/gantry/src/**/*.spec.ts`, run with `pnpm test:angular` (`@angular/build:unit-test`,
  Vitest + jsdom; `src/test/dom-shims.ts` stubs ResizeObserver / IntersectionObserver / scrollTo).
  Provide `provideZonelessChangeDetection()`; await `fixture.whenStable()` instead of `detectChanges()`.
