---
'@gantryjs/angular': major
---

**`<gantry>`: keyboard, touch, zoom, chart states and accessibility**, the same as `<gantry-element>`.

**New**

- Inputs `loading` (boolean attribute) and `errorMessage`, the `retry` output (`RetryEvent`: `{ source: 'error' | 'dataSource' }`), `[ganttEmpty]` content for the empty state, `fitToScreen()`, and `<ng-template ganttTooltip>` (`GanttTooltipTemplateDirective`, `GanttTooltipTemplateContext`: `$implicit` / `model`, `task`, `row`) for the tooltip's content, which wins over `options.tooltip.render`. The body shows a loading skeleton (the host is `aria-busy`), an error box (`role="alert"`) whose Retry emits `retry` (and calls `dataSource.retry()` after a failed first page), or the empty box.
- Every Phase 9 option: `keyboard.characterShortcuts`, `tooltip` (`trigger`, `showDelay`, `hideDelay`, `render`), `legend.position`, `markers.lane`, `bar.handles.hitSize` and `toolbar.fit`.
- Keyboard: the task list is a row-first treegrid (↑/↓, PgUp/PgDn, Home/End between rows, the header row above the first, →/← expand / collapse or into the cells, Enter activates or sorts, Space / Shift+Space / Ctrl+Space select); the bars rove (↑/↓ between bars, ←/→ pan one header cell) and Enter / F2 start move mode (←/→ move, Shift+←/→ and Alt+←/→ resize, Enter commits with the same `taskDragged` / `taskResized` as a drop, Esc cancels); F fits the tasks to the screen; expand / collapse and move-mode steps are announced. The focused bar's ring and the resize grips are drawn in one overlay, for custom bars too.
- Pointer and touch: touch and pen drag after a 350 ms long-press (moving earlier pans; a tap toggles the tooltip), auto-scroll near the viewport's edges, 24 px resize targets with grips; Ctrl/⌘ + wheel, trackpad and touch pinches and Safari's gesture events zoom around the pointer (`viewModeChange` reports each level).
- The tooltip opens on hover, on keyboard focus and on a tap, the pointer can rest on it, Escape closes it, and its bar is `aria-describedby` it. A drag readout chip shows the new dates while a bar is dragged, resized or moved from the keyboard. The marker lane under the header tiers holds the today chip and the annotation labels.
- Forced colors: under `@media (forced-colors: active)` the chart paints with system colours, as the Web Component does. Custom bar components keep their own paints (style encapsulation) unless they add forced-colors rules.

**Breaking**

- Every bar, custom ones included, is stamped by the chart as an `option` of the timeline's `listbox` (`labels.ariaBars`): `role="option"`, `aria-label`, `aria-roledescription`, `aria-selected`, `aria-posinset` / `aria-setsize` among the visible rows, a roving `tabindex`, `data-bar-type` and `data-focus-key`; the chart's values win over a custom bar's own `role` / `aria-label`. Built-in bars no longer bind `role="listitem"` / `aria-label`.
- Tab order: toolbar (one roving stop) → task list (one stop) → splitter → toggle → bars (one roving stop). The timeline viewport is a tab stop only while no bar is mounted; sortable header cells and collapse toggles are no longer tab stops; header cells' focus key is `head:<column>` (was `sort:<column>`). Enter on a movable bar starts move mode instead of selecting it, and Space toggles a row in multiple selection.
- Toolbar (painted from core `buildToolbar`, the Web Component's markup): icon buttons (zoom out, zoom in, Fit) and Today with an icon instead of the glyphs; the zoom levels and views are radio groups (`aria-checked` instead of `aria-pressed`, checked by Space / Enter / click), the views icon-only ("Table and chart", "Table only", "Chart only"); 32 px controls with `data-focus-key`. `role="toolbar"` and its `aria-label` move from `<gantt-toolbar>` to `div.gantt-toolbar`; `[ganttToolbar]` content stays between Today and the view switch, outside the roving set.
- The legend is an in-flow strip under the panes (`div.gantt-legend.gantt-legend--bottom`, after `.gantry-main`) instead of a box floating over the bars, or the toolbar's last child with `legend.position: 'toolbar'`.
- A mouse press drags a bar only after a 3 px move (a smaller move is a click); a touch press only after the long-press. The cursor comes from a `data-cursor` attribute on the canvas instead of an inline style.
- The tooltip is anchored below its bar instead of following the pointer.
- Announcements are debounced (250 ms, the last one wins) and zoom changes are announced.
- The header grows by an 18 px marker lane when an annotation has a label (`markers.lane: false` keeps the old height), and annotation labels leave the canvas while the lane shows. The task-list footer only shows under rows (a first data-source page loads and fails in the chart state).
- Every focus ring, the splitter's and its toggle's included, uses `--gantt-focus-ring` (was `--gantt-sel-border`); the host sets `line-height: normal`; both panes get `scroll-padding-top`.

**Fixed:** the timeline `<svg>` was an extra, unnamed tab stop in Chromium (its focus listeners made it focusable; they moved to an HTML ancestor); load-state announcements no longer depend on effect timing.

- Scroll sync no longer writes the task list's stale offset back over a keyboard move at key-repeat speed (the focused bar ended under the header): it mirrors at once through core `createScrollMirror`, as the Web Component.
- A focused bar scrolls into view with its whole focus ring below the sticky header and inside the timeline (core `timelineScrollPadding`).
- While the state box covers the body, the timeline, the splitter and the task-list rows are `inert`, and focus on them moves to Retry, else the toolbar.
- Without rows (loading, empty, a failed first page) the first task-list header cell is the list's tab stop.
- The loading box has a visually hidden `labels.loading` text (`span.gantt-state-message`).
- The `gantry-loading` host class also follows the `loading` input; the drag readout chip is attached only while it shows the new dates; shortcuts work on the splitter's collapse toggle (only the handle keeps its keys).
