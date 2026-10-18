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
  - `engine/graph/*.ts`: computeds, one concern per file (chrome, config, rows, timeline,
    windows, layout, visuals, arrows, horizontal, tasklist, markers, states), built with `node(name, fn, {equals})`
    (`graph/node.ts`) so runs are counted per name. Use equality cut-offs (`structuralEqual`,
    `sameVirtualWindow` (core), …) so unchanged results stop propagating. A new module adds its nodes to its
    own interface; `Graph` in `engine/engine.ts` merges them.
  - `engine/render.ts`: one effect per region on the per-element rAF scheduler, flushed in the
    fixed `REGIONS` order (host → toolbar → legend → header → static → rows → bars → arrows →
    overlay → readout → tasklist → states → scroll-commands → focus-restore → lazy-load).
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
    with `viewModeOverride`). Keyboard: `keyboard.ts` (one keydown listener, area dispatch through
    core `resolveKey`, focus and modality tracking), `grid-keys.ts`, `timeline-keys.ts`,
    `keyboard-edit.ts` (move mode → `dragPreview`). `tooltip-triggers.ts`: focus, Escape (capture
    phase), scroll, outside press and the dismiss rules. Also `splitter.ts`, `column-resize.ts`,
    `columns.ts`, `selection.ts`, `scroll.ts`.
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
  the bar overlay, the today line, the drag ghost, the hatch `defs`) are built there detached and
  attached by their region with `showNode()` only while shown (D27): the paint snapshots rely on
  it.
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
- **Class names** are shared with Angular (`.g-*` header, `.gantt-*` elsewhere). The e2e selector
  contract and the paint snapshots rely on them and on element order: keep the anchor classes,
  `data-task-id` and the SVG layer order (`layers/skeleton.ts`).
- **Tests:** `src/__tests__/` in happy-dom. Flush a frame with `getEngine(el).flushSync()` and
  count work with `getEngine(el).runs` (graph nodes) and `.regionRuns` (regions), imported from
  `engine/registry` (source path). Select bars with `.gantt-bars-layer [data-task-id]` (task-list
  rows carry `data-task-id` too). Real-browser behaviour (internals, `moveBefore`, CSP, focus,
  axe) belongs in Playwright (`e2e/*.spec.ts`).
