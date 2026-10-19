# @gantryjs/vue

The free, full-featured **Gantry Gantt chart for Vue 3** (3.5+): drag & resize,
dependencies, critical path, baselines, virtual scrolling, sorting, lazy loading,
theming and i18n. MIT licensed.

A thin binding over the [`<gantry-element>`](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla) Web Component — no
`isCustomElement` compiler configuration needed.

## Install

```bash
npm i @gantryjs/vue
```

## Usage

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Gantry, ViewMode, type GanttTask, type TaskDragEvent } from '@gantryjs/vue';

const gantt = shallowRef<InstanceType<typeof Gantry>>();
const tasks = ref<GanttTask[]>([
  { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
]);

function onDragged(e: TaskDragEvent) {
  const task = tasks.value.find(t => t.id === e.taskId);
  if (task) Object.assign(task, { start: e.newStart, end: e.newEnd });
}
</script>

<template>
  <div style="height: 500px">
    <button @click="gantt?.element?.scrollToToday()">Today</button>
    <Gantry
      ref="gantt"
      :tasks="tasks"
      :options="{ viewMode: ViewMode.Week, criticalPath: true }"
      dark-mode="auto"
      @task-dragged="onDragged"
      @selection-change="e => console.log(e.selectedIds)"
    />
  </div>
</template>
```

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#properties), in this order: `tasks`,
  `columns`, `options`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`,
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, `loading`, `errorMessage`,
  `syncGroup`. An omitted prop keeps the element's default (booleans are not cast to `false`),
  and a prop that becomes `undefined` (or is dropped) restores it.
- **Events** carry the event detail: `@task-dragged`, `@task-resized`, `@selection-change`,
  `@row-click`, `@row-dblclick`, `@view-mode-change`, `@state-change`, `@load-error`, `@retry`, and the editing events `@before-change`, `@tasks-change`, `@task-updated`,
  `@task-progress-changed`, `@dependency-created`, `@dependency-deleted`, `@history-change` (see [Editing](#editing)).
- **Slots** — rendered in the element's light DOM, where its own slots pick them up: the `empty`
  slot (`<template #empty>…</template>`) in a `<div slot="empty">`, which replaces the empty-state
  text (`labels.emptyState`), then the default slot as it is (a `<div slot="empty">…</div>`
  written there works too).
- **Template ref** — exposes only `element`: the underlying `GantryElement`, with its
  [methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods). It is set
  before the element is inserted, so it is there in the parent's `onMounted`.
- **Size** — the element fills its container (`display: block; width: 100%; height: 100%`, from
  its own `:host` style); a `class` or `style` on `<Gantry>` overrides that. The component adds no
  inline style of its own.

All `@gantryjs/core` types and helpers are re-exported.

## Loading, error and empty states

```vue
<Gantry :tasks="tasks" :loading="pending" :error-message="error ? 'Couldn’t load the plan' : null" @retry="refresh()">
  <template #empty>No tasks yet: <button @click="addTask">add one</button> to start.</template>
</Gantry>
```

`loading` shows the loading state and `errorMessage` the error state, whose Retry button emits
`retry`: `{ source: 'error' }` for the `errorMessage` state (load again yourself), `{ source:
'dataSource' }` after a failed first `dataSource` page (the element also calls
`dataSource.retry()`). The `#empty` slot replaces the text shown when there are no tasks: the
component renders it in a `<div slot="empty">`, the element's empty-state slot (with a `v-if` on
the `<template #empty>`, the built-in text shows while it is false). A `<div slot="empty">` in the
default slot does the same.

## Synchronised charts

```vue
<script setup lang="ts">
import { Gantry, createGanttSyncGroup } from '@gantryjs/vue';

// A plain constant: the charts share this very object (no ref needed)
const group = createGanttSyncGroup();
</script>

<template>
  <Gantry :tasks="design" :sync-group="group" />
  <Gantry :tasks="build" :sync-group="group" :show-toolbar="false" />
</template>
```

Charts given the same `syncGroup` share one timeline: the date range (the union of their plans),
the zoom level, the horizontal scroll and the task-list width. `createGanttSyncGroup({ zoom,
scroll, range, panel })` turns parts off (each is `true` by default). The group reaches the
element as it is, never copied: a group kept in a `ref` or `reactive` is unwrapped with `toRaw`,
and only replacing it is watched. `null`, or dropping the prop, takes the chart out of the group.

## Editing

With `:options="{ editing: true }"` the chart edits its own tasks (cells, a progress grip, links, undo / redo; every
option is in [Editing](https://github.com/ErlonRr/gantryjs#editing)). Each change emits `before-change` first, then the op events and `tasks-change`.
`@before-change` runs synchronously: `detail.preventDefault()` vetoes the change. Keep the tasks in state from
`@tasks-change`, which gives the tasks after the change (use a `shallowRef`: the chart gets the very array it proposed):

```vue
<script setup lang="ts">
const tasks = shallowRef<GanttTask[]>(initial);
</script>

<Gantry
  :tasks="tasks"
  :options="{ editing: true }"
  @before-change="
    d => {
      if (isLocked(d.change)) d.preventDefault();
    }
  "
  @tasks-change="d => (tasks = d.tasks)"
/>
```

With `editing: { controlled: true }` the chart applies nothing: `@tasks-change` carries the proposed tasks
(`applied: false`) and `tasks.value = d.tasks` is how you accept them. Undo and redo are methods on the element
(`gantt.value?.element?.undo()`, `canUndo`, `editCell()`, `addDependency()`…; the
[Web Component's methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods)). A custom cell editor is a function that returns a DOM node
(`editor: ctx => node` in a column), not a VNode.

## Options and behaviour

`options` takes every `GanttOptions` field, documented once for every binding in
[Configuration](https://github.com/ErlonRr/gantryjs#configuration): among them the
[toolbar, legend and marker lane](https://github.com/ErlonRr/gantryjs#toolbar-legend-and-markers), the
[tooltip](https://github.com/ErlonRr/gantryjs#tooltip) (`tooltip.render` returns a string or a DOM node, not a VNode) and
`keyboard.characterShortcuts`. Keyboard navigation and move mode, touch gestures, zoom gestures,
screen-reader semantics and forced colors behave as in every Gantry binding: see
[Keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus), [Touch and pointer](https://github.com/ErlonRr/gantryjs#touch-and-pointer),
[Zoom](https://github.com/ErlonRr/gantryjs#zoom), [Screen readers](https://github.com/ErlonRr/gantryjs#screen-readers) and [Forced colors](https://github.com/ErlonRr/gantryjs#forced-colors).
`gantt.value?.element?.fitToScreen()` zooms to the finest level that shows every task.

## How props reach the element

- **Before the first frame.** The listeners and the props go on the element before Vue inserts
  it, so it connects and paints its first frame with your props (no flash of the defaults), and
  events fired by the first assignment or the first connect (`view-mode-change` from
  `options.viewMode`, `load-error` of a data source that already failed) reach your handlers.
- **Your objects, not copies.** Values are handed over as they are; Vue proxies are unwrapped
  with `toRaw`, so `gantt.value.element.tasks` is the very array you passed (`toRaw(tasks.value)`
  for a `ref`). An array that holds proxies — `tasks.value.map(t => …)` returns the items it
  doesn't replace as proxies — becomes a new array of the raw items. Nested objects (inside
  `options`, inside a task) are passed as they are. The one exception is a reactive `options`
  object (below).
- **Array props** (`tasks`, `columns`, `annotations`) are watched one level deep: replacing the
  array, `push`, `splice` or `tasks.value[i] = …` re-render the chart. The element compares
  arrays by identity, so after such an in-place change it receives a shallow copy (the same
  items). Changing a field of an item (`task.name = …`) is not watched: replace the item or the
  array. With a `shallowRef`, replace the array.
- **`options`** is compared field by field by the element, so an inline object
  (`:options="{ … }"`) re-created on every render costs nothing. A reactive `options` object
  (`reactive({ … })`, a `ref`'s value) is watched one level deep too: `options.viewMode = 'Week'`
  or `options.rowHeight = 48` re-applies it. Such an object reaches the element as a one-level copy
  (a new object with the same values), since the element compares new options with the ones it
  holds. A change inside a nested object (`options.panel.width = …`) is not watched: replace
  that object (`options.panel = { … }`).
- **`dataSource`**: keep a `GanttDataSource` in a `shallowRef` (or a plain variable); a deep `ref`
  types it without its private members.
- **`syncGroup`** is passed as it is (unwrapped from a proxy) and watched only for a new group,
  never deeply.
- Listeners come off once the element is unmounted; a `state-change` that the element still
  fires while disconnecting (a pending save) is delivered first.

## Server-side rendering

`<Gantry>` renders on the server without touching the DOM: `renderToString` emits the
`<gantry-element>` tag with your attributes and slot content (no inline style of its own,
so the markup needs no `'unsafe-inline'` style policy); the props and listeners are set on the
client when it hydrates. Importing `@gantryjs/vue` on the server is safe.

Until the element is defined its own `:host` style (which makes it fill its container) doesn't
apply, so the server markup takes no room. Reserve the chart's box with one rule in your
stylesheet:

```css
gantry-element:not(:defined) {
  display: block;
  width: 100%;
  height: 100%;
}
```

## License

MIT
