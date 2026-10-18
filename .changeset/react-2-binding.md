---
'@gantryjs/react': major
---

`<Gantry>` applies its props and listeners in the commit (layout effects in the browser, nothing on the server), so the
chart's first frame already shows the passed `tasks` and `options` instead of flashing its defaults.

- A prop set back to `undefined` (or left out after having a value) restores the element's default; it used to keep
  the last value. A prop that was never set is not written.
- Events fired while the element applies its first props are delivered (listeners are attached first): for example
  `onViewModeChange` for `options.viewMode`, or `onLoadError` for a data source that already failed.
- Callbacks are read from a ref updated in the commit, never during render: a render React discards (a suspended
  transition) can no longer swap in its callbacks, and changing a callback never re-adds listeners.
- Objects are passed through unchanged (`ref.current.tasks === tasks`), and the ref is attached once the props are set.
- `className` is set as the `class` attribute, so it also styles the chart in React 18 (which wrote a `classname`
  attribute on custom elements).
- Server rendering emits `<gantry-element>` without touching DOM APIs and without React 18's layout-effect warning.

Breaking: a prop set back to `undefined` now restores the element default (it used to keep the last value).
