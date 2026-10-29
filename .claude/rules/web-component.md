---
paths:
  - 'packages/vanilla/**'
---

# @gantryjs/vanilla (<gantry-element>) rules

- **Paint the core model, don't compute it.** Geometry, defaults and colours come from
  `@gantryjs/core` (`resolveConfig`, `buildTimeline`, `computeBarVisual`, …); the element only
  derives and paints them.
- **Data flow: inputs → graph → region effects → DOM.**
  - `engine/inputs.ts`: input signals. Property setters, attributes, API methods, pointer /
    keyboard / scroll handlers, the ResizeObserver, the clock, the colour-scheme listener and the
    data source write **only** these.
  - `engine/graph/*.ts`: computeds, one concern per file (chrome, config, rows, styles, timeline,
    windows, layout, visuals, arrows, horizontal, tasklist, markers, states), built with `node(name, fn, {equals})`
    (`graph/node.ts`) so runs are counted per name. Use equality cut-offs (`structuralEqual`,
    `sameVirtualWindow` (core), …) so unchanged results stop propagating. A new module adds its nodes to its
    own interface; `Graph` in `engine/engine.ts` merges them.
  - `engine/render.ts`: one effect per region on the per-element rAF scheduler, flushed in the
    fixed `REGIONS` order (host → toolbar → legend → header → static → rows → hover → bars →
    arrows → overlay → readout → tasklist → states → scroll-commands → focus-restore → lazy-load).
    Outside the flush: the sync-group link (`layers/sync.ts`, joined from an effect of the
    connection's owner whenever `syncGroup` changes) and the narrow-width switch
    (`layers/responsive.ts`, `onWidth()` on every measured width and after `setState`, core
    `reduceResponsive`, whose state also keeps the view shown; a responsive view change never saves
    state). The open tooltip's refresh key is task object, critical flag, float, i18n bundle, the row's
    resolved style (core `sameTaskStyle`) and the date reading (core `sameDateReading`: calendar key, end-date
    rule, date-only normalisation).
  - Date reading: `graph/rows.ts` builds `dateReading = node('dateReading', () => dateReadingOf(cfg.config()), { equals: sameDateReading })`,
    never a hand-made `{ endDateMode, normalizeDateOnly }` (it drops the calendar); CPM, rollups and the column
    context read it, so a zoom / theme / label change recomputes none of them. Change builders (`dragChange` in
    `engine.ts`, `taskChange` in `interaction/{keyboard-edit,cell-edit}.ts`) pass `dates: G.config.peek()` / `session.dates`.
  - Styles: `graph/styles.ts` builds core `createStyleResolver` (`rowStyle(row)`, memoised per row
    object) and `barSegments`; rows, task list, bars and tooltip read the row's resolved style
    from it, never `task.style` or the flat colour fields. Rollups (`applyRollups`) run in
    `graph/rows.ts` before `sortTree`; events carry the consumer's task (`rollupSource`).
  - Resource view: `graph/rows.ts` nodes `resourceMode`, `resourceIndex` (equal on `sameResources`), `utilization` (null
    unless resource mode; depends only on tasks, index, `dateReading`, `resourceView.unassigned`), `viewTasks` (`tasks`
    itself in tasks mode); `critical` null and rollups off in resource mode; `columnCtx` gets `tasks: viewTasks`,
    `resources` and (resource mode) `rows`; `graph/resources.ts` `loadVisuals` (mounted rows × horizontal window,
    `dayOfX = calendarDays(timeline.toDate(x), false)`); `layers/bars.ts` reads `G.barGeometries()` (empty in resource
    mode); `layers/load.ts` is painted from the static region and builds `g.gantt-load[aria-hidden]` detached, attached
    before `g.gantt-bars-layer` only in resource mode (hatch pattern `gantt-over-hatch-<uid>`); `I.rowsOverride`
    mirrors `viewOverride` (toolbar `{ type: 'rows' }` → core `toggleRowsMode`, `state-change`; `getState()` always has
    `rows`); the tooltip trigger uses `hitTestLoad` and the open tooltip's refresh key includes the utilization identity.
  - `layers/*.ts`: the painters. A layer is `{ paint(), disconnect?() }` built once per element
    from a `LayerContext` (`layers/context.ts`); its closure holds its persistent nodes and caches.
    Besides inputs and graph nodes the context gives `ctx.announce` (core `createAnnouncer` on
    `.gantt-sr-live`: `say()` debounced 250 ms, the last message wins; `now()`; `cancel()` on
    disconnect — errors go to `dom.srAlert`, undebounced), `ctx.setBusy(busy)` (the host's
    `aria-busy`, through `ElementInternals`), `ctx.focus` (`capture()` / `request(key)` by
    `data-focus-key`) and `ctx.emit`.
  - `interaction/*.ts`: the handlers, bound in `engine.connect()` with the connection's
    `AbortSignal`; they write inputs (and call layer APIs such as the tooltip's), never paint.
    Pointer: `canvas-pointer.ts` (hit-testing by geometry, core `hitTestBar`), `gestures.ts`
    (`trackPress`: 3 px mouse threshold, 350 ms touch / pen long-press; `bindTouchGuard`),
    `autoscroll.ts`, `drag.ts`, `zoom.ts` (Ctrl/⌘ + wheel, pinch, Safari gestures → `zoomAnchor`
    with `viewModeOverride`). A mouse press on a bar focuses it (`preventDefault` +
    `focus({ preventScroll: true })`; touch / pen focus it when a drag starts), and Escape during
    a press belongs to the press (window capture listener, consumed, removed when it ends). Row
    hover: `canvas-pointer.ts` (timeline, `rowIndexAtY`) and the task list's delegated
    `pointerover` / `pointerleave` write `hoveredRowId` (never on touch or while dragging); it is
    cleared on pointer leave, drag start, scroll of either pane (unless pressing) and disconnect.
    `scroll.ts` also holds `viewportSync` (sync groups: echo guard, the queued group scroll,
    horizontal scroll reports only when `scrollLeft` changed and no group scroll waits). Keyboard: `keyboard.ts` (one keydown listener, area dispatch through
    core `resolveKey`, focus and modality tracking), `grid-keys.ts`, `timeline-keys.ts`,
    `keyboard-edit.ts` (move mode → `dragPreview`). `tooltip-triggers.ts`: focus, Escape (capture
    phase), scroll, outside press and the dismiss rules. Also `splitter.ts`, `column-resize.ts`,
    `columns.ts`, `selection.ts`, `scroll.ts`.
- **Editing (Phase 11).** Every task change — drag, resize, move mode, progress grip, link, cell, API — goes
  through `ctx.edit.commit` (`engine/edit.ts`: core `prepareChange` → cancelable `before-change` → apply to the raw
  input or `dataSource.patch()` → history → events), built from the raw task (`ctx.edit.rawTask(id)`). Never write
  `tasksIn` from a feature (`updateTask()` / `appendTasks()` are the silent data writes). Edit targets (progress
  grip, connectors) are hit only where the overlay shows them; permissions come from core `editRules`; keys inside
  `.gantt-tl-cell--editing` belong to the editor. A connection effect deselects `selectedLinkKey` once its link
  isn't drawn; the link preview `d` is `graph.linkPreviewPath` (follows a zoom); the key or double-click that opens a
  cell editor calls `ctx.renderNow()` so fast typing reaches the field. The `tasks` getter returns the raw input.
- **The region / layer contract.** `paint()` reads inputs and graph nodes (every read is a
  dependency, so the region re-runs only when they change) and **only writes** the DOM. It never
  reads layout (`clientWidth`, `getBoundingClientRect`, …): sizes reach the graph as input signals
  from the ResizeObserver and the scroll handlers (the exceptions are documented in
  `layers/scroll-commands.ts`). It never writes signals. Event handlers write inputs, not another
  region's DOM. Read with `.peek()` what must not become a dependency.
- **DOM helpers** (`dom/`): build nodes with `h()` / `s()` (`dom/h.ts`), patch them with
  `setAttr` / `setStyleProp` / `setText` / `toggleClass` (`dom/patch.ts`, last-value cache: an
  unchanged value costs nothing), render lists with `reconcile()` (+ `createPool()`)
  (`dom/keyed.ts`: one list per parent, contiguous before its anchor). The persistent shadow tree
  and SVG layer groups live in `layers/skeleton.ts` (its header comment lists them); never
  re-create the panes or the SVG. Optional nodes (the legend, the state box, the readout chip,
  the bar overlay, the today line, the drag ghost, the hatch `defs`, the row-hover rect) are built
  there detached and attached by their region with `showNode()` only while shown (D27): the paint
  snapshots rely on it. The same holds for the nodes a layer owns (the toolbar's More menu while
  open, `rect.gantt-bar-segment`s only while the visual has segments).
- **CSS and CSP** (strict `style-src`, Trusted Types): region CSS lives in `styles/*.css.ts` string
  modules, concatenated in cascade order by `styles/base.ts` into one constructable sheet per
  document (adopted; `<style>` + `textContent` fallback in `dom/sheet.ts`); the theme variables are
  a per-instance `:host` sheet (`styles/theme-sheet.ts`). Colours are `Paint` strings applied with
  `setStyleProp` (never presentation attributes). No `innerHTML` / `insertAdjacentHTML` /
  `cssText` / `style=` / `on*=` / `eval`: ESLint enforces it, and `h()` / `setAttr` throw on
  `style` and `on*`. User text goes in through `textContent` (`setText`). New chrome needs its
  forced-colors rule in `styles/forced-colors.css.ts` (last in the cascade; system colours with
  `!important`, since CSSOM paints would win otherwise), and focus rings use `--gantt-focus-ring`.
  Never put backticks in comments inside `styles/*.css.ts` template literals.
- **Lifecycle.** Everything that lives while connected (effects, listeners registered with the
  connection's `AbortSignal`, the ResizeObserver, the clock, the data-source subscription) is
  created in `engine.connect()`'s owner and released by `disconnect()`; element-lifetime effects
  run under their own `createRoot()`. Constructor: no attributes, styles or light-DOM children —
  do that in `connectedCallback`. Module top level stays SSR-safe (guard `HTMLElement` /
  `document`). The `options` setter only re-applies UI state the consumer actually changed (view
  mode, view, panel width) — never undo the user's interaction.
- **Public surface.** `src/index.ts` is curated: `GantryElement`, `GanttDataSource`,
  `GANTRY_PROPERTIES`, `GANTRY_EVENTS`, the types in `src/types.ts`, and `@gantryjs/core`. Never
  export engine internals or add public instance fields (use `#private` fields; tests reach the
  engine through `engine/registry.ts`, which the index does not export). The React / Vue / Svelte
  wrappers derive from `GANTRY_PROPERTIES` / `GANTRY_EVENTS`. `customElements.define` stays in
  `gantry.element.ts`, which `package.json` `sideEffects` lists.
- **New property:** an entry in `PROPERTY_TABLE` (`engine/props.ts`: name, default, optional
  attribute + parse), the field in `GantryProperties` (`types.ts`), an input signal
  (`engine/inputs.ts`, seeded from the table) and one explicit accessor in `gantry.element.ts`
  (getter + one-line setter calling `#set`; `undefined` restores the default). The lifecycle tests
  round-trip every table entry. **New event:** `GantryEventDetailMap` + `GANTRY_EVENTS`
  (kebab-case `CustomEvent`, `bubbles` + `composed`), dispatched through `ctx.emit`.
- **Custom Elements Manifest.** `custom-elements.json` is generated from the JSDoc of
  `GantryElement` (`@attr`, `@fires`, `@csspart`, `@cssstate`, `@cssprop` on the class; `@attr` on
  attribute-backed accessors; member docs). After changing an attribute, property, method, event,
  part, state or theme token, update that JSDoc and run `pnpm --filter @gantryjs/vanilla cem`;
  `__tests__/manifest.test.ts` and `cem:check` (CI) fail otherwise.
- **Accessibility.** The host's role, name, `aria-busy` and custom states (`dark`, `dragging`,
  `loading`) go through `ElementInternals` (host attributes only as the fallback); the host is not
  a tab stop (`delegatesFocus`). One tab stop per area (toolbar → task list → splitter → toggle →
  bars), each a roving `tabindex` from core (`toolbarTabStop`, `tabStopIndex`); the viewport is a
  tab stop only while no bar is mounted. Every focusable control carries a `data-focus-key`
  (`zoom-in`, `view:<v>`, `head:<col>`, `row:<id>`, `cell:<id>:<col>`, `bar:<id>`, `retry`…), which
  focus restore and `ctx.focus.request()` use. Call `ctx.focus.capture()` before replacing a
  focusable node. Bars are `option`s of the svg `listbox`; announcements go through
  `ctx.announce`. Don't add `focus` / `blur` / `focusin` / `focusout` listeners to SVG elements
  (Chromium makes them Tab stops): listen on an HTML ancestor.
- **Export (Phase 12).** The five methods call `engine.exportChart(request)`, the only
  `import('../export/run')` (a lazy chunk: never import `export/` statically; `scripts/size.mjs` budgets the entry
  chunk); one import promise is shared by every call (reset on rejection) and the print lock is taken before any
  await. The chart is read at call time by `engine/export-capture.ts` (entry chunk, plain values peeked from the
  graph); `export/source.ts` builds the `ChartExportSource` from that capture; `export/run.ts` runs
  svg / csv / png / download / print (cancelable `before-export` → file → `export`; one print per chart, locked
  before `before-export`). DOM helpers: `download.ts` (`a[download]` in the shadow root, URL revoked after
  `DOWNLOAD_REVOKE_MS`), `rasterize.ts` (`svgToPng`), `print.ts` (`printPages`: hidden `about:blank` frame built
  with `h` / `setAttr`, adopted sheet, cleanup on `afterprint` or `PRINT_CLEANUP_MS`), `serialize.ts`
  (`serializeSvg` = `XMLSerializer` + core `sanitizeSvgMarkup`, the same rules as headless exports; `''` → built-in
  bar).
  `ctx.runExport(format, 'toolbar')` never rejects (alert region + `console.error`). `inputs.exportMenuOpen` sits
  beside `menuOpen` (one `#gantt-tb-menu` node, one menu open at a time, `closeToolbarMenu` closes both).
  `styles/print.css.ts` (`@media print`, no `!important`) is last before forced colours.
- **Class names** are shared with Angular (`.g-*` header, `.gantt-*` elsewhere). The e2e selector
  contract and the paint snapshots rely on them and on element order: keep the anchor classes,
  `data-task-id` and the SVG layer order (`layers/skeleton.ts`).
- **Tests:** `src/__tests__/` in happy-dom. Flush a frame with `getEngine(el).flushSync()` and
  count work with `getEngine(el).runs` (graph nodes) and `.regionRuns` (regions), imported from
  `engine/registry` (source path). Select bars with `.gantt-bars-layer [data-task-id]` (task-list
  rows carry `data-task-id` too). Real-browser behaviour (internals, `moveBefore`, CSP, focus,
  axe) belongs in Playwright (`e2e/*.spec.ts`).
