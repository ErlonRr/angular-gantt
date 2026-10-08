---
paths:
  - "packages/vanilla/**"
---

# @gantry/vanilla (<gantry-element>) rules

- Paint the core model, don't compute it: header → `header/gantt-header.component.ts` (HTML
  tiers), body → `layout/gantt-canvas.component.ts` with `paint/*.ts`, task list →
  `tasklist/gantt-tasklist.component.ts`. Bars/arrows come from `computeBarVisual` / `computeArrowVisual`.
- Rendering is batched: `scheduleRender(true)` when options, data or the timeline change;
  `scheduleRender(false)` for scroll, hover and drag (rows only).
- The `options` setter only re-applies UI state the consumer actually changed (view mode,
  view, panel width) — never undo the user's interaction.
- Public surface is typed in `src/types.ts`: new property → `GantryProperties` +
  `GANTRY_PROPERTIES`; new event → `GantryEventDetailMap` + `GANTRY_EVENTS` (kebab-case
  `CustomEvent`, `bubbles` + `composed`). The React/Vue/Svelte wrappers derive from these.
- Constructor: no attributes, styles or children outside the shadow root — do that in
  `connectedCallback`. Module top level stays SSR-safe.
- CSS class names are shared with Angular (`.g-*` header, `.gantt-*` elsewhere) and the
  QA script relies on them; theming goes through `--gantt-*` variables and `part=` attributes.
- User text goes in via `textContent` (tooltip HTML is escaped with `esc()`).
- Tests: `src/__tests__/` in happy-dom. Select bars with `.gantt-bars-layer [data-task-id]`
  (task-list rows carry `data-task-id` too).
