---
'@gantryjs/svelte': major
---

**`@gantryjs/svelte` 2.0: a one-level copy instead of a deep clone, nullable props, no lost first events.**

- **Data props are copied one level, never deep-cloned (breaking).** `tasks`, `columns`, `annotations` and
  `options` reach `<gantry-element>` as a plain array (or object) holding your own items: no `$state` proxy at the
  top and no `$state.snapshot` of every task on each change. Assigning a new array, and on `$state` `push` /
  `splice` / `tasks[i] = …` / `options.viewMode = …`, update the chart; a field changed in place inside an item
  (`tasks[i].end = …`) is no longer seen — replace the item, or keep large plans in `$state.raw` and assign a new
  array.
- **Clearing a prop restores the default.** A prop that goes back to `undefined` is forwarded (it used to be
  ignored); a prop never passed leaves the element's own value (its default, an attribute such as `dark-mode`, or a
  property set through `bind:element`).
- **First events arrive.** The listeners are attached before the first property is set, so an event fired while
  the chart starts (`onViewModeChange` for `options.viewMode`) reaches its callback; callbacks are read when the
  event fires.
- Each property is re-assigned only when it changes, after the listeners and before the element's first frame (no
  flash of defaults); unmounting removes the listeners; server rendering (`svelte/server`) emits
  `<gantry-element>` without touching the DOM. The prop and callback lists are checked against `GANTRY_PROPERTIES`
  and `GANTRY_EVENTS`.
