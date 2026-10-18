---
'@gantryjs/vanilla': major
---

**`<gantry-element>`: keyboard, touch, zoom, chart states and accessibility.**

**New**

- Properties `loading` (attribute `loading`) and `errorMessage` (attribute `error-message`), the `retry` event (`RetryEvent`: `{ source: 'error' | 'dataSource' }`, `onRetry` in `GANTRY_EVENTS`), the `empty` slot, the `legend` and `state` parts and `fitToScreen()`. The body shows a loading skeleton (the host is `aria-busy`, and `:state(loading)` also follows `loading`), an error box (`role="alert"`) whose Retry fires `retry` (and calls `dataSource.retry()` after a failed first data-source page), or the empty box with the `empty` slot (`labels.emptyState` without one).
- Every Phase 9 option: `keyboard.characterShortcuts`, `tooltip` (`trigger`, `showDelay`, `hideDelay`, `render` returning a string or a DOM node), `legend.position`, `markers.lane`, `bar.handles.hitSize` and `toolbar.fit`.
- Keyboard: the task list is a row-first treegrid (↑/↓, PgUp/PgDn, Home/End between rows, the header row above the first, →/← expand / collapse or into the cells, Enter activates or sorts, Space / Shift+Space / Ctrl+Space select); the bars rove (↑/↓ between bars, ←/→ pan one header cell) and Enter / F2 start move mode (←/→ move, Shift+←/→ and Alt+←/→ resize, Enter commits with the same `task-dragged` / `task-resized` events as a drop, Esc cancels); F fits the tasks to the screen; expand / collapse and move-mode steps are announced. The focused bar's ring and the resize grips are drawn in one overlay (`g.gantt-bar-overlay`), for custom `renderBar` bars too.
- Pointer and touch: touch and pen drag after a 350 ms long-press (moving earlier pans, `touch-action: pan-x pan-y`; a tap toggles the tooltip), auto-scroll near the viewport's edges, 24 px resize targets with grips, and the cursor (`grab`, `ew-resize`, `grabbing`) follows the part of the bar under the pointer. Ctrl/⌘ + wheel, trackpad and touch pinches and Safari's gesture events zoom around the pointer.
- The tooltip opens on hover, on keyboard focus and on a tap, the pointer can rest on it, Escape closes it, and its bar is `aria-describedby` it. A drag readout chip (`.gantt-drag-readout`) shows the new dates while a bar is dragged, resized or moved from the keyboard. The marker lane under the header tiers holds the today chip and the annotation labels.
- Forced colors: under `@media (forced-colors: active)` the chart paints with system colours (bars `ButtonFace` / `ButtonText`, critical bars dashed, selection, today and focus rings `Highlight`, lines `GrayText`).

**Breaking**

- Tab order: toolbar (one roving stop) → task list (one stop) → splitter → toggle → bars (one roving stop). The timeline viewport is a tab stop only while no bar is mounted; sortable header cells and collapse toggles are no longer tab stops; header cells' focus key is `head:<column>` (was `sort:<column>`). Enter on a movable bar starts move mode instead of selecting it, and Space toggles a row in multiple selection.
- The timeline `<svg>` is a `listbox` named by `labels.ariaBars` and its bars are `option`s (`aria-selected`, `aria-roledescription`, `aria-posinset` / `aria-setsize` among the visible rows, roving `tabindex`, `data-focus-key`) instead of a `list` of `listitem`s.
- Toolbar: icon buttons (zoom out, zoom in, Fit) and Today with an icon, instead of the glyphs −, +, ◎; the zoom levels and views are radio groups (`aria-checked` instead of `aria-pressed`, checked by Space / Enter / click, not by moving focus), the views icon-only ("Table and chart", "Table only", "Chart only"); 32 px controls.
- The legend is an in-flow strip under the panes (`div.gantt-legend.gantt-legend--bottom`, the wrapper's last child) instead of a floating box, or the toolbar's last child with `legend.position: 'toolbar'`, attached only while shown.
- A mouse press drags a bar only after a 3 px move (a smaller move is a click); a touch press only after the long-press. Bars are hit-tested by geometry (core `hitTestBar`), so resize zones are 24 px and reach past the bar's edges, and a custom `renderBar` is hit by its visual box. Ctrl/⌘ + wheel over the task list is left to the browser.
- The tooltip is anchored below its bar instead of following the pointer.
- Announcements are debounced (250 ms, the last one wins) and zoom changes are announced; while the error box shows, `.gantt-sr-alert` stays empty.
- The header grows by an 18 px marker lane when an annotation has a label (`markers.lane: false` keeps the old height), and annotation labels leave the canvas while the lane shows. The task-list footer only shows under rows (a first data-source page loads and fails in the chart state).
- Every focus ring, the splitter's and its toggle's included, uses `--gantt-focus-ring` (was `--gantt-sel-border`); the host sets `line-height: normal`; both panes get `scroll-padding-top`.

**Fixed:** tasks assigned while a `dataSource` was set are applied when it is cleared, and a failed first page is no longer announced twice.

- A focused bar scrolls into view with its whole focus ring below the sticky header and inside the timeline (`scroll-padding` from core `timelineScrollPadding`); its top or bottom ring edge was clipped.
- While the state box covers the body, the timeline, the splitter and the task-list rows are `inert`, and focus on them moves to Retry, else the toolbar.
- Without rows (loading, empty, a failed first page) the first task-list header cell is the list's tab stop.
- The loading box has a visually hidden `labels.loading` text (`span.gantt-state-message`).
- The panes' scroll sync ignores the echo of its own writes (core `createScrollMirror`), so a fast keyboard move is never undone.
- The tooltip resets only when its resolved rules change.
