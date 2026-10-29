# @gantryjs/core

## 2.0.0

### Major Changes

- 639ad08: Accessible default palette (WCAG 2.2 AA): bar labels reach 4.5:1 and bars, markers and arrows 3:1. Labels inside bars switch to a readable colour on custom `barColor`s (`contrastRatio()`, `readableOn()`). The previous colours are exported as `LegacyLightTheme` / `LegacyDarkTheme`.
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
- 8891728: **Phase 10 options and types.** New options with their `resolveConfig()` defaults (unset, the chart renders as before, except below 640 px wide: `responsive` and `toolbar.overflow` are on by default, see the bindings' breaking notes): `density` (`'normal'`; `DENSITY_METRICS`: compact rows 28 / tiers 28·24 / 28 px controls, normal 36 / 32·28 / 32, comfortable 44 / 36·32 / 36; an explicit `rowHeight`, `headerHeight` or `subHeaderHeight` wins), `responsive` (`{ breakpoint: 640, view: 'chart' }`, `false` turns it off), `weekNumbering` (`'iso' | 'us' | 'locale'`; unset: `'us'` when `weekStart` is 0, otherwise `'iso'`), `styles` (kind, parent, level and rule layers), `rollup` (`false`; `true` = `{ progress: 'duration', dates: true, color: false, segments: false }`), `arrows.routing` (`'orthogonal'`), `toolbar.panelToggle` (`false`), `toolbar.overflow` (`'menu'`), `groupBar.collapsed` (`false`) and `formats.readoutFormat`. `GanttTask.style` (`GanttTaskStyle`) replaces the flat `barColor`, `rowColor`, `textColor`, `progressColor` and `className`, which stay as `@deprecated` aliases. New `resolveBarHeight()`.
  
  **Task styles.** `createStyleResolver({ config, critical, rollups, now })` resolves each row's `ResolvedTaskStyle` (memoised per row object) field by field: theme < `styles.task` / `group` / `milestone` (by bar kind) < `styles.parent` < `styles.levels[depth]` < the rolled-up colour < `styles.rule(row, ctx)` < the deprecated flat fields < `task.style`. `className` accumulates across layers, each class once, and the critical path still paints its own fill. `computeBarVisual({ …, style, segments })` takes the fill, progress and label colours, the height (a milestone's size), the corner radius, the label position and the classes from the style, and carries rollup segments clipped to the bar. `rowPaint(geo, selected, style)` and `buildTooltipModel({ …, style })` read the same style. Without a style they use the task's own (`taskOwnStyle`: the flat fields under `task.style`), so existing charts render as before. New `taskOwnStyle()` and `EMPTY_TASK_STYLE`.
  
  **Rollup of parent rows.** `computeRollups(tasks, config.rollup, { now, dates })` rolls each parent's progress (duration-weighted mean of its direct children, milestones weigh 0; `'count'` = plain mean; whole percent), dates (earliest child start, latest child end as drawn), summary status at `now` and colour (`'status'` through `statusPaint`, or a callback) up from its children, bottom-up in O(n). `applyRollups(rows, rollups, config.rollup)` gives the parent rows a copy of their task with those values (`draggable: false` when dates are rolled up), so columns, tooltips, names and custom bars agree; raw tasks are untouched and `rollupSource(task)` maps a copy back. `rollupSegments(info, { toX, cfg, styleOf, bar })` places a collapsed parent's children inside its bar (`rollup.segments`). `seedCollapsed(tasks, seen, collapseGroups)` also collapses new parent ids with `groupBar.collapsed` (an explicit `task.collapsed: false` keeps one expanded).
  
  **Synchronised charts.** `createGanttSyncGroup({ zoom, scroll, range, panel })` (each `true` by default) shares the timeline range, the zoom level, the horizontal scroll and the panel width between the charts that join it: range and task extent are unions over the members (a member that leaves shrinks them), level, scroll and panel width are last-writer-wins and go to every member but the one that reported them; `join` sends the current state, `setLevel()` / `scrollTo()` drive every member. No timers, no DOM. `createEchoGuard()` (and `SYNC_ECHO_TOLERANCE`, 1 px) tells a member's own programmatic scroll apart from a user scroll. New `timelineRange({ tasks, config, now })` returns a chart's natural range (padded, snapped) and task extent. `buildTimeline({ shared })` starts at the earlier and ends at the later of its own and the shared range, so charts with the same scale place every date at the same x; `TimelineModel` gains `range` (the natural range, before the shared range and the viewport fill) and `sharedExtent` (what "fit to screen" fits inside a group). `buildTimeline` passes the resolved week rule to the header formats.
  
  **Week numbering.** New week rules `ISO_WEEK`, `US_WEEK`, `localeWeekRule()` and `resolveWeek()`, and `weekOfYear(date, rule)` / `weekYear(date, rule)`, which number weeks under any `WeekRule` the way CLDR and `Intl.Locale#getWeekInfo()` define it: weeks start on `firstDay`, and week 1 is the first week holding `minimalDays` days of the year. `weekNumber(date, week)` takes a `WeekStart` or a `WeekRule`. The `WEEK_FORMATS` labels follow the chart's rule (`ScaleFormatContext.week`, which comes from `weekNumbering` and `weekStart`), and week cells start on Sunday, Monday or Saturday. Charts that set neither option keep their ISO weeks.
  
  **Responsive view, toolbar overflow and the More menu.** `isNarrow()`, `reduceResponsive()` and `persistedView()` switch a chart narrower than `responsive.breakpoint` to `responsive.view`; a view the user picks while narrow wins until the width crosses back, and the forced view is never persisted. `buildToolbar()` adds the `panel` group first with `toolbar.panelToggle` (an `aria-pressed` button, new action `togglePanel`), and `layoutToolbar()` fits the groups to the measured width with `estimateToolbarWidth()`: with `toolbar.overflow: 'menu'` it moves the zoom levels, then the views, then today into a More menu (`ToolbarMenuSection`, `toolbarMenuItems()`, `toolbarMenuChecked()`), driven by `reduceMenu()` and `toolbarMenuKey()` (WAI-ARIA menu button). New icons `panel` and `more`, constants `TOOLBAR_FONT_PX` and `TOOLBAR_OVERFLOW_ORDER`. A toolbar that fits renders as before.
  
  **Straight links, layout variables, annotation label offset.** `arrows.routing: 'straight'` draws each dependency as one line from the exit edge to the entry edge, with the head rotated along it and the lag label next to the midpoint, on the side the line leaves free; `'orthogonal'` (the default) is unchanged. `layoutCssVars(cfg)` returns the read-only `--gantt-row-height` and `--gantt-bar-height` of a resolved config (default `36px` and `21.6px`). `AnnotationLabel.offsetY` now moves the canvas annotation label down (positive) or up (negative).
  
  **`PagedLoader.subscribe` is bound** to its loader, so it can be passed on as is (React's `useSyncExternalStore(source.subscribe, …)`).
  
  **`nonWorkingTime.style: 'disabled'` greys out** weekends, holidays without their own colour and off-hours in one neutral grey (`borderColor`, `--gantt-border`); it used to render exactly like `'shade'`.
  
  **Review fixes.** `computeDragGhostVisual()` takes the row's resolved style (optional last parameter), so the ghost has the styled height and corner radius. New `taskListShown(view)` / `togglePanelView(view)` (the panel toggle and `togglePanel()`: hiding the task list from the table view goes to the chart view), `sameTaskStyle(a, b)` (field-by-field style equality, for refresh keys). `ResponsiveState` gains `shown`: `reduceResponsive()` now also handles a view changed while narrow, so the bindings keep no view of their own.
  
  **Breaking**
  
  - `WeekStart` is `0 | 1 | 6` (Saturday added) in `GanttOptions.weekStart`, `ScaleFormatContext.weekStart`, `ResolvedGanttConfig.weekStart`, `unitStart`, `snapRange`, `snapToUnit`, `weekNumber` and `unitBoundaries`. `ScaleFormatContext` gains the required `week: WeekRule`, so contexts built by hand need it.
  - With `weekStart: 0` (US numbering), the December days of the week that holds January 1 are now week 1 of the new year. For example, the header cell for Sunday 27 December 2026 reads `W1`; before, it read `W53` (or `W54`), and the next cell jumped to `W2`. `weekNumber(date, 0)` changes on the same days. `weekNumber(date, 6)` used the Sunday formula; it now numbers weeks from Saturday, with week 1 holding 4 days of the year (the rule `weekStart: 6` alone gives).
  - `GanttBarContext` gains the required `style: ResolvedTaskStyle`; `BarVisual` gains the required `className` and `segments` (objects built by hand need them). `BarVisual` fills `className` (the style's classes, `null` when there are none) and `segments`.
  - `TimelineModel` gains the required `range` and `sharedExtent` (objects built by hand need them).
  - `ResolvedGanttConfig` gains `density`, `controlSize`, `responsive`, `week`, `styles` and `rollup`, `arrows.routing` and `groupBar.collapsed`; `ResolvedToolbar` gains `panelToggle` and `overflow` (objects typed as these need the new fields).
  - `ToolbarItem` gains the required `pressed`, `haspopup` and `expanded`, `ToolbarAction` gains `togglePanel` and `menu`, `ToolbarGroupKey` gains `panel` and `more`, `ToolbarIcon` gains `panel` and `more` (`TOOLBAR_ICONS` has 9 icons), `ToolbarLabels` also picks `ariaTaskList`, `showPanel`, `hidePanel` and `more`, and `ResponsiveState` gains `wideView`.
  - New theme key `rowHoverBg` (`--gantt-row-hover-bg`, last in `THEME_CSS_VARS`: 40 theme tokens, `themeToCss()` writes 44 properties). New `GanttLabels` member `more` (`'More'`): only objects typed as a full `GanttLabels` need it, `options.labels` stays partial.
  - The demo data (`@gantryjs/core/demo`) sets its colours with `style.color` instead of `barColor`: code that reads `barColor` from `DEMO_TASKS` gets `undefined`.
  - The drag ghost no longer draws its own "+3d" movement label, because the drag readout chip shows the move. `computeDragGhostVisual()` always returns `label: null` and no longer reads `labels.dragDelta`. `GhostVisual.label` and `GhostLabel` keep their types.
- 2d41fde: **Phase 11 editing contract.** New option `editing` (default `false`; `true` or an object turns on cells, the progress grip, link create / delete and undo / redo history; `controlled` keeps no history), resolved by `resolveEditing()` into `ResolvedGanttConfig.editing`, and `toolbar.undo` (default `true`). New types for the change pipeline and its events (`GanttChange`, `GanttTaskUpdate`, `GanttChangeOp`, `GanttBeforeChangeEvent`, `GanttTasksChangeEvent`, `TaskUpdatedEvent`, `GanttHistoryState`, `GanttEditingOptions`), `GanttTask.editable`, editable columns (`ColumnDef.editable` / `editor` / `editorOptions` / `exportValue` / `parse` / `validate`, `CellEditorContext`), the shared `editTiming()` and `resizeEdge()`, and and the editing modules (changes, pipeline, history, validation, permissions, parsing, cells, sessions, bar overlay, link preview) described below.
  
  **Change pipeline.** Every edit is one `GanttChange`: build it with `taskChange()`, `dragChange()`, `progressChange()` or `linkChange()` (field-level `before` / `after`, ops derived from the field diff by `deriveOps()`: a date typed in a cell fires the same `task-dragged` as a drag), apply it with `applyChange()` (untouched tasks keep their identity), undo it with `invertChange()` (the data shape is restored: a string `dependency` stays a string), and coalesce with `mergeChanges()`; `isEmptyChange()`, `applicableChange()` (skip deleted tasks on undo) and `changeTaskIds()` help. `prepareChange()` validates a change and returns the proposed tasks, the events in order (one per op, then `task-updated` per task) and the announcement, or the rejection code and message; `createBeforeChangeDetail()` builds the vetoable `before-change` detail. `describeChange()` / `fieldLabel()` put a change into words from the labels.
  
  **Editing: validation and permissions.** `validateChange()` runs the built-in checks every change passes, whatever its source: a self link, a missing task, a duplicate link (any type between the same two tasks), a link between a task and its own ancestor or descendant (unless `editing.dependencies.parentChild`), a cycle (iterative, O(V + E): 10 000 tasks in well under 20 ms), an end before its start, progress outside 0–100, and read-only tasks and fields (`editable: false`, the dates of `draggable: false` tasks, rolled-up parent dates / progress, the `id`). Then it runs `editing.validate`. `linkError()` and `wouldCreateCycle()` give the same answers for one link.
  
  `editRules(row)` is the single rule set for what a row allows (move, resize, progress, link from / to, cells). `cellEditable()` decides each cell: the built-in `name`, `start`, `end`, `duration`, `progress` and `predecessors` columns, or your own columns over those keys, plus any column with `editable` set.
  
  **Cell editing in core.** `resolveCellEditor()` gives each editable cell its editor (built-in by column key: name, start / end as `date` or `datetime-local` with the start keeping the duration, duration, progress 0–100, predecessors; custom columns write `task[key]` or `data[key]`), `commitCellValue()` parses and validates the typed text into a patch or a localized error, and `reduceCellEdit()` / `cellEditKey()` are the shared edit state and keys (F2 / Enter, typing, Enter, Tab / Shift+Tab, Escape). The parsers behind them: `parsePredecessors()` / `formatPredecessors()` (`research FS+2d; scope SS`, ids or unique names), `parseDuration()` / `formatDurationInput()` / `endForDuration()` (`5d`, `2w`, `4h`, `1.5d`), `formatDateInput()` / `parseDateInput()` (UTC date-only values stay date-only).
  
  **Editing geometry.** `computeBarVisual` fills `progressGrip` (with `progressEditable`, when the bar leaves room) and `connectors` (with `linkable`): every target at least 24 px both ways, disjoint and inside its row; `hitTestBar` returns them in the order resize > progress > connectors > body (`editTargets: false` skips them). New `computeBarOverlay` (the ring, grips, progress grip and connectors both bindings paint; without editing exactly the ring and grips of before), `ArrowVisual.points` with `hitTestArrow`, `arrowAt` and `selectedArrowVisual`, `linkPreviewPath` and `formatProgressReadout`. `BarOverlayLink` gains `sourceSide`.
  
  **Editing sessions, the toolbar's history group and move-mode commits.** `ProgressSession` (the progress grip: snapped to `editing.progress.step`, clamped to 0–100, a drag back to the start changes nothing) and `LinkSession` (drag from a connector, click a connector then a bar, or L then Enter; the type comes from the ends via `inferLinkType`, the target side from `linkTargetSide`; invalid targets carry `linkError`'s reason; `finish()` returns the `linkChange`). `buildToolbar` adds `div.gantt-tb-group.gantt-tb-history` (Undo, Redo, `aria-disabled` while unavailable, new icons) after the panel toggle when `toolbar.undo` is on and a `history` state is passed; it never moves into the More menu, and `toolbarTabStop` now skips disabled controls. `keyboardEditChange(session, task)` turns a move-mode edit into one `GanttChange` (source `'keyboard'`, coalesce key `kbd:<id>`); `keyboardEditOptionsFor(rules, editing)` and `keyboardEditStartText()` build move mode from `editRules`.
  
  **Undo history and data-source patches.** `GanttHistory` is implemented: undo / redo stacks of applied `GanttChange`s (`limit` 100 steps, the oldest dropped first), recording clears redo, and consecutive changes with the same `coalesceKey` less than `coalesceMs` (800 ms) apart merge into one step (a merge back to the start removes the step). Undo and redo are two calls (`peekUndo()` / `peekRedo()`, then `commitUndo()` / `commitRedo()`), plus `drop()`, `clear()`, `configure()` and `state` (`GanttHistoryState`, the same object until a value changes), so apps in controlled mode can build their own undo.
  
  New `PagedLoader.patch(update)`: edits the loaded items without refetching, keeping the paging state; a page in flight is appended to the patched list and `reset()` drops the patch (`GanttDataSource.patch` of `<gantry-element>` and `@gantryjs/angular` wrap it).
  
  **Breaking:** `TaskResizeEvent` gains the required `edge: 'start' | 'end'` (`handle` is deprecated); `BarHit` adds `'progress' | 'link-start' | 'link-end'`; `BarVisual` gains `progressGrip` and `connectors`, `ArrowVisual` `points` and `selected`, `ToolbarItem` `disabled`, `ResolvedToolbar` `undo` (objects built by hand need them); `ToolbarIcon`, `ToolbarAction` and `ToolbarGroupKey` gain the undo / redo members; `TaskProgressEvent` moved to the shared types. `GanttLabels` gains 24 required labels (`undo`, `redo`, `ariaCellEditor`, `announceEditProgressHelp`, `announceLinkSelected`, `announceLinkDeleted`, `announceUndo`, `announceRedo`, `announceChangeRejected`, `describeEdit` and the `error*` messages): `options.labels` stays partial, but objects typed as a full `GanttLabels` need them. `ToolbarLabels` gains `undo` and `redo` (objects typed by hand need them), and `BarOverlayLink` gains the required `sourceSide`.
  
  **Review fixes.** `prepareChange` takes the app's tasks (`raw`) and returns `rawProposed`, so change events carry the app's own objects (validation still reads the repaired tasks). The predecessors cell is editable with `editing.dependencies.create` or `delete`, and a cell edit adds or removes links only with that right (new required labels `errorLinkCreate`, `errorLinkDelete`). `LinkSession.hover(…, by)` (`'key'` links to the target's start), `linkEndPoint`, `linkPreviewPathOf`. `ArrowVisual.halo` (required, `null` unless selected), `SELECTED_ARROW_HALO` / `SELECTED_ARROW_HALO_OPACITY`: the selected link has a focus-ring halo.
- d78716b: **Export and print contract.** New option `export` (`fileName`, default `'gantt'` or a function of the format; `formats`, the toolbar menu's items, default `['svg', 'png', 'csv', 'print']`; and the `svg` / `png` / `csv` / `print` defaults: `GanttSvgExportOptions`, `GanttPngExportOptions`, `GanttCsvExportOptions`, `GanttPrintOptions`), resolved into `ResolvedGanttConfig.export` by `resolveExport()` / `resolveExportFormat()`, and `toolbar.export` (default `false`). New types `GanttExportFormat`, `GanttExportTrigger`, `GanttImageExportOptions`, `GanttPaperSize`, `GanttFileOptions` and the event details `GanttBeforeExportEvent` (cancelable: `preventDefault()`) and `GanttExportEvent` (`{ format, trigger, fileName, size, pages }`).
  
  **Exports are drawn from the model, not the DOM**, by pure functions that also run in Node, workers and SSR. `createExportSource({ tasks, options, … })` builds a chart snapshot without a binding (the Web Component's rows pipeline: collapse seeding, sort, rollups, critical path, columns at their widths; `exportTheme` / `exportTimeline` pick the palette — `'current'`, `'light'` or `'dark'` with the chart's overrides — and the range: `'all'`, `'visible'`, or dates that extend the timeline then clip it). `buildExportModel` lays out the whole drawing with every colour resolved: the task list (`buildTablePart`: widths, flex column, indent, chevrons, icons, status dots, fitted texts, a template column's `exportValue`), the header tiers with fitted labels and the marker lane (`buildTimelinePart`), bands, grid lines, annotations, today, arrows, bars (custom bar markup inlined), the legend strip (`buildLegendPart`, wrapped; `ExportLegendOptions.title` / `locale`, `EXPORT_LEGEND.border`) and the empty state. Helpers for the bindings: `exportColumnCatalogue`, `exportSegments`, `exportBodyHeight`, `EXPORT_EMPTY_ROWS`, and `headerCellStroke` (a header cell's border as a line; `headerCellBorder` is built on it, same strings).
  
  **SVG**: `exportChartSvg(source, options?)` writes one portable image — presentation attributes only (no `var(`, no `<style>`, no `foreignObject`, no script), `role="img"` with `<title>`, `<desc>` and `lang`, every text a `<text>`, `data-task-id` on rows and bars, ids under `idPrefix` (default `gantry-export-<n>`), numbers rounded to 2 decimals. `renderExportSvg(model, slice, opts)` writes a model or one printed page of it; `escapeXml`, `stripInvalidXml` and `inlineThemeVars` (theme values escaped) are its XML helpers. Custom bar markup goes through `sanitizeSvgMarkup`, the rules the bindings' serializers share: SVG drawing elements only (no `script`, `style`, `foreignObject`, SMIL animation, `metadata`, HTML or other namespace — prefixed or unclosed ones included), no `on*` / `tabindex` / `autofocus`, no `javascript:` / `vbscript:` / `data:` URL (character references decoded; raster `data:image/*` allowed), no `href` but a `#fragment` or such an image, no `url(…)` but `url(#…)`; the markup is rebuilt well-formed. With a `range`, `ExportTimeline.bars` leaves out the bars the range doesn't reach (no `customBar` call for them); `ExportMarker.kind` is required.
  
  **Print**: `paginateChart` (paper `a4` / `a3` / `letter` / `legal` / `tabloid` or a custom size, orientation incl. `'auto'`, `fit` `'width'` / `'page'` / `'none'` with `minScale`; breaks only between rows, horizontal breaks snapped to a bottom-tier cell; pages down then across; header and task list repeated — the task list only while it takes at most half the page width; the legend on the first column's last page, wrapped at that page's width (`legendAtWidth`, from `ExportLegend.layout`); a footer "Title · Page n of N"; the task list never cut; `RangeError` over `maxPages`, default 200, and when the margin leaves no room on the paper — twice the margin at least its shorter side; `resolveConfig` / `resolveExportFormat` keep the default for such a margin as for a negative one), `paperSizePx`, `printCss` (`@page` size and margin) and `exportChartPages` (one SVG per page with its alt text).
  
  **CSV**: `exportChartCsv(source, options?)` writes RFC 4180 text (CRLF, `,` / `;` / tab, quoting) over the shown view's columns, every column or a list of keys, for every loaded task (collapsed children included) or the shown rows; values are data (local ISO dates, numbers, status and type keys, predecessor ids) or the cell texts, and a column's `exportValue` wins in both. A key no column has that is a raw task field (`parentId`, `dependency`, `collapsed`, `barType`, `status`…) exports the field as stored, under the key, so a CSV can carry the tree. Cells — header cells too — starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'` (CSV injection) unless they are plain numbers (`neutralizeFormulas`, default on; `neutralizeFormula`, `isPlainNumber`, `csvField`, `csvCellValue`).
  
  **Files and PNG**: `sanitizeFileName` / `exportFileName` (names safe on every OS, extension added), `resolveExportCall` (a call's options over `export.<format>`), `createBeforeExportDetail`, `exportFileText` (the SVG file's XML declaration, the CSV file's byte order mark), `EXPORT_MIME`, `DOWNLOAD_REVOKE_MS`, and `planRaster` (the largest PNG scale within `maxSide` 16 384 / `maxPixels` 16 777 216, `RangeError` below actual size).
  
  **Toolbar**: `buildToolbar` adds an Export menu button after the views with one item per `export.formats` entry (none: no group); `layoutToolbar` takes `exportMenuOpen`, returns the menu as `ToolbarLayout.exportMenu` (`exportMenuSections`) and moves the export group into More first (`TOOLBAR_OVERFLOW_ORDER` starts with `'export'`), where its formats become a section named `labels.exportMenu`, never a nested menu. With `toolbar.export` off the toolbar model is unchanged.
  
  **Breaking** for code that builds full objects: `GanttLabels` has 11 new required labels (`exportMenu`, `exportSvg`, `exportPng`, `exportCsv`, `exportPrint`, `exportDescription`, `printPage`, `announceExportReady`, `announcePrintReady`, `announceExportFailed`, `announcePrintFailed`; `options.labels` stays partial) and `ToolbarLabels` 5 (`exportMenu`, `exportSvg`, `exportPng`, `exportCsv`, `exportPrint`); `ResolvedGanttConfig.export`, `ResolvedToolbar.export`, `ToolbarGroup.menu` and `ToolbarLayout.exportMenu` are required; `ToolbarIcon`, `ToolbarAction` and `ToolbarGroupKey` gained export members (exhaustive switches need the new cases).
  
  `@gantryjs/core` is published one file per module (it was one bundle), so a bundler keeps what an app never imports out of its entry: `<gantry-element>` loads the export code only on its first export.
- ab1e292: Working calendar: the new `calendar` option (`durations`, `unit`, `skipNonWorking`, `hoursPerDay`) makes the weekends, holidays and working hours of `nonWorkingTime` drive the arithmetic as well as the shading. With a calendar the Duration and Variance columns, the tooltip, the drag readout, the duration and predecessor cells (`5d`, `1.5d`, `12h`, `2w` in working units), the CSV `duration` / `variance` values, the rollup progress weights and the critical path with its lags and float count working time. Drags, resizes, move mode and the start, end and duration cells keep a task's working length and snap starts forward and ends back off non-working time (`skipNonWorking`); a working move is one `move` op, so one `task-dragged`, and `editing.validate` gets `ctx.calendar`. Unset, everything is unchanged. Also `nonWorkingTime.style: 'none'` (no weekend, holiday or off-hours band) and, with `unit: 'hour'`, the default 09:00–17:00 hours.
  
  New API: `createWorkingCalendar()` and `WorkingCalendar` (O(log H) in the holidays; `buildWorkingCalendar()` is the same from a resolved `nonWorkingTime`), `formatDuration()`, `formatFloat()`, `taskDuration()`, `spanDuration()`, `measureBetween()`, `measureVariance()`, `addDuration()`, `snapTaskStart()`, `snapTaskEnd()`, `followTaskEnd()`, `taskDateLike()`, `editCalendar()` / `EditCalendar` (the editing rules the bindings' sessions carry), `dateShiftDays()`, `dateReadingOf()` / `sameDateReading()` (`DateReading`), `DEFAULT_WORKING_HOURS`, `DEFAULT_HOURS_PER_DAY`, the option types `GanttCalendarOptions`, `GanttDurationMode`, `GanttCalendarUnit` and `ResolvedCalendar`, and the helpers the durations are built from: `measuresWorkingTime()`, `durationFactor()` (working units in one measured day: 1, or `hoursPerDay` for working hours), `addDayAmount()` (a date plus a fractional amount of calendar days) and the `DurationLabels` type. Call `computeCriticalPath(tasks, resolveConfig(options))` for a path in working time (`CPMResult.durations`); `parseDuration()`, `formatPredecessors()`, `deriveOps()`, `dragChange()`, `taskChange()` and `buildColumnContext()` take the chart's config as an optional `dates` / `config`.
  
  **Breaking**: `GanttLabels` gains the required `durationHours` and `ttFloatHours` (objects typed as a full `GanttLabels` need them; `options.labels` stays partial), and so do the `Pick`s of it that other helpers take: `DragReadoutLabels` (`formatDragReadout()`, required `durationHours`) and `TooltipExtraLabels` (`DEFAULT_TOOLTIP_LABELS`, required `ttFloatHours`); `ResolvedGanttConfig.calendar` is required (`null` while unset), `ResolvedNonWorking.style` gains `'none'`, and `CPMResult.durations` is required.
- b4636c8: Resource view: the `GanttResource` model (`id`, `name`, `capacity` in percent of one person's time per working day, `group` for a team, `color`, `data`), `GanttTask.resources` (`GanttAssignment`: a resource id, or `{ resourceId, units }` with the percent of a full-time person the task needs per working day) and the options `rows: 'tasks' | 'resources'` (`GanttRowsMode`; `GanttState.rows` keeps it, the state version stays 2), `resourceView` (`GanttResourceViewOptions`: `unassigned`, `overallocation`, `rowHeight`) and `toolbar.rowsToggle`. `rows: 'resources'` shows one read-only row per resource, per team (resources sharing a `group`, adding up their load and capacity) and an Unassigned row, each drawing its daily load against its capacity with the part above it hatched in the new `overallocatedColor` theme token (CSS variable `--gantt-overallocated`; `#C2410C` light, `#FB923C` dark; at least 3:1 on the row backgrounds). In that mode `ResolvedGanttConfig.rowHeight` is `resourceView.rowHeight` (default 1.5 × the row height, 28 px at least: `MIN_RESOURCE_ROW_HEIGHT`, `RESOURCE_ROW_HEIGHT_FACTOR`), so every row consumer keeps working with fixed-height rows. With a `calendar` only working days carry load. While `rows` is `'tasks'` and there are no resources the output does not change: same columns (12 built-ins; the `resources`, `capacity` and `load` keys are built-ins only once the chart has resources or shows the resource view, so an app's own column with one of those keys stays a plain data column until then), toolbar, `getState()` (no `rows` key) and exports; the resolved config only gains the new `rows`, `resourceView` and `toolbar.rowsToggle` keys. Once resources exist, an app's own columns keyed `resources`, `capacity` or `load` take the built-in cells and sorting, and a `resources` column is a task field (editable by default).
  
  New API: the engine (`indexResources()`, `taskAssignments()`, `formatAssignments()`, `parseAssignments()`, `sameResources()`, `computeResourceUtilization()` with `loadAt()`, `contributorsAt()` and `loadTasks()`, `projectResourceRows()` / `resourceViewTasks()` and `resourceInfoOf()`, `computeLoadVisuals()` with `hitTestLoad()` (with `pxPerDay`: the highest day of a coarse-zoom bar) and `LOAD_STYLE`, `buildResourceTooltip()`), the toolbar's `rows` group (`toggleRowsMode()`, an `aria-pressed` icon button after the task list toggle that never moves into the More menu: `ToolbarAction` `{ type: 'rows' }`, `ToolbarIcon` `'resources'`, `ToolbarInput.rows` / `hasResources`), `flattenTree(tasks, collapsed, { order: 'start' | 'input' })`, the `BuiltinColumnKey`s `resources`, `capacity` and `load` (`buildResourceColumns()`, `resourceRowInfo()`, `defaultColumnKeys(view, config)`; `ColumnContext` gets the optional `resources` and `rows`), an editable `resources` cell (`Ana, Bo 50%`), `taskAccessibleName()` / `resourceAccessibleName()` for the resource rows, and in the exports: SVG, PNG and print draw the resource view (`ExportTimeline.load`, `ChartExportSource.utilization`), the CSV writes `capacity`, `load` and `resources` (`columns: 'all'` lists them only when the chart has a use for them), and `createExportSource()` takes `resources` and `rows`. `taskDependencies()` moved to its own module (same public name).
  
  **Breaking**: `GanttLabels` gains the required `colResources`, `colCapacity`, `colLoad`, `resUnassigned`, `showResources`, `showTasks`, `ttResLoad`, `ttResCapacity`, `ttResOver`, `ttResMore(n)`, `describeResource(name, capacity, peak, overDays)`, `errorUnknownResource(ref)` and `errorAmbiguousResource(ref)` (objects typed as a full `GanttLabels` need them; `options.labels` stays partial), `ToolbarLabels` gains `showResources` and `showTasks`, `Required<GanttTheme>` objects need `overallocatedColor`, `ResolvedGanttConfig` gains `rows` and `resourceView`, `ResolvedToolbar` gains `rowsToggle`, and `BuiltinColumnKey`, `TooltipModel['kind']` and `ToolbarAction` gain members.
- 316c052: **UX and accessibility models.** Every binding now paints its keyboard, touch, zoom, tooltip, toolbar, chart-state and marker-lane behaviour from `@gantryjs/core`.
  
  **Breaking**
  
  - `BarVisual.handles` is `{ left: BarHandle; right: BarHandle } | null` instead of `[x1, x2]` tuples. Each handle is a `hit` rect (`bar.handles.hitSize` wide, default 24 px, centred on the edge, reaching at most a third of the bar inward, inside the row, never overlapping the other) and a `grip` pill. Handles exist on resizable task bars from 12 px wide (`HANDLE_MIN_BAR_WIDTH`); `RESIZE_HANDLE_PX` is gone. Custom renderers that read the tuples must switch.
  - `ArrowVisual` gains the required `dash` (`'5 3' | null`) and `lagLabel.fontPx`, so objects built by hand need them (`computeArrowVisual` takes an optional `fontPx`, default 12).
  - Default labels: `viewSplit` / `viewTable` / `viewChart` are `'Table and chart'` / `'Table only'` / `'Chart only'`, and `announceEditStart` drops its Up/Down progress sentence. New `GanttLabels` members (only objects typed as a full `GanttLabels` need them; `options.labels` stays partial): `ariaBars`, `ariaTask`, `ariaMilestone`, `ariaGroup`, `ariaBarRole`, `ariaZoomLevels`, `ariaViews`, `fitToScreen`, `emptyState`, `errorTitle`, `dragReadout`.
  - `LightTheme.milestoneColor` is `#7C3AED` (white labels 5.7:1; `LegacyLightTheme` keeps `#8B5CF6`). New theme key `focusRing` (`--gantt-focus-ring`; see the Phase 10 changeset for the current `THEME_CSS_VARS` count).
  - The built-in date and duration columns are as wide as their default or as their text needs, whichever is wider (`dateColumnWidth`, `durationColumnWidth`, a `fontPx` argument for `buildBuiltinColumns`; English is unchanged), and a header cell clipped by the range edge shows no label when it is narrower than that label (`ScaleCell.partial`, `partialLabelHidden`).
  
  **New options**, with their `resolveConfig()` defaults: `keyboard.characterShortcuts` (`true`), `tooltip: { trigger: 'auto', showDelay: 320, hideDelay: 120, render }`, `legend.position` (`'bottom'`), `markers.lane` (`'auto'`), `bar.handles.hitSize` (24) and `toolbar.fit` (`true`). New types `RetryEvent` and `GanttTooltipRenderContext`; `GanttFlatRow` gains the optional `posInSet`, `setSize` and `parentIndex`.
  
  **New models**
  
  - Keyboard and accessibility: row-first `navigateGrid` with a header row (`ROW_FOCUS`, `HEADER_ROW`), `navigateTimeline` / `panScrollLeft`, `rovingIndex` / `tabStopIndex`, `keySelectionModifiers`, `createAnnouncer` (250 ms debounce, the last message wins), `barRoleDescription`; `resolveKey` honours `keyboard.characterShortcuts`.
  - Pointer: `hitTestBar`, `BarVisual.focusRect` / `hitBox`, the gesture machine (`gestureKind`, `startGesture` / `moveGesture` / `longPressGesture` / `cancelGesture` / `endGesture`; `DRAG_THRESHOLD_PX` 3, `LONG_PRESS_MS` 350, `TOUCH_SLOP_PX` 8) and `autoScrollDelta` (`AUTO_SCROLL_EDGE` 32, `AUTO_SCROLL_MAX_STEP` 18).
  - Zoom: `wheelZoom` / `pinchZoomSteps`, `fitZoomLevel` / `fitScrollLeft`, and `anchoredScrollLeft`, which keeps the date under the pointer (`zoomAnchorScroll` is deprecated); `computeHorizontalWindow` takes an optional `fallbackWidth`.
  - Tooltip and drag readout: `placeTooltip` (below the bar, flipped above at the bottom edge), the `initialTooltipState` / `reduceTooltip` / `tooltipVisibleId` machine (hover delay, focus, tap, the pointer resting on the tooltip, dismissal, `tooltip.trigger`), `formatDragReadout` / `placeDragReadout` / `dragReadoutWidth`; `DragPreview` gains `start` / `end`.
  - Toolbar, states, legend and markers: `buildToolbar` / `TOOLBAR_ICONS` / `toolbarTabStop` / `toolbarFocusMove` / `zoomLevelLabel`, `resolveChartState` / `skeletonRows`, `legendPlacement`, `computeMarkerLane` / `markerLaneShown` (`MARKER_LANE_HEIGHT` 18; lane labels in the theme text colour, no lane in the table view), `computeAnnotationVisuals`, `HATCH_PATTERN` and `ARROW_DASH`.
  - Focus and scrolling: `FOCUS_RING_MARGIN` (4: how far a bar's focus ring reaches outside its box) and `timelineScrollPadding(headerHeight)` (the timeline's scroll padding, so a bar scrolled into view shows its whole ring), `gridTabStop` / `sameGridSpot` / `GridFocusSpot` (the task list's one tab stop, the first header cell without rows), `createScrollMirror` (the panes' vertical scroll sync, ignoring the echo of its own writes), `bodyHeight` and `pageRowCount` (the body under the header, a keyboard page).
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

### Minor Changes

- 2cf00e4: Fully configurable chart, rendered from one shared core model in every binding: N-tier header scales with custom formats (ISO / Sunday weeks, "W52", "4–11 Mar"…), zoom presets and an Hour view; period delimiters through header and body; weekends, holidays, working and intensive hours; bar / milestone / group / arrow sizing and styling; a resizable, collapsible task-list panel (30% by default, remembers its last width) with horizontal scroll, a split / table / chart view switch and persisted UI state (`stateKey`, `state-change`). Fixes time-zone and daylight-saving misalignment, header/row misalignment, label overflow and many smaller rendering bugs.
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
- 6522a87: Data sources share one framework-free loader (`PagedLoader` in `@gantryjs/core`): failed pages retry automatically with exponential backoff (`retries`, `retryDelay`), then show an error with a Retry button, emit `loadError` / `load-error` and pause until `retry()` — no more request storm. `reset()` replaces instead of duplicating, `initialPage` works (`0` = wait for `loadNext()`), and Angular's `GanttDataSource` gains `error()`, `nextPage()` and `retry()` and no longer needs an injection context. New labels `loadError` and `retry`.
- 6522a87: `@gantryjs/core/demo` adds `createDemoData()` and `anchorToToday(template, { now, at })`: they move a plan by whole weeks so today sits inside it (about 40% in by default), keeping weekdays and date-only values. `DEMO_TASKS` / `DEMO_ANNOTATIONS` stay the fixed 2026 reference plan.
- 6522a87: New `initialScroll` option: `'auto'` (default) centres today only when it is near the tasks and otherwise shows the earliest task, so the first view always has bars; also `'today'`, `'start'`, a `Date` or `false`. Zooming now keeps the date at the viewport centre in place, an earlier range start no longer shifts the view, and smooth scrolling honours `prefers-reduced-motion`.
- cdcf5cd: `ViewMode`, `DependencyType` and `TaskType` are now `as const` objects with a same-name union type (no TS enums): `ViewMode.Week` reads the same and plain strings are accepted. Optional properties of the public types accept `undefined` explicitly, so projects using `exactOptionalPropertyTypes` can pass `undefined`. `@gantryjs/angular` declares `"type": "module"`. Task-list rows can be focused and selected with Enter / Space.
  
  New `GanttThemeOverrides` type for `options.theme`, `setTheme()` and `patchTheme()`: any token may be `undefined` (keeps the built-in value).
- 6522a87: Split panel vs table view: the panel next to the timeline shows `name`, `start`, `end`, `progress`; the table view shows type, a derived status (with a coloured dot), duration, predecessors and, with `baseline`, baseline start/end and variance. `panel.columns` / `table.columns` pick columns by key (built-ins need no definition), `setColumnVisible(key, visible, view)` works per view, sorting reorders siblings at every tree level, and custom columns get `sortValue` and a `ColumnContext`. Visible changes: the default panel drops Duration; Duration reads the drawn span (one day longer with `endDateMode: 'inclusive'`); code building a full `GanttLabels` object needs the new keys.
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

### Patch Changes

- 6522a87: Angular: bars follow their rows after collapse / sort, `selectionChange` is emitted for every selection (task list, keyboard, API), Ctrl/Cmd+A selects all visible rows and honours `enableSelection` / `multiSelect`. Shortcuts are ignored while typing in inputs or `contenteditable` cells. The resolved config gains `selection: { enabled, multi }`.
- d2e5d4c: Bug fixes: tasks with a `null`, empty, unknown or cyclic `parentId` no longer disappear and a task without `end` no longer breaks the date columns (new `normalizeTasks()`); the critical path reads dates like the bars (`endDateMode: 'inclusive'` counts the last day, hour-level tasks use fractional days); column sorting is linear-time.
