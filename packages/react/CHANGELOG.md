# @gantryjs/react

## 2.0.0

### Major Changes

- 19d6e62: Gantry is now available for every framework: `@gantryjs/core` (framework-free logic), `@gantryjs/vanilla` (`<gantry-element>` Web Component), and `@gantryjs/react`, `@gantryjs/vue`, `@gantryjs/svelte` bindings. `@gantryjs/angular` now builds on `@gantryjs/core` and gains column sorting (built-in columns are sortable).
- 019ac69: `<Gantry>` applies its props and listeners in the commit (layout effects in the browser, nothing on the server), so the
  chart's first frame already shows the passed `tasks` and `options` instead of flashing its defaults.
  
  - A prop set back to `undefined` (or left out after having a value) restores the element's default; it used to keep
    the last value. A prop that was never set is not written.
  - Events fired while the element applies its first props are delivered (listeners are attached first): for example
    `onViewModeChange` for `options.viewMode`, or `onLoadError` for a data source that already failed.
  - Callbacks are read from a ref updated in the commit, never during render: a render React discards (a suspended
    transition) can no longer swap in its callbacks, and changing a callback never re-adds listeners.
  - Objects are passed through unchanged (`ref.current.tasks === tasks`), and the ref is attached once the props are set.
  - `className` is set as the `class` attribute, so it also styles the chart in React 18 (which wrote a `classname`
    attribute on custom elements).
  - Server rendering emits `<gantry-element>` without touching DOM APIs and without React 18's layout-effect warning.
  
  Breaking: a prop set back to `undefined` now restores the element default (it used to keep the last value).

### Minor Changes

- 2cf00e4: Fully configurable chart, rendered from one shared core model in every binding: N-tier header scales with custom formats (ISO / Sunday weeks, "W52", "4–11 Mar"…), zoom presets and an Hour view; period delimiters through header and body; weekends, holidays, working and intensive hours; bar / milestone / group / arrow sizing and styling; a resizable, collapsible task-list panel (30% by default, remembers its last width) with horizontal scroll, a split / table / chart view switch and persisted UI state (`stateKey`, `state-change`). Fixes time-zone and daylight-saving misalignment, header/row misalignment, label overflow and many smaller rendering bugs.
- 8891728: **Synchronised charts in every wrapper**: the `syncGroup` prop takes a group from `createGanttSyncGroup()` (re-exported from `@gantryjs/core`; default `null`). It is passed to `<gantry-element>` as it is, never copied. React forwards it through the element's property table. Vue declares it after `errorMessage` and unwraps a group kept in a `ref` or `reactive` with `toRaw`. Svelte passes it by identity: keep the group in a plain `const` or in `$state.raw`.
  
  **Vue `#empty` slot**: `<template #empty>…</template>` is rendered as a `<div slot="empty">` inside the element (the empty-state content), before the default slot, on the server too. A `<div slot="empty">` in the default slot still works. The slots are typed (`SlotsType`), so Volar knows `empty` and `default`.
- 2d41fde: **Editing events in every wrapper**: seven new callbacks receive the `<gantry-element>` event `detail`: `onBeforeChange`, `onTasksChange`, `onTaskUpdated`, `onTaskProgressChanged`, `onDependencyCreated`, `onDependencyDeleted` and `onHistoryChange` (Vue: `@before-change`, `@tasks-change`, `@task-updated`, `@task-progress-changed`, `@dependency-created`, `@dependency-deleted`, `@history-change`). `onBeforeChange` runs synchronously, so calling `detail.preventDefault()` there vetoes the change. `onTasksChange` gives the tasks after the change (in controlled mode, the proposed ones with `applied: false`), ready to put back in state: `setTasks(detail.tasks)` in React, `tasks.value = detail.tasks` in Vue, `tasks = detail.tasks` in Svelte (use `$state.raw` for large plans). Svelte destructures the seven names, so they never reach the element as attributes.
- d78716b: **Export events in every wrapper**: `onBeforeExport` and `onExport` (Vue: `@before-export`, `@export`) receive the `<gantry-element>` event `detail` for every `download()` and `print()`, from the API or the toolbar's export menu. `onBeforeExport` runs synchronously, so `detail.preventDefault()` there cancels the file or the print (upload it yourself instead); `onExport` then gets the format, file name, size in bytes and, for a print, the page count. The export methods are async methods of the element: `await ref.current?.download('svg')` in React, `await chart.value?.element?.exportCsv()` in Vue, `bind:element` in Svelte. Svelte destructures both names, so they never reach the element as attributes.
- b4636c8: The wrappers forward the new `resources` property of `<gantry-element>` (React derives it, Vue and Svelte list it and copy the array one level, like `tasks` and `annotations`): with `options.rows: 'resources'` the chart shows one row per resource with its daily load against its capacity.
- 316c052: **Chart states in every wrapper**: the `loading` and `errorMessage` props and the `onRetry` callback (Vue: `@retry`), with `{ source: 'error' | 'dataSource' }`.
  
  - Children reach `<gantry-element>`'s light DOM, so a `<div slot="empty">…</div>` replaces the empty-state text: React children, the Vue default slot; Svelte forwards `children` and adds an `empty` snippet prop rendered in that slot.
  - No default inline `style` any more: the element's `:host` already fills its container, server markup has no `style` attribute of its own (strict CSP), and a `class` on the component now sizes the chart. Until the element is defined (server-rendered markup before the script runs) the `:host` style doesn't apply: add `gantry-element:not(:defined) { display: block; width: 100%; height: 100%; }` to your stylesheet to reserve the chart's box (see each wrapper's "Server-side rendering").
  - Every new option and behaviour of `@gantryjs/vanilla` (keyboard model and move mode, touch and zoom gestures, `fitToScreen()` on the element, the tooltip options, the marker lane, the legend strip, forced colors) reaches the wrappers as is. `options.tooltip.render` returns a string or a DOM node, not a React element, a VNode or a snippet.
- 6522a87: Split panel vs table view: the panel next to the timeline shows `name`, `start`, `end`, `progress`; the table view shows type, a derived status (with a coloured dot), duration, predecessors and, with `baseline`, baseline start/end and variance. `panel.columns` / `table.columns` pick columns by key (built-ins need no definition), `setColumnVisible(key, visible, view)` works per view, sorting reorders siblings at every tree level, and custom columns get `sortValue` and a `ColumnContext`. Visible changes: the default panel drops Duration; Duration reads the drawn span (one day longer with `endDateMode: 'inclusive'`); code building a full `GanttLabels` object needs the new keys.

### Patch Changes

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
- Updated dependencies [8891728]
- Updated dependencies [2d41fde]
- Updated dependencies [2d41fde]
- Updated dependencies [d78716b]
- Updated dependencies [d78716b]
- Updated dependencies [ab1e292]
- Updated dependencies [ab1e292]
- Updated dependencies [b4636c8]
- Updated dependencies [b4636c8]
- Updated dependencies [316c052]
- Updated dependencies [316c052]
- Updated dependencies [cdcf5cd]
- Updated dependencies [6522a87]
- Updated dependencies [7bf8c1b]
- Updated dependencies [c8b61c7]
- Updated dependencies [c8b61c7]
- Updated dependencies [c8b61c7]
- Updated dependencies [6522a87]
  - @gantryjs/core@2.0.0
  - @gantryjs/vanilla@2.0.0
