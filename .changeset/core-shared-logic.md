---
'@gantryjs/core': major
'@gantryjs/vanilla': major
'ngx-gantry': major
---

**No more `dayjs`: zero runtime dependencies.** Dates are formatted by a built-in, `Intl`-based formatter
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
- `ngx-gantry`: the selection service, task list, tooltip and canvas these changes touched are internal in
  `ngx-gantry` 2.0 (see its changeset); use `<gantry>`'s `selectionChange`, `getSelectedTasks()` and
  `setSelectedTasks()`.
