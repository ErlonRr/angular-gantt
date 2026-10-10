---
paths:
  - 'packages/react/**'
  - 'packages/vue/**'
  - 'packages/svelte/**'
---

# React / Vue / Svelte binding rules

- Wrappers stay thin: forward properties to `<gantry-element>` and events to callbacks, no
  rendering logic. Derive from `GANTRY_PROPERTIES` / `GANTRY_EVENTS` exported by `@gantry/vanilla`.
- React: `forwardRef` exposing the element, one effect per property, callbacks read from a
  ref, `createElement('gantry-element')` (no global JSX typing). Supports React 18 and 19; SSR-safe.
- Vue: render-function component (`h()`), so consumers need no `isCustomElement` config —
  a deliberate exception to the `vue-best-practices` skill's `<script setup>` default; keep it.
  `default: undefined` on optional props (avoids boolean casting); array props watched
  `deep: 1`; emits are the camel-cased event names.
- Svelte 5: runes only. `Gantry.svelte` destructures props **explicitly** — when
  `GANTRY_EVENTS` or `GANTRY_PROPERTIES` grow, add the new names there too. Data arrays
  go through `$state.snapshot`. Built with `svelte-package`.
- Named exports only (no default export); each package re-exports `@gantry/core`.
- Verify: `pnpm typecheck` and the demo apps (`pnpm --filter demo-react typecheck`, etc.).
