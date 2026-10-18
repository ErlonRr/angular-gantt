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
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`. An omitted prop keeps the element's
  default (booleans are not cast to `false`), and a prop that becomes `undefined` (or is dropped)
  restores it.
- **Events** carry the event detail: `@task-dragged`, `@task-resized`, `@selection-change`,
  `@row-click`, `@row-dblclick`, `@view-mode-change`, `@state-change`, `@load-error`.
- **Template ref** — exposes only `element`: the underlying `GantryElement`, with its
  [methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods). It is set
  before the element is inserted, so it is there in the parent's `onMounted`.

All `@gantryjs/core` types and helpers are re-exported.

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
- Listeners come off once the element is unmounted; a `state-change` that the element still
  fires while disconnecting (a pending save) is delivered first.

## Server-side rendering

`<Gantry>` renders on the server without touching the DOM: `renderToString` emits an empty
`<gantry-element>` (with its layout style and your attributes); the props and listeners are set
on the client when it hydrates. Importing `@gantryjs/vue` on the server is safe.

## License

MIT
