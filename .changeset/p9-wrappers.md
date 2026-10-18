---
'@gantryjs/react': minor
'@gantryjs/vue': minor
'@gantryjs/svelte': minor
---

**Chart states in every wrapper**: the `loading` and `errorMessage` props and the `onRetry` callback (Vue: `@retry`), with `{ source: 'error' | 'dataSource' }`.

- Children reach `<gantry-element>`'s light DOM, so a `<div slot="empty">…</div>` replaces the empty-state text: React children, the Vue default slot; Svelte forwards `children` and adds an `empty` snippet prop rendered in that slot.
- No default inline `style` any more: the element's `:host` already fills its container, server markup has no `style` attribute of its own (strict CSP), and a `class` on the component now sizes the chart. Until the element is defined (server-rendered markup before the script runs) the `:host` style doesn't apply: add `gantry-element:not(:defined) { display: block; width: 100%; height: 100%; }` to your stylesheet to reserve the chart's box (see each wrapper's "Server-side rendering").
- Every new option and behaviour of `@gantryjs/vanilla` (keyboard model and move mode, touch and zoom gestures, `fitToScreen()` on the element, the tooltip options, the marker lane, the legend strip, forced colors) reaches the wrappers as is. `options.tooltip.render` returns a string or a DOM node, not a React element, a VNode or a snippet.
