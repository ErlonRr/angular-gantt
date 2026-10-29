# @gantryjs/vanilla

## 2.0.0

### Major Changes

- 1cedb3f: **No more `dayjs`: zero runtime dependencies.** Dates are formatted by a built-in, `Intl`-based formatter
  with dayjs-compatible tokens (`YYYY YY M MM MMM MMMM Q D DD Do d dd ddd dddd H HH h hh m mm s ss A a W WW [text]`).
  `locale` is any BCP 47 tag (`'it'`, `'de-CH'`, `'pt-BR'`) and needs no `import 'dayjs/locale/…'`; unknown or malformed tags
  fall back to `'en'`, which is also the default — the dayjs global locale (`dayjs.locale('it')`) is no longer read, so set
  `locale` explicitly. Names come from CLDR, so a few abbreviations change (German `Mär`, Spanish `sept` / `a. m.`,
  lowercase Catalan months, Russian `июн.`), and a short month after a day number uses the format-context form (`5 мар.`).
  New exports: `dateNames(locale, kind)`, `resolveFormatLocale`, `isoWeek`, `isoWeekYear`, `quarterOf`, `dayOfYear`, `ISO_FORMAT`.
  
  **Shared logic in `@gantryjs/core`**, used by both renderers instead of their own copies:
  virtual rows (`computeVirtualWindow` with pinned rows, `isIndexMounted`, `virtualIndexes`), horizontal windowing
  (`computeHorizontalWindow`, `tiersInRange`, `bandsInRange`, `linesInRange`, `sameHorizontalWindow`), selection
  (`selectionClick`, `selectAllRows`, `selectionOf`, `emptySelection`, `shouldEmitSelection`), view and panel width
  (`viewFromOptions`, `viewFromState`, `resolvePanelWidth`, `clampPanelWidth`), versioned state persistence
  (`GANTT_STATE_VERSION`, `parseState`, `serializeState`, `normalizeState`, `readStoredState`, `writeStoredState`),
  tooltip and legend models (`buildTooltipModel`, `buildLegend`), keyboard (`resolveKey`, `navigateGrid`,
  `KeyboardEditSession`), screen-reader text (`taskAccessibleName`, `announce*`).
  
  Breaking: stored state is written as version 2 (`{"v":2,…}`; v1 snapshots are migrated, invalid fields are dropped,
  snapshots from a newer version are ignored); `GanttLabels` has new required members for accessible names
  (`ariaProgress`, `ariaCritical`, `ariaBaseline`, `ariaDateRange`, `ariaDateFormatShort`, `ariaDateFormatLong`,
  `ariaTimeFormat`, `ariaListSeparator`), announcements (`announce*`), tooltip rows (`ttCritical`, `ttCriticalValue`,
  `ttFloat`, `ttFloatDays`, `ttSuccessors`) and the legend (`legendCritical`, `legendBaseline`) — `options.labels` stays
  partial; `GanttBarContext` fields are required; `DragPreview` is `{ delta, unit }` (`daysDelta` is deprecated);
  `criticalIds` is a `ReadonlySet`; the legacy helpers `PX_PER_DAY`, `HEADER_HEIGHTS`, `getTimelineRange`,
  `generateHeaderRows`, `generateGridLines`, `zoomIn`, `zoomOut` are removed (use `buildTimeline` and the zoom levels).
  
  Fixed: the Hour view drew overlapping, out-of-order header cells in time zones west or east of UTC (an hour boundary
  on UTC midnight was read as a date-only value); holidays are looked up in O(1) while painting.
  
  Renderers (`<gantry-element>` and `<gantry>` behave the same):
  
  - Bars' accessible names come from `taskAccessibleName`: name, type, dates (with the time of day when a task
    doesn't start or end at midnight; formats `labels.ariaDateFormatShort` / `ariaDateFormatLong` / `ariaTimeFormat`),
    progress (rounded, clamped), "critical" and "planned baseline shown" (not for milestones).
  - The tooltip shows critical path, float, baseline start / end / variance, predecessors and successors when that data
    exists; milestones show one date row (Angular's "◆ Milestone" badge is gone); progress is clamped to 0–100 and its
    fill follows the critical colour. Angular's tooltip now has `role="tooltip"` and the shared `gantt-tooltip` class.
  - The legend honours `showToday` and lists the critical path (bar) and baseline (strip) when those options are on; the
    swatch geometry comes from `@gantryjs/core` (`legendSwatch`, `LEGEND_SWATCH_SIZE`).
  - Keyboard: `Ctrl/⌘+Shift+A` also selects all; shortcuts no longer fire with `Alt` / `AltGr`; unhandled keys
    (`F`, `Ctrl+Z`, `Ctrl+Y`) keep their browser default.
  - `selection-change` / `selectionChange` is no longer emitted when clearing an already empty selection.
  - `setState()` drops invalid fields (e.g. `panelWidth: 0`); an explicit `panel.collapsed: false` beats `panelVisible: false`.
  - `@gantryjs/vanilla`: the element's selection and tooltip internals that implement this are private in 2.0 (see the
    `wc-engine` changeset); the `virtual-scroll` entry no longer has its own `computeVirtualWindow` (use the core one).
  - `@gantryjs/angular`: the selection service, task list, tooltip and canvas these changes touched are internal in
    `@gantryjs/angular` (see its changeset); use `<gantry>`'s `selectionChange`, `getSelectedTasks()` and
    `setSelectedTasks()`.
- 19d6e62: Gantry is now available for every framework: `@gantryjs/core` (framework-free logic), `@gantryjs/vanilla` (`<gantry-element>` Web Component), and `@gantryjs/react`, `@gantryjs/vue`, `@gantryjs/svelte` bindings. `@gantryjs/angular` now builds on `@gantryjs/core` and gains column sorting (built-in columns are sortable).
- 8891728: **Task styles, rolled-up segments and row hover in `<gantry-element>`.** Bars take their extra classes from the resolved style (`options.styles`, `task.style.className`, the deprecated `task.className`), custom `renderBar` nodes included (added next to their own classes); a collapsed parent with `rollup.segments` draws its children as `rect.gantt-bar-segment` inside its bar; row backgrounds and the task-list icon use the style's `rowColor` / `color` in both panes. The row under a mouse or pen pointer is tinted in both panes (`rect.gantt-row-hover` and `.gantt-tl-row--hover`, theme key `rowHoverBg`; `transparent` turns it off), replacing the task list's `:hover` brightness filter; it clears on leave, scroll and drag start and is hidden in forced colours.
  
  **`syncGroup`, rollup, task styles and layout variables.** New `syncGroup` property (no attribute; `undefined` or `null` = not synchronised) takes a core `createGanttSyncGroup()` group: the chart joins it while connected and leaves on disconnect or when the group changes, and `fitToScreen()` fits the group's task extent. `options.rollup` now gives each parent row its rolled-up progress, dates and status (task list, bars, sorting), `options.styles` and `task.style` reach the bar visuals (with `rollup.segments` for collapsed parents), and `groupBar.collapsed` starts every parent collapsed the chart has never seen (also when `options` is assigned after `tasks`, before the first paint). Events and `getSelectedTasks()` keep the raw tasks. The host's theme sheet carries the read-only `--gantt-row-height` and `--gantt-bar-height`; the wrapper part carries `data-density`, `data-narrow` (while narrower than `responsive.breakpoint`) and `--gantry-control-size`. `getState().view` reports the wide view while the chart is narrow.
  
  **Synchronised charts.** Charts that share one `syncGroup` share their timeline range (same start, so a date sits at the same x in every chart), zoom level, horizontal scroll and panel width. A chart that joins a group that already has a scroll position opens there instead of at `initialScroll`. A scroll the group applied is never sent back: a chart that cannot scroll as far stops at its own end without pulling the others back. A zoom level the chart doesn't have is ignored. Applying the group's panel width doesn't save the chart's state (a later save, after a zoom or a collapse, keeps the width shown). A chart leaves its group when it disconnects or when `syncGroup` changes to another group, `null` or `undefined`.
  
  **Narrow charts, the More menu and the panel toggle.** Below `responsive.breakpoint` (640 px by default) the chart switches to `responsive.view` (`'chart'`), restores the wide view when it widens again, and lets a view the user picks while narrow win until then; the forced view is never saved (`getState().view` keeps the wide view). With `toolbar.overflow: 'menu'` (the default) the toolbar moves the zoom levels, then the views, then Today into a More menu button (WAI-ARIA menu: ↓/↑, Home/End, Enter/Space, Esc, Tab, outside press) when the measured width is too small; `'wrap'` keeps wrapping. `toolbar.panelToggle` adds a pressed task-list button first, and the toolbar controls follow `density` (28 / 32 / 36 px). A toolbar that fits renders as before.
  
  **Tooltip and drag readout fixes.** An open tooltip now follows its row: when the task object, its critical-path flag or the labels (locale and formats included) change, the content is written again and the tooltip is placed again by its (moved) bar, in the next frame after the bars are painted. `options.tooltip.render` runs again only then, never on a clock tick. A keyboard focus that reaches a bar before the chart's first render now opens its tooltip once that render is done. The tooltip's progress fill takes the colour of the row's resolved style (`options.styles`, `task.style`, the deprecated flat colours), which is the colour of the bar, and the critical colour on the critical path. The drag readout chip writes its dates in `formats.readoutFormat` when it is set.
  
  **Load-more footer outside the task-list treegrid.** The `.gantt-tl-load-more` footer of a lazy data source is now the treegrid's next sibling in the panel (as in Angular) instead of its last child: a treegrid may only hold rows, so axe no longer reports `aria-required-children`, and arrow keys on its button no longer go to the grid navigation.
  
  **No announcement on page load.** A zoom level or selection set before the chart first paints (options assigned after the element connected, as the React and Svelte wrappers do) is the baseline of the live region, as in Angular: a screen reader no longer hears "Zoom: Week" when the page loads.
  
  **No panel slide on load.** Pane widths don't animate until a frame after the first render (`.gantry-main.is-settling`), as in Angular: a `panel.width` assigned after the element connected (the React and Svelte wrappers) no longer slides the panel from its default width, and `initialScroll` centres in the final viewport.
  
  **Review fixes.** The drag ghost and the readout follow the row's styled height and radius; `togglePanel()` and the toolbar's task-list button switch the table view to the chart view, matching their "Hide task list" state; an open tooltip is rebuilt when its row's style changes; the More menu closes when the toolbar is hidden. The load-more footer has Angular's look: a bordered footer with a full-width button as tall as the toolbar controls (`--gantry-control-size`; the old one was 22 px, under WCAG 2.5.8), "Loading…" on the button while a page loads, the error message with Retry, and the done text in `div.gantt-load-done`.
  
  **Breaking**
  
  - Charts narrower than 640 px change by default: `responsive` (`{ breakpoint: 640, view: 'chart' }`) shows the timeline alone below the breakpoint (`getState().view` keeps the wide view), and `toolbar.overflow: 'menu'` moves the zoom levels, the views and Today into a More menu when the toolbar doesn't fit instead of wrapping. Set `responsive: false` and `toolbar: { overflow: 'wrap' }` for the previous layout.
  - A mouse press on a bar now focuses that bar instead of the timeline (a touch or pen drag too), without showing its focus ring; Escape during a press only cancels the press.
- 316c052: **`<gantry-element>`: keyboard, touch, zoom, chart states and accessibility.**
  
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
- c8b61c7: **Theming through CSS variables.** Every colour of the render model is now a `Paint`: a CSS colour
  value that is either a theme token (`var(--gantt-*)`) or an explicit task / option colour passed
  through as is. Both renderers apply paints as CSS properties, and the theme reaches the pixels only
  through custom properties. The resolved config no longer carries the theme.
  
  ### `@gantryjs/core` (breaking)
  
  - `resolveConfig(options, theme, i18n)` becomes `resolveConfig(options?, i18n?, metrics?)`, where
    `metrics` is `Partial<ThemeMetrics>` (pass `themeMetrics(theme)`; only `barRadius` is read, as the
    default `bar.radius`). `ResolvedGanttConfig.theme` is removed.
  - The resolved-colour fields are replaced by paints:
  
    | Removed                                             | Replacement                                                                  |
    | --------------------------------------------------- | ---------------------------------------------------------------------------- |
    | `BarVisual.fill`, `.label.color`, `.progress.color` | `BarVisual.paint.{body,label,progress}`, plus `BarVisual.tone`               |
    | `ArrowVisual.color`                                 | `ArrowVisual.paint`                                                          |
    | `TimeBand.color`                                    | `TimeBand.paint` (bands merge by kind and paint)                             |
    | `ResolvedLine.color`                                | `ResolvedLine.paint`                                                         |
    | `LegendItem.color`                                  | `LegendItem.paint`                                                           |
    | `CellVisual.dotColor`                               | `CellVisual.dotPaint`                                                        |
    | `statusColor(status, theme)`                        | `statusPaint(status)`                                                        |
    | `TooltipModel.colors`, `TooltipColors`              | `TooltipModel.critical` + `TooltipModel.paint.progress` (chrome: CSS tokens) |
  
  - No more theme inputs: `buildTooltipModel`'s `config` has no `theme`, `buildLegend` takes no
    `theme`, `computeCellVisual(col, row, ctx)` drops its fourth argument, and `computeTimeBands`
    reads no `cfg.theme`. `computeBarVisual` takes `fontPx` and `barTextColor` (the label colour on an
    explicit `task.barColor`, default `'#FFFFFF'`) from `themeMetrics(theme)`.
  - Bar labels on theme fills use the contrast tokens `--gantt-bar-text-on-bar`,
    `--gantt-bar-text-on-milestone` and `--gantt-bar-text-on-critical`
    (`readableOn(fill, barTextColor)`). A page-CSS override of `--gantt-bar`, `--gantt-milestone` or
    `--gantt-critical` must also set the matching token, or use `setTheme()`.
  - Custom renderers: get a concrete colour with `resolvePaint(paint, theme)` (it accepts the bar
    context's `ctx.theme`).
  - `annotationPaint()` gives `isToday` annotations the today colour (the Web Component used to ignore
    `isToday`; Angular already drew them in the today colour), so the line, its region and its legend
    swatch agree in both renderers.
  - New label `dragDelta(amount, unit)` (`'+3d'` / `'-2h'`), deprecated in the same release: the drag
    readout chip shows the move instead. Like the other new `GanttLabels` members, only objects typed as
    a full `GanttLabels` need it; `options.labels` stays partial.
  - New exports: `Paint`, `ThemeColorKey`, `themeVar`, `isThemeVar`, `resolvePaint`, `PAINTS`,
    `rowPaint`, `annotationPaint`, `statusPaint`, `themeToCss`, `CONTRAST_CSS_VARS`, `ThemeMetrics`,
    `themeMetrics`, `sameThemeMetrics`, `BarTone`, `BarPaint`, `TooltipPaint`, `headerCellBorder`,
    `buildArrowIndex` (`ArrowIndex`, `ArrowLink`), `computeDragGhostVisual` (`GhostVisual`,
    `GhostLabel`), `DRAG_SOURCE_OPACITY`, `quantizeNow`, `todayX`, `periodNext`,
    `VIEWPORT_FALLBACK_HEIGHT`.
  
  ```ts
  // before
  const cfg = resolveConfig(options, theme, i18n);
  bar.setAttribute('fill', visual.fill);
  // after
  const cfg = resolveConfig(options, i18n, themeMetrics(theme));
  bar.style.setProperty('fill', visual.paint.body); // or resolvePaint(visual.paint.body, theme)
  ```
  
  ### `@gantryjs/vanilla`
  
  - The theme variables live in a `:host` stylesheet inside the shadow root instead of the host's
    inline style: page CSS on `gantry-element` overrides them, and a string `style` attribute (for
    example Svelte's `style=`) or `setAttribute('style', …)` no longer wipes them.
  - With `darkMode: 'auto'`, an OS colour-scheme flip re-renders the chart at once.
  - Colours are set through the CSSOM, never as presentation attributes or style text, so a task
    colour such as `'red;background:url(x)'` can no longer inject CSS.
  - Custom `renderBar`: `ctx.visual.fill`, `ctx.visual.label.color` and `ctx.visual.progress.color`
    are gone; `ctx.visual.paint.{body,label,progress}` may be `var()` strings — apply them as style
    properties or resolve them with `resolvePaint(paint, ctx.theme)`. `ctx.theme` is the element's
    resolved theme.
  - The built-in bar a custom `renderBar` gets from `renderDefault()` paints with the `--gantt-*`
    variables, so it needs them in scope (inside the element or on an ancestor). The low-level painters
    (`paintBar`, `GanttCanvasProps`, `GanttTaskListProps`, …) are no longer exported (see the engine
    changeset).
  - `@gantryjs/react`, `@gantryjs/vue` and `@gantryjs/svelte` follow in the same release (fixed version
    group); no API change there.
  
  ### `@gantryjs/angular` (breaking)
  
  `@gantryjs/angular` re-exports `@gantryjs/core`, so every core change above reaches Angular users. In
  particular, **custom bars** registered with `provideGanttBar()` that read `ctx.visual.fill`,
  `ctx.visual.label.color` or `ctx.visual.progress.color` must switch to `ctx.visual.paint.body` /
  `.label` / `.progress`: bind them as styles (`[style.fill]="ctx.visual.paint.body"`) or resolve them
  to colours with `resolvePaint(paint, ctx.theme)`. Code calling `resolveConfig`, `statusColor` or
  reading `TooltipModel.colors` migrates as described in the `@gantryjs/core` section.
  
  - Paints are bound through `[style.fill]` / `[style.stroke]` / `[style.background-color]`. Page CSS
    that targeted SVG `fill` / `stroke` presentation attributes no longer applies; restyle through the
    `--gantt-*` tokens.
  - The theme service also writes the contrast tokens (`themeToCss`).
  - Header cell borders come from core (`headerCellBorder`).
  - The chart's resolved theme reaches custom bars as `ctx.theme`; the `resolveConfig` call site
    passes the theme metrics, so a colour-only theme change re-renders no geometry.
  - The task list, load-more footer and drag preview are painted with the chart's `--gantt-*` tokens
    (their `theme` inputs are gone in `@gantryjs/angular`, where these components are internal).
- c8b61c7: **Accessibility of `<gantry-element>`.** The host is a landmark region instead of a tab stop, and keyboard focus moves
  through the controls inside it.
  
  ### `@gantryjs/vanilla` (breaking)
  
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
    `aria-valuenow` (the panel width in px), `aria-valuemin` (0 when the panel is collapsible, else `panel.minWidth`) and
    `aria-valuemax` (the widest panel the splitter allows; core `splitterValue()`) moved to `.gantry-splitter-handle`,
    which covers the splitter box; the collapse toggle is its sibling, no longer nested inside the separator (whose
    children are presentational). `::part(splitter)` is still the box. Keyboard handling is unchanged.
  - **Live region.** A polite `.gantt-sr-live` (`role="status"`) announces changes of the number of selected tasks
    (`labels.announceSelection`) and the data source's load state (`labels.loading`, then `labels.announceLoaded(n)` or
    `labels.allLoaded(n)`); a failed page is still announced once in `.gantt-sr-alert`.
  - When the focused control disappears (its row was removed), focus goes to the timeline viewport (in the table view, to
    the task list's tab-stop row) instead of the host. A press on a bar focuses that bar.
  - The toolbar is named by `labels.ariaToolbar`.
  
  ### `@gantryjs/core`
  
  New labels in `GanttLabels` / `DEFAULT_LABELS`: `ariaToolbar` (`'Chart toolbar'`, the toolbar's accessible name) and
  `announceLoaded(count)` (`'20 tasks loaded'`, read when a data-source page loads and more remain). They are required
  members of `GanttLabels`: only objects typed as a full `GanttLabels` need them, `options.labels` stays partial.
  
  ### `@gantryjs/angular`
  
  The toolbar is named by `labels.ariaToolbar`, like the Web Component's.
- c8b61c7: New rendering engine for `<gantry-element>`: an in-house reactive graph (signals and computeds) drives one render per
  animation frame, so scrolling inside the overscan, re-assigning equal `options` or changing only theme colours no longer
  re-renders the chart.
  
  Breaking: the public surface is curated. `@gantryjs/vanilla` now exports only `GantryElement`, `GanttDataSource`, the
  tables `GANTRY_PROPERTIES` and `GANTRY_EVENTS`, the types `GantryProperties`, `GantryEventDetailMap`, `GantryEventMap`,
  `GantryEventCallbacks`, `GanttBarRenderer`, `GanttDataSourceConfig`, `VanillaColumnDef` and `VanillaCellTemplate`, and
  everything in `@gantryjs/core`; the engine behind the element is private.
  
  - Removed exports (internal services, state primitives and low-level painters): `createState`, `WritableState`,
    `EventEmitter`, `EventListenerCallback`, `BaseComponent`, `GanttThemeService`, `GanttI18nService`,
    `GanttVirtualScrollEngine`, `GanttLayoutService`, `SortState`, `GanttCanvasComponent`, `GanttCanvasProps`,
    `GanttScrollService`, `GanttColumnService`, `GanttHeaderComponent`, `GanttHeaderProps`, `GanttTaskListComponent`,
    `GanttTaskListProps`, `GanttLoadMoreState`, `SVG_NS`, `svgEl`, `paintBar`, `PaintBarOptions`, `paintArrow`,
    `GanttToolbarComponent`, `GanttToolbarProps`, `GanttDragService`, `DragState`, `GanttSelectionService`,
    `GanttTooltip`, `GanttTooltipContext`. A custom `renderBar` gets the built-in bar from its `renderDefault()`
    argument (instead of `paintBar()`); `LightTheme`, `DarkTheme`, `VirtualWindow`, `DragPreview` and the virtual-window
    math (`computeVirtualWindow`) still come from `@gantryjs/core`, re-exported here.
  - Removed element fields: `themeSvc`, `i18nSvc`, `colSvc`, `layout`, `scrollSvc`, `selSvc` and `dragSvc` (with their
    members, such as `colSvc.visibleColumns`, `colSvc.totalPanelWidth` and `layout.panelCollapsed`; the collapsed state
    is `el.view === 'chart'` or `getState().panelCollapsed`). The element has no public instance fields; its state is
    read through the properties and methods (`viewMode`, `view`, `criticalIds`, `getState()`, `getBarVisual()`, …).
    `GantryElement.observedAttributes` is typed `readonly string[]`.
  - New `resetTheme()`: drops the `setTheme()` / `patchTheme()` overrides (back to the light / dark base plus
    `options.theme`).
  - `package.json` declares `sideEffects`: only the files that register `<gantry-element>` (the bundle, and on the
    `@gantryjs/source` path the entry and the element module) count as having side effects, so a bare
    `import '@gantryjs/vanilla'` always defines the element.
  
  `view-mode-change` fires synchronously when the effective zoom level changes (an unknown level name now only reports
  the fallback level).
  
  Each region (toolbar, legend, header, bands and grid, rows, bars, arrows, overlay, task list) now re-renders on its
  own: a scroll repaints only the windowed rows, bars, arrows and task list, a selection only rows, bars and the task
  list. The timeline is one persistent `<svg>` with fixed layer groups. Sizes are read when the element connects and by
  a `ResizeObserver`, never during a render. A focused task-list row stays mounted (pinned) while it is scrolled out of
  view, so keyboard focus survives scrolling. `getBarVisual(id)` also answers for rows outside the rendered window. The
  hatch pattern id is unique per element (`gantt-hatch-<n>`).
  
  Keyed layers: bars, row backgrounds, arrows, task-list rows and cells, toolbar buttons and legend items keep their DOM
  nodes and are patched in place (a one-row scroll adds one bar and removes one). Timeline header cells, non-working
  bands and vertical grid lines are mounted only around the viewport (the viewport ± half its width, in 256 px chunks),
  so horizontal scrolling inside a chunk does no DOM work; `.g-header` keeps the full width, and code that queried every
  `.g-cell` or `.gantt-band` in the shadow root now sees only the mounted ones. Header cells are positioned through the
  `--x` / `--w` custom properties. A custom `renderBar` is called again only when its row's task, visual, selection,
  critical/baseline state, scale or theme changes. The drag ghost uses the shared core look (dashed outline at 35 %
  opacity) and the dragged bar is dimmed through a CSS style. The tooltip is one persistent
  popover (`role="tooltip"`) with `<dl>` rows written as text. Column resizing uses pointer capture (no `window` listeners).
  `@gantryjs/angular`, in the same release, windows its header, bands and grid lines the same way.
  
  Strict Content-Security-Policy and Trusted Types: the element works under `style-src 'self'` (no `'unsafe-inline'`),
  `script-src 'self'` (no eval) and `require-trusted-types-for 'script'; trusted-types 'none'`. Its CSS is one shared
  constructable stylesheet per document (built once, adopted by every instance) plus a per-instance theme sheet, both
  through `adoptedStyleSheets`; the shadow tree is built node by node (no HTML parsing), every style is a CSSOM property
  write, and the host gets no `style` attribute from the element. The resize cursor over a bar handle is now a
  `data-cursor` attribute on `.gantry-canvas-container` styled by the stylesheet (and shows over the bar as intended).
  Engines without constructable stylesheets (Safari < 16.4, Firefox < 101) fall back to a `<style>` element in the shadow
  root and the theme variables on the host's inline style: that fallback needs `style-src 'unsafe-inline'`, so a strict
  `style-src` requires constructable stylesheets.
  
  Properties and lifecycle: one property table drives the settable properties, their defaults, their attributes and
  `GANTRY_PROPERTIES` (same names, same order). Assigning `undefined` to a property restores its default (`el.options =
  undefined` brings back the default configuration; a removed attribute does the same). Properties set on an element
  before `<gantry-element>` was defined (an element created or parsed before the module loaded) are no longer shadowed:
  they are applied when the element upgrades. Everything the element starts while connected — effects, every DOM listener,
  the `ResizeObserver`, the clock, the colour-scheme listener and the data-source subscription — is released when it
  disconnects, a bar or splitter drag in progress ends (the splitter keeps and saves the width it reached) and a pending
  `state-change` is written at once. The element subscribes to a `GanttDataSource` instead of taking its `onChange`, so
  `onChange` stays yours and one source can feed several elements; a source set on a disconnected element starts loading
  when the element connects. A move with `moveBefore()` (`connectedMoveCallback`) keeps scroll, selection and focus; a
  move to another document re-adopts that document's stylesheets. The shadow root delegates focus (`delegatesFocus:
  true`): `el.focus()` and a click on a non-focusable part of the chart focus the first focusable control inside it.
  
  Custom Elements Manifest: the package ships `custom-elements.json` (the `customElements` field of `package.json`, also
  exported as `@gantryjs/vanilla/custom-elements.json`) describing the element's attributes, properties, methods, events
  with their detail types, CSS parts, custom states and the 42 `--gantt-*` CSS custom properties with their light-theme
  defaults, for IDEs, Storybook and linters. CI fails when it is stale and when `import '@gantryjs/vanilla'` grows past
  50 KB minified and gzipped (about 48 KB today, `@gantryjs/core` included).

### Minor Changes

- 2cf00e4: Fully configurable chart, rendered from one shared core model in every binding: N-tier header scales with custom formats (ISO / Sunday weeks, "W52", "4–11 Mar"…), zoom presets and an Hour view; period delimiters through header and body; weekends, holidays, working and intensive hours; bar / milestone / group / arrow sizing and styling; a resizable, collapsible task-list panel (30% by default, remembers its last width) with horizontal scroll, a split / table / chart view switch and persisted UI state (`stateKey`, `state-change`). Fixes time-zone and daylight-saving misalignment, header/row misalignment, label overflow and many smaller rendering bugs.
- 6522a87: Data sources share one framework-free loader (`PagedLoader` in `@gantryjs/core`): failed pages retry automatically with exponential backoff (`retries`, `retryDelay`), then show an error with a Retry button, emit `loadError` / `load-error` and pause until `retry()` — no more request storm. `reset()` replaces instead of duplicating, `initialPage` works (`0` = wait for `loadNext()`), and Angular's `GanttDataSource` gains `error()`, `nextPage()` and `retry()` and no longer needs an injection context. New labels `loadError` and `retry`.
- 6522a87: New `initialScroll` option: `'auto'` (default) centres today only when it is near the tasks and otherwise shows the earliest task, so the first view always has bars; also `'today'`, `'start'`, a `Date` or `false`. Zooming now keeps the date at the viewport centre in place, an earlier range start no longer shifts the view, and smooth scrolling honours `prefers-reduced-motion`.
- 2d41fde: **One change pipeline in `<gantry-element>`.** Every change to the tasks — a drag or resize, move mode, the API — is validated, offered as a cancelable `before-change` (`event.preventDefault()` or `detail.preventDefault()`), applied to `tasks` (or through `dataSource.patch()`), recorded for undo, then reported: the op events (`task-dragged`, `task-resized`, new `task-progress-changed`, `dependency-created`, `dependency-deleted`), `task-updated` per task, `tasks-change` and `history-change`. With `options.editing.controlled` nothing is applied (`tasks-change.applied: false`). Move mode changes the progress with ↑ / ↓ when `editing.progress` allows it.
  
  New methods `undo()`, `redo()`, `clearHistory()`, `addDependency()`, `removeDependency()`, `editCell()`, `focusTask()`, read-only `canUndo` / `canRedo`, the custom state `:state(linking)`, and the types `VanillaCellEditor` (`ColumnDef.editor`). `GANTRY_EVENTS` gains the seven new events (`onBeforeChange`, `onTasksChange`, `onTaskUpdated`, `onTaskProgressChanged`, `onDependencyCreated`, `onDependencyDeleted`, `onHistoryChange`).
  
  `updateTask()` / `appendTasks()` stay silent data writes but now write the raw input — into the `dataSource` (`patch`) when there is one, so the next page keeps them — instead of the normalised tasks, as Angular does.
  
  **Edit with the pointer in `<gantry-element>`** (with `options.editing`). The hovered bar, the one focused from the keyboard and, on touch screens, the selected bars now show a progress grip (`rect.gantt-progress-grip`) and two link connectors (`rect.gantt-link-connector`, with `--source` / `--target` / `--invalid` while a link is made). Drag the grip to change the progress (live fill, one `task-progress-changed` and one undo step on release). Drag from a connector to another bar to link them, or click (tap) a connector and then the target bar. Click a dependency arrow to select it (`dependencies.delete`). The cursor follows the part under the pointer (`ew-resize`, `crosshair`, `pointer` over an arrow). The progress grip and the connectors are hit only where they show, so a press inside a narrow bar still moves it.
  
  A bar can be dragged when its row's `editRules(row).move` allows it. A rolled-up parent (`rollup.dates`) and an `editable: false` task no longer start a drag or get `gantt-bar-draggable`. With `editing` off, the chart looks and behaves as before.
  
  **Draw and delete links in `<gantry-element>`** (`options.editing.dependencies`). Drag from a bar's connector to another bar, or click a connector then the target (also by touch), or press **L** on a bar, move to another with the arrow keys and press Enter: the type follows the ends (FS, SS, FF, SF), a dashed preview (`path.gantt-link-preview`) shows the way, and invalid targets (the same task, a duplicate, a loop, a parent ↔ child link) are marked and announced. Click an arrow (a 10 px band) to select it (`gantt-arrow--selected`), then Delete or Backspace removes it; Escape deselects. Every link change goes through the pipeline (`before-change`, `dependency-created` / `dependency-deleted`, undo).
  
  **Undo keys:** Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo while the chart keeps a history (`editing.history`), except in text entry, inside an open cell editor and in move mode, where the browser's own undo stays.
  
  **Cell editing in `<gantry-element>`** (`options.editing.cells`). F2, Enter, a double-click or typing a character opens a task-list cell's editor (name, start, end, duration, progress, predecessors, and custom columns with `editable`; a column's `editor` can be a built-in kind or a function returning a DOM node). Enter commits, Tab / Shift+Tab commit and edit the next / previous editable cell, Escape cancels, and leaving the cell commits a valid value. Each commit is one undoable `'cell'` change through the pipeline (`before-change` can veto it). An invalid value keeps the editor open with `aria-invalid`, the message under the cell and in the alert region. While cell editing is on, cells carry `aria-readonly`. `editCell()` opens an editor from code, also on a row scrolled out of view.
  
  **Undo and Redo in the toolbar of `<gantry-element>`.** While the chart keeps history (`options.editing` on, not controlled) and `toolbar.undo` is on (the default), the toolbar shows Undo and Redo icon buttons after the panel toggle; they are `aria-disabled` while there is nothing to undo or redo, stay in the toolbar's arrow-key set and never move into the More menu. Dragging a progress grip shows the new progress ("45%") in the readout chip.
  
  Forced colours (Windows High Contrast) cover the editing chrome: progress grip, link connectors, the link being drawn and the selected link in `Highlight`, invalid targets and an invalid cell editor dashed in `CanvasText`, the cell editor in `Field` / `FieldText`, and a disabled Undo / Redo in `GrayText`.
  
  `GanttDataSource.patch(update)` (`PagedLoader.patch` of `@gantryjs/core`) edits the loaded items without refetching, keeping the paging state: a page in flight is appended to the patched list and `reset()` drops the patch. Edits made on a chart with a `dataSource` go through it.
  
  **Review fixes.** Controlled and handled changes propose the app's own tasks; `tasks` returns the tasks as set (the chart's repairs stay inside it, as Angular's `series`), so `el.tasks = el.tasks.map(…)` never loses a `parentId`; Enter / F2 / L ending a click-mode link makes FS; an undo / redo step that validation rejects is dropped; keys typed right after the key that opens a cell editor reach it; the selected link clears when it disappears, doesn't flicker when clicked again and has a halo; the link preview follows a zoom; `focusTask()` shows the focus ring after a mouse click; a commit started from `editing.validate` is refused; a custom editor's context acts only on its own edit.
- d78716b: **`<gantry-element>` exports and prints the plan**: `exportSvg()`, `exportCsv()`, `exportPng()`, `download(format)` and `print()` (all async) draw every shown row from the chart's model, not from the painted DOM, and give the same SVG and CSV as `@gantryjs/angular`. `exportPng()` and `print()` reject with a `RangeError` past the canvas limits or `maxPages`. Their code is a lazy chunk loaded on the first export, so the element's entry bundle barely grows; the chart is read when the method is called, so `const p = el.exportCsv(); el.tasks = next;` exports the old tasks, and every method rejects if that code can't be loaded (offline after a deploy; the next call tries again). While `renderBar` is set, its nodes are serialized into images (attributes and inline styles; `customBars: 'builtin'` draws built-in bars instead) with core's markup rules (`sanitizeSvgMarkup`: no script, style, animation, event handler, remote link or `url(…)`).
  
  New events: the cancelable `before-export` (`event.preventDefault()` or `detail.preventDefault()`, synchronously) before a `download()` or `print()`, fired once the export code has loaded, then `export` with the file name and size or the page count (`onBeforeExport` / `onExport` in `GANTRY_EVENTS`). Downloads, announcements and failures: a temporary blob link in the shadow root (URL revoked after 30 s), "roadmap.svg is ready" / "Printing 3 pages" in the live region, a failed toolbar export in the alert region ("Couldn’t export the PNG image", "Couldn’t print the chart"). PNGs go through a canvas, prints through a hidden `about:blank` frame built with DOM APIs only (Trusted Types safe), cleaned up on `afterprint` or after 60 s; both need `img-src blob:` under a Content Security Policy.
  
  **Toolbar Export menu** (`toolbar.export`, default off): an Export menu button after the views opens a menu of `export.formats` (SVG image, PNG image, CSV table, Print…) with the More menu's keys and focus rules. Only one of the two menus is open at a time; when the toolbar is too narrow, the formats become a section of More. Choosing a format runs `download()` or `print()` with `trigger: 'toolbar'`.
  
  **`@media print` rules**: Ctrl+P prints the mounted chart without the toolbar, splitter, load-more footer, live regions, tooltip, readout, overlays and scrollbars, with exact colours (`print()` prints every row). In forced colours, the open More or Export button is shown in Highlight.
- ab1e292: `<gantry-element>` follows the `calendar` option: the Duration column, tooltip, readout, cells, CSV and the critical path read working time, a working move or keyboard step is one `task-dragged`, and a zoom, label or theme change keeps the critical path, rollups and cell context (the date reading compares by value).
- b4636c8: `<gantry-element>` shows the resource view: the new `resources` property (people and teams), `options.rows: 'resources'` and the toolbar's rows toggle (`toolbar.rowsToggle`) give one row per resource, team and Unassigned with its daily load against its capacity (`g.gantt-load`, the part above it hatched with the new `--gantt-overallocated` CSS property), a tooltip with the day's load and tasks (mouse and pen), the Resources, Capacity and Peak load columns, the exports, and an editable Resources cell. `getState()` and `state-change` always carry `rows`. Tasks mode (`rows` unset) draws and exports exactly as before.
- cdcf5cd: `ViewMode`, `DependencyType` and `TaskType` are now `as const` objects with a same-name union type (no TS enums): `ViewMode.Week` reads the same and plain strings are accepted. Optional properties of the public types accept `undefined` explicitly, so projects using `exactOptionalPropertyTypes` can pass `undefined`. `@gantryjs/angular` declares `"type": "module"`. Task-list rows can be focused and selected with Enter / Space.
  
  New `GanttThemeOverrides` type for `options.theme`, `setTheme()` and `patchTheme()`: any token may be `undefined` (keeps the built-in value).
- 6522a87: Split panel vs table view: the panel next to the timeline shows `name`, `start`, `end`, `progress`; the table view shows type, a derived status (with a coloured dot), duration, predecessors and, with `baseline`, baseline start/end and variance. `panel.columns` / `table.columns` pick columns by key (built-ins need no definition), `setColumnVisible(key, visible, view)` works per view, sorting reorders siblings at every tree level, and custom columns get `sortValue` and a `ColumnContext`. Visible changes: the default panel drops Duration; Duration reads the drawn span (one day longer with `endDateMode: 'inclusive'`); code building a full `GanttLabels` object needs the new keys.

### Patch Changes

- 6522a87: Angular: bars follow their rows after collapse / sort, `selectionChange` is emitted for every selection (task list, keyboard, API), Ctrl/Cmd+A selects all visible rows and honours `enableSelection` / `multiSelect`. Shortcuts are ignored while typing in inputs or `contenteditable` cells. The resolved config gains `selection: { enabled, multi }`.
- 7bf8c1b: **Readable current-period label, themable progress overlay, shared binding helpers.**
  
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
- d2e5d4c: Bug fixes: tasks with a `null`, empty, unknown or cyclic `parentId` no longer disappear and a task without `end` no longer breaks the date columns (new `normalizeTasks()`); the critical path reads dates like the bars (`endDateMode: 'inclusive'` counts the last day, hour-level tasks use fractional days); column sorting is linear-time.
- 7bf8c1b: **One task-list markup for both renderers.** `<gantry-element>` and `<gantry>` render the task list
  with the same elements, classes and colours:
  
  - Every inner span has a class: the header label `gantt-tl-ellipsis`, the sort icon
    `gantt-tl-sort-icon` (`gantt-tl-sort-icon--active` on the sorted column), and the name cell
    `span.gantt-tl-name` > `button.gantt-collapse-btn` | `span.gantt-tl-indent` · `span.gantt-tl-icon` ·
    `span.gantt-tl-ellipsis`. Text colours, sizes and weights are stylesheet rules on the theme tokens:
    header labels and group names `--gantt-text` (groups 600), leaf names and cell texts
    `--gantt-text-sec`, sort and task icons `--gantt-text-muted` (an active sort icon `--gantt-text`).
    Only a task's `barColor` stays an inline colour, on its icon.
  - The column resize handle lies inside its header cell (`right: 0`): all 6 px can be grabbed (the
    header cell clipped half of it before).
  - `@gantryjs/vanilla`: cell texts use the secondary text colour (`--gantt-text-sec`, was `--gantt-text`),
    the collapse toggle is a 24 × 24 px target (WCAG 2.5.8; it was 20 px wide) and leaf names are
    indented to match (4 px more), and rows with children get the class `gantt-tl-row--group`, as in Angular.
  - `@gantryjs/angular`: the toolbar group that holds `[ganttToolbar]` content has the classes
    `gantt-tb-slot gantt-tb-group` (in that order; was `gantt-tb-group gantt-tb-slot`), and the task-list
    `grid-template-columns` comes from `columnsGridTemplate()` in `@gantryjs/core`.
- 6522a87: Web Component: focus stays on toolbar buttons, sort headers and collapse toggles across re-renders; bands and vertical grid lines are built once per timeline instead of on every scroll frame (Angular draws them full height too, so scrolling no longer rewrites them); a pending state save is written on disconnect and the data source re-syncs on reconnect.
- Updated dependencies [639ad08]
- Updated dependencies [6522a87]
- Updated dependencies [2cf00e4]
- Updated dependencies [7bf8c1b]
- Updated dependencies [1cedb3f]
- Updated dependencies [6522a87]
- Updated dependencies [6522a87]
- Updated dependencies [6522a87]
- Updated dependencies [19d6e62]
- Updated dependencies [d2e5d4c]
- Updated dependencies [8891728]
- Updated dependencies [2d41fde]
- Updated dependencies [d78716b]
- Updated dependencies [ab1e292]
- Updated dependencies [b4636c8]
- Updated dependencies [316c052]
- Updated dependencies [cdcf5cd]
- Updated dependencies [6522a87]
- Updated dependencies [c8b61c7]
- Updated dependencies [c8b61c7]
  - @gantryjs/core@2.0.0
