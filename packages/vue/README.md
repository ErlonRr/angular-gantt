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
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, `loading`, `errorMessage`. An
  omitted prop keeps the element's default (booleans are not cast to `false`), and a prop that
  becomes `undefined` (or is dropped) restores it.
- **Events** carry the event detail: `@task-dragged`, `@task-resized`, `@selection-change`,
  `@row-click`, `@row-dblclick`, `@view-mode-change`, `@state-change`, `@load-error`, `@retry`.
- **Default slot** — rendered in the element's light DOM, where its slots pick it up:
  `<div slot="empty">…</div>` replaces the empty-state text (`labels.emptyState`).
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
  <div slot="empty">No tasks yet: add one to start.</div>
</Gantry>
```

`loading` shows the loading state and `errorMessage` the error state, whose Retry button emits
`retry`: `{ source: 'error' }` for the `errorMessage` state (load again yourself), `{ source:
'dataSource' }` after a failed first `dataSource` page (the element also calls
`dataSource.retry()`). The `slot="empty"` element replaces the text shown when there are no tasks.

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
- Listeners come off once the element is unmounted; a `state-change` that the element still
  fires while disconnecting (a pending save) is delivered first.

## Server-side rendering

`<Gantry>` renders on the server without touching the DOM: `renderToString` emits the
`<gantry-element>` tag with your attributes and default-slot content (no inline style of its own,
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
