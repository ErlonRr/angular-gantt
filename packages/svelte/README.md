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

The chart fills its container (`display: block; width: 100%; height: 100%`, from the element's own
`:host` style): give the container a height, or give `<Gantry>` a `class` or `style`, which
overrides it (the component adds no inline style of its own). `options` takes every `GanttOptions`
field — see [Configuration](https://github.com/ErlonRr/gantryjs#configuration).

## API

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#properties):
  `tasks`, `columns`, `options`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`,
  `enableResize`, `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, `loading`,
  `errorMessage`. Each is set as an element property, and only when it changes.
- **Callback props** receive the [event](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#events)
  `detail`: `onTaskDragged`, `onTaskResized`, `onSelectionChange`, `onRowClick`, `onRowDblClick`,
  `onViewModeChange`, `onStateChange`, `onLoadError`, `onRetry`. The listeners are attached before the first
  property is set, so events fired while the chart starts (`onViewModeChange` for
  `options.viewMode`) arrive too; a changed callback is used from the next event on. Callbacks
  run untracked: an event fired inside your `$effect` (`gantt.setViewMode(mode)`) does not make
  that effect depend on the callback or on the state it reads.
- **`bind:element`** — the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods)
  (`zoomIn()`, `scrollToTask()`, `setState()`, …).
- **`empty`** (snippet) — the empty-state content, rendered in `<div slot="empty">` inside the
  element (replaces `labels.emptyState`; see below).
- **`children`** — rendered as they are in the element's light DOM, after `empty`.
- **Other props** (`class`, `id`, `style`, `aria-*`, `data-*`, attributes such as `dark-mode`) go
  to the element as they are.

All `@gantryjs/core` types and helpers are re-exported (`ViewMode`, `GanttTask`, `GanttOptions`, …),
and `GanttDataSource` from `@gantryjs/vanilla`.

### Loading, error and empty states

```svelte
<Gantry {tasks} {loading} errorMessage={error ? 'Couldn’t load the plan' : null} onRetry={reload}>
  {#snippet empty()}
    No tasks yet: <button onclick={addTask}>add one</button> to start.
  {/snippet}
</Gantry>
```

`loading` shows the loading state and `errorMessage` the error state, whose Retry button calls
`onRetry`: `{ source: 'error' }` for the `errorMessage` state (load again yourself), `{ source:
'dataSource' }` after a failed first `dataSource` page (the element also calls
`dataSource.retry()`). The `empty` snippet replaces the text shown when there are no tasks: the
component renders it in a `<div slot="empty">`, the element's empty-state slot.

Use the `empty` snippet rather than a `<div slot="empty">` child: an element with a `slot`
attribute directly inside `<Gantry>` is a legacy named slot to Svelte and is never rendered.

### Options and behaviour

`options` takes every `GanttOptions` field, documented once for every binding in
[Configuration](https://github.com/ErlonRr/gantryjs#configuration): among them the
[toolbar, legend and marker lane](https://github.com/ErlonRr/gantryjs#toolbar-legend-and-markers), the
[tooltip](https://github.com/ErlonRr/gantryjs#tooltip) (`tooltip.render` returns a string or a DOM node, not a snippet) and
`keyboard.characterShortcuts`. Keyboard navigation and move mode, touch gestures, zoom gestures,
screen-reader semantics and forced colors behave as in every Gantry binding: see
[Keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus), [Touch and pointer](https://github.com/ErlonRr/gantryjs#touch-and-pointer),
[Zoom](https://github.com/ErlonRr/gantryjs#zoom), [Screen readers](https://github.com/ErlonRr/gantryjs#screen-readers) and [Forced colors](https://github.com/ErlonRr/gantryjs#forced-colors).
`gantt?.fitToScreen()` (with `bind:element`) zooms to the finest level that shows every task.

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
emits the `<gantry-element>` tag with your attributes and children (no inline style of its own, so
the markup needs no `'unsafe-inline'` style policy), and the chart starts on the client when the
component hydrates or mounts.

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
