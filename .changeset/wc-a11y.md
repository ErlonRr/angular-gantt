---
'@gantry/vanilla': major
'@gantry/core': minor
'ngx-gantry': patch
---

**Accessibility of `<gantry-element>`.** The host is a landmark region instead of a tab stop, and keyboard focus moves
through the controls inside it.

### `@gantry/vanilla` (breaking)

- **No `tabindex` on the host.** The element no longer makes itself focusable: the shadow root delegates focus, so
  `el.focus()` focuses the first internal tab stop. The tab stops are,
  in order: the toolbar buttons, the task list (one row at a time: the focused row, else the row focused last while it
  is mounted, else the first row in view; the other rows have `tabindex="-1"`), the splitter, its collapse toggle and the
  timeline viewport (`role="group"`, `tabindex="0"`, named by `labels.ariaChart`; arrow keys scroll it). Each shows a
  focus ring in `--gantt-sel-border` on keyboard focus. A page that set `tabindex` on the element should remove it.
- **No `data-theme` on the host.** Use the `dark` custom state instead: `gantry-element:state(dark) { … }` replaces
  `gantry-element[data-theme="dark"]` (Chromium 90–124 use the legacy `:--dark`). The host also exposes `:state(dragging)`
  while a bar is dragged or resized and `:state(loading)` while a data-source page loads.
- **`role="region"` through `ElementInternals`.** The host is a region named by `labels.ariaChart` (kept in sync when the
  labels change) without adding attributes; a `role` or `aria-label` the page sets on the element still wins. Engines
  without ARIA on `ElementInternals` get `role="region"` and `aria-label` host attributes when the element connects.
- **The splitter's separator is a child of `.gantry-splitter`.** `role="separator"`, `tabindex="0"` and the new
  `aria-valuenow` (the panel width in px) moved to `.gantry-splitter-handle`, which covers the splitter box; the collapse
  toggle is its sibling, no longer nested inside the separator (whose children are presentational). `::part(splitter)` is
  still the box. Keyboard handling is unchanged.
- **Live region.** A polite `.gantt-sr-live` (`role="status"`) announces changes of the number of selected tasks
  (`labels.announceSelection`) and the data source's load state (`labels.loading`, then `labels.announceLoaded(n)` or
  `labels.allLoaded(n)`); a failed page is still announced once in `.gantt-sr-alert`.
- When the focused control disappears (its row was removed), focus goes to the timeline viewport (in the table view, to
  the task list's tab-stop row) instead of the host. Starting a bar drag focuses the timeline viewport.
- The toolbar is named by `labels.ariaToolbar`.

### `@gantry/core`

New labels in `GanttLabels` / `DEFAULT_LABELS`: `ariaToolbar` (`'Chart toolbar'`, the toolbar's accessible name) and
`announceLoaded(count)` (`'20 tasks loaded'`, read when a data-source page loads and more remain). They are required
members of `GanttLabels`: only objects typed as a full `GanttLabels` need them, `options.labels` stays partial.

### `ngx-gantry`

The toolbar is named by `labels.ariaToolbar`, like the Web Component's.
