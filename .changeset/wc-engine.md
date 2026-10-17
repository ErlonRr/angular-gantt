---
'@gantry/vanilla': major
---

New rendering engine for `<gantry-element>`: an in-house reactive graph (signals and computeds) drives one render per
animation frame, so scrolling inside the overscan, re-assigning equal `options` or changing only theme colours no longer
re-renders the chart.

Breaking: the public surface is curated. `@gantry/vanilla` now exports only `GantryElement`, `GanttDataSource`, the
tables `GANTRY_PROPERTIES` and `GANTRY_EVENTS`, the types `GantryProperties`, `GantryEventDetailMap`, `GantryEventMap`,
`GantryEventCallbacks`, `GanttBarRenderer`, `GanttDataSourceConfig`, `VanillaColumnDef` and `VanillaCellTemplate`, and
everything in `@gantry/core`; the engine behind the element is private.

- Removed exports (internal services, state primitives and low-level painters): `createState`, `WritableState`,
  `EventEmitter`, `EventListenerCallback`, `BaseComponent`, `GanttThemeService`, `GanttI18nService`,
  `GanttVirtualScrollEngine`, `GanttLayoutService`, `SortState`, `GanttCanvasComponent`, `GanttCanvasProps`,
  `GanttScrollService`, `GanttColumnService`, `GanttHeaderComponent`, `GanttHeaderProps`, `GanttTaskListComponent`,
  `GanttTaskListProps`, `GanttLoadMoreState`, `SVG_NS`, `svgEl`, `paintBar`, `PaintBarOptions`, `paintArrow`,
  `GanttToolbarComponent`, `GanttToolbarProps`, `GanttDragService`, `DragState`, `GanttSelectionService`,
  `GanttTooltip`, `GanttTooltipContext`. A custom `renderBar` gets the built-in bar from its `renderDefault()`
  argument (instead of `paintBar()`); `LightTheme`, `DarkTheme`, `VirtualWindow`, `DragPreview` and the virtual-window
  math (`computeVirtualWindow`) still come from `@gantry/core`, re-exported here.
- Removed element fields: `themeSvc`, `i18nSvc`, `colSvc`, `layout`, `scrollSvc`, `selSvc` and `dragSvc` (with their
  members, such as `colSvc.visibleColumns`, `colSvc.totalPanelWidth` and `layout.panelCollapsed`; the collapsed state
  is `el.view === 'chart'` or `getState().panelCollapsed`). The element has no public instance fields; its state is
  read through the properties and methods (`viewMode`, `view`, `criticalIds`, `getState()`, `getBarVisual()`, …).
  `GantryElement.observedAttributes` is typed `readonly string[]`.
- New `resetTheme()`: drops the `setTheme()` / `patchTheme()` overrides (back to the light / dark base plus
  `options.theme`).
- `package.json` declares `sideEffects`: only the files that register `<gantry-element>` (the bundle, and on the
  `@gantry/source` path the entry and the element module) count as having side effects, so a bare
  `import '@gantry/vanilla'` always defines the element.

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
opacity with a "+2d" movement label) and the dragged bar is dimmed through a CSS style. The tooltip is one persistent
popover (`role="tooltip"`) with `<dl>` rows written as text. Column resizing uses pointer capture (no `window` listeners).
The Angular header gets the same windowing in Phase 7.0, which ships in the same release.

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
exported as `@gantry/vanilla/custom-elements.json`) describing the element's attributes, properties, methods, events
with their detail types, CSS parts, custom states and the 40 `--gantt-*` CSS custom properties with their light-theme
defaults, for IDEs, Storybook and linters. CI fails when it is stale and when `import '@gantry/vanilla'` grows past
50 KB minified and gzipped (about 48 KB today, `@gantry/core` included).
