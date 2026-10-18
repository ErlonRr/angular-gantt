---
'@gantry/vue': major
---

`<Gantry>` for Vue sets its listeners and props on `<gantry-element>` before Vue inserts it, so the chart connects
and paints its first frame with your props (no flash of the defaults), and events fired by the first assignment or
the first connect (`view-mode-change` from `options.viewMode`, `load-error` of a data source that already failed)
reach the emits.

- A prop that becomes `undefined` (or is dropped) restores the element's default; it used to keep the last value.
- Your objects reach the element as they are: Vue proxies are unwrapped with `toRaw`, so `element.tasks` is the
  array you passed (an array that holds proxies, as `tasks.value.map(…)` returns, becomes an array of the raw items).
  Arrays are no longer copied on every assignment, only after an in-place change (`push`, `splice`, `list[i] = …`),
  because the element compares arrays by identity.
- The template ref exposes only `element` (`expose({ element })`); the rest of the component instance is private.
- The listeners come off after the element is unmounted, so a `state-change` it fires while disconnecting (a
  pending save) still reaches `@state-change`.
- The props list is explicit and checked against `GANTRY_PROPERTIES`; server rendering (`renderToString`) emits
  `<gantry-element>` without touching the DOM. The README documents `@state-change` and `@load-error`.

Breaking: the template ref (`ref="chart"`) exposes only `element` (`chart.value.element`); it used to be the whole
component instance, including the undocumented `setElement` and the props.

A reactive `options` object is watched one level deep and reaches the element as a one-level copy, so an in-place
change of a top-level field (`options.viewMode = 'Week'`) is applied; replace a nested object (`options.panel = {…}`)
to change it. Plain (non-reactive) objects are passed through unchanged.
