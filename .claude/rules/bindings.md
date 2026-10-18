---
paths:
  - 'packages/react/**'
  - 'packages/vue/**'
  - 'packages/svelte/**'
---

# React / Vue / Svelte binding rules

- Wrappers stay thin: forward properties to `<gantry-element>` and events to callbacks, no
  rendering logic. Derive from `GANTRY_PROPERTIES` / `GANTRY_EVENTS` exported by `@gantryjs/vanilla`.
- React: `forwardRef` exposing the element; `createElement('gantry-element')` (no global JSX typing). Isomorphic
  layout effects (`useEffect` when `document` is undefined) in this order: event listeners (attached once, removed a
  microtask after the cleanup unless the effect re-ran — StrictMode, `<Activity>` — so the disconnect `state-change`
  still arrives: React runs the cleanup before it removes the element), the callbacks-ref
  update (every commit, never during render), one effect per property (written on change, consumer objects passed
  through unchanged; `undefined` written once the prop had a value, props never set are not written), then
  `useImperativeHandle` (the ref sees the props already set). `className` is forwarded as `class` (React 18).
  Supports React 18 and 19; SSR-safe.
- Vue: render-function component (`h()`), so consumers need no `isCustomElement` config — a deliberate exception to
  the `vue-best-practices` skill's `<script setup>` default; keep it. `expose({ element })` (the template ref exposes
  only `element`). A directive's `created` hook adds the listeners, then the defined props, before Vue inserts the
  element (first events, no flash of defaults); `unmounted` removes them after the element left (so its disconnect
  `state-change` still arrives). The `props` list is explicit (`satisfies` + a test against `GANTRY_PROPERTIES`) — add
  new properties there. `default: undefined` on optional props (avoids boolean casting); `undefined` is forwarded;
  values go through `toRaw` (no clones); array props are watched `deep: 1` and copied only after an in-place change;
  `options` is watched `deep: 1` and a reactive one always goes over as a one-level copy (the element compares new
  options with the object it holds); prop types are checked against `GantryProperties` (`satisfies` + an exact
  `expectTypeOf` test); emits are the camel-cased event names.
- Svelte 5: runes only. `Gantry.svelte` destructures props explicitly and maps every name to a getter in the
  `properties` / `callbacks` records, whose types require every key, so a new `GANTRY_PROPERTIES` / `GANTRY_EVENTS`
  name fails svelte-check until it is destructured (`props.test.ts` checks the destructuring too). The listener effect
  comes first (callbacks looked up and called inside `untrack`); one effect per property writes the element inside
  `untrack`. Only the data props (`tasks`, `columns`, `annotations`, `options`) are copied one level with `shallow()`,
  never `$state.snapshot` (`dataSource`, `renderBar`, flags pass as they are); recommend `$state.raw` for big plans.
  `hydration.test.ts` renders with `svelte/server` through the `svelte-server:` import (vitest.config.ts) and
  hydrates. `undefined` is forwarded once a prop has been set. Built with `svelte-package` (the package `files`
  exclude `dist/__tests__`); test types come from `src/__tests__/tsconfig.json`.
- All three: a prop never set is not written (attributes and imperative values survive); listeners are attached before
  the first property assignment so events fired by it reach the callbacks; tests live in `src/__tests__/` (Vitest
  projects `react` / `vue` / `svelte`, SSR specs with `// @vitest-environment node`).
- Named exports only (no default export); each package re-exports `@gantryjs/core`.
- Verify: `pnpm typecheck` and the demo apps (`pnpm --filter demo-react typecheck`, etc.).
