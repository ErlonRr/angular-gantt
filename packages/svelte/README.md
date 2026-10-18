# @gantryjs/svelte

The free, full-featured **Gantry Gantt chart for Svelte 5**: drag & resize,
dependencies, critical path, baselines, virtual scrolling, sorting, lazy loading,
theming and i18n. MIT licensed.

A thin, runes-based binding over the [`<gantry-element>`](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla) Web Component.

## Install

```bash
npm i @gantryjs/svelte
```

## Usage

```svelte
<script lang="ts">
  import { Gantry, ViewMode, type GantryElement, type GanttTask, type TaskDragEvent } from '@gantryjs/svelte';

  let gantt = $state<GantryElement>();
  // `$state.raw`: no proxy around every task; assign a new array to update the chart
  let tasks = $state.raw<GanttTask[]>([
    { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
  ]);
  let viewMode = $state<string>(ViewMode.Week);

  function moved(e: TaskDragEvent) {
    tasks = tasks.map(t => (t.id === e.taskId ? { ...t, start: e.newStart, end: e.newEnd } : t));
  }
</script>

<div style="height: 500px">
  <button onclick={() => gantt?.scrollToToday()}>Today</button>
  <Gantry
    bind:element={gantt}
    {tasks}
    options={{ viewMode, criticalPath: true }}
    darkMode="auto"
    onTaskDragged={moved}
    onViewModeChange={e => (viewMode = e.viewMode)}
    onSelectionChange={e => console.log(e.selectedIds)}
  />
</div>
```

The chart fills its container (`display: block; width: 100%; height: 100%`): give the container
a height. `options` takes every `GanttOptions` field — see
[Configuration](https://github.com/ErlonRr/gantryjs#configuration).

## API

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#properties):
  `tasks`, `columns`, `options`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`,
  `enableResize`, `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`. Each is set as an
  element property, and only when it changes.
- **Callback props** receive the [event](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#events)
  `detail`: `onTaskDragged`, `onTaskResized`, `onSelectionChange`, `onRowClick`, `onRowDblClick`,
  `onViewModeChange`, `onStateChange`, `onLoadError`. The listeners are attached before the first
  property is set, so events fired while the chart starts (`onViewModeChange` for
  `options.viewMode`) arrive too; a changed callback is used from the next event on. Callbacks
  run untracked: an event fired inside your `$effect` (`gantt.setViewMode(mode)`) does not make
  that effect depend on the callback or on the state it reads.
- **`bind:element`** — the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods)
  (`zoomIn()`, `scrollToTask()`, `setState()`, …).
- **Other props** (`class`, `id`, `style`, `aria-*`, `data-*`, attributes such as `dark-mode`) go
  to the element; `style` is added after the default size.

All `@gantryjs/core` types and helpers are re-exported (`ViewMode`, `GanttTask`, `GanttOptions`, …),
and `GanttDataSource` from `@gantryjs/vanilla`.

### Unset and cleared props

A prop you never pass leaves the element alone: it keeps its default, or the value an attribute or
`bind:element` code gave it. A prop that goes back to `undefined` is forwarded as `undefined`,
which restores the element's default (`showToolbar` → `true`, `options` → `{}`, …).

### Data props and reactivity

`tasks`, `columns`, `annotations` and `options` are copied **one level** whenever they change:
the element gets a plain array (or object) holding your own items — never a `$state` proxy at the
top, never a deep clone. So:

- assigning a new array or object always updates the chart;
- with `$state`, `tasks.push(…)`, `tasks.splice(…)`, `tasks[i] = { …tasks[i], end }` and
  `options.viewMode = …` update it too;
- changing a field of an item in place (`tasks[i].end = …`) is **not** seen: replace the item.

For large plans, keep tasks in **`$state.raw`** and assign a new array: no proxy per task, and the
element receives your objects as they are.

The other props — `dataSource` (a `GanttDataSource` or a plain config object), `renderBar` and the
flags — are passed as they are, never copied.

## Server-side rendering

The component renders on the server (`svelte/server`, SvelteKit SSR) without touching the DOM: it
emits an empty `<gantry-element>` with your attributes, and the chart starts on the client when the
component hydrates or mounts.

## License

MIT
