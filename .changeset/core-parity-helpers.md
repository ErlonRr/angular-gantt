---
'@gantryjs/core': minor
'@gantryjs/vanilla': patch
---

**Readable current-period label, themable progress overlay, shared binding helpers.**

- **`--gantt-today-label`** (fourth derived token of `themeToCss()`, `CONTRAST_CSS_VARS.todayLabel`): the colour of
  the current-period header label, `todayLabelColor(theme)` = `todayColor` when it reaches 4.5:1 on the 14 % today
  tint over `headerBackground`, else `todayColor` mixed towards `textPrimary` in 10 % steps until it does. The light
  theme's label changes from `#B45309` (3.97:1, a WCAG AA failure) to `#964B13` (5.01:1); the dark theme keeps
  `#FBBF24`. `<gantry-element>`'s header uses it (`.g-cell--current .g-cell-label`); a page-CSS override of
  `--gantt-today` should set it too. New helper `readableOnTint(fg, bg, alpha, toward, min = 4.5)`;
  `resolvePaint()` resolves the new token.
- **`progressOverlay`** theme key (`--gantt-progress-overlay`, `#000000` in every built-in palette, `PAINTS.progressOverlay`):
  bars without `task.progressColor` / `bar.progress.color` paint their progress with `var(--gantt-progress-overlay)`
  instead of the literal `#000000` (same pixels, now themable). A custom renderer reading
  `ctx.visual.paint.progress` gets the token: apply it as a style property or `resolvePaint()` it.
- `themeToCss()` returns 42 custom properties (was 40); `<gantry-element>` lists both new ones as `@cssprop`.
- Helpers both bindings share, moved from the Web Component into `@gantryjs/core`: `columnsGridTemplate(cols)` (the
  task-list `grid-template-columns`), `sameVirtualWindow(a, b)`, `HORIZONTAL_WINDOW_QUANTUM` (256),
  `announceLoadState(prev, next, labels)` with `LoadStateSnapshot` / `LoadStateLabels`, `TOOLTIP_SHOW_DELAY` (320 ms)
  and `TOOLTIP_HIDE_DELAY` (120 ms).
- More shared rules and constants both bindings now read from `@gantryjs/core` instead of their own copies:
  `seedCollapsed(tasks, seen?)` (`task.collapsed` seeds only the ids a chart has never seen; returns the ids to
  collapse and the ids seen so far, type `CollapseSeed`), `clampColumnWidth(width, col)` with `COLUMN_MIN_WIDTH` (40)
  and `COLUMN_MAX_WIDTH` (800), `VIRTUAL_OVERSCAN_ROWS` (4, `computeVirtualWindow`'s default), `panelWidthRange(bounds,
available)` (the limits `clampPanelWidth` clamps to, type `PanelWidthRange`), `splitterValue(input)` (the splitter
  separator's `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, type `SplitterValue`), `SPLITTER_KEY_STEP` (24 px
  per Arrow key), `SPLITTER_TOGGLE_OFFSET` (24 px below the header), `STATE_SAVE_DELAY` (150 ms debounce of the state
  report and `stateKey` write) and `CLOCK_INTERVAL` (60 s).
