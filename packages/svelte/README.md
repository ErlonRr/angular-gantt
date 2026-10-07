# @gantry/svelte

The free, full-featured **Gantry Gantt chart for Svelte 5**: drag & resize,
dependencies, critical path, baselines, virtual scrolling, sorting, lazy loading,
theming and i18n. MIT licensed.

A thin, runes-based binding over the [`<gantry-element>`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla) Web Component.

## Install

```bash
npm i @gantry/svelte
```

## Usage

```svelte
<script lang="ts">
  import { Gantry, ViewMode, type GantryElement, type GanttTask } from '@gantry/svelte';

  let gantt = $state<GantryElement>();
  let tasks = $state<GanttTask[]>([
    { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
  ]);
</script>

<div style="height: 500px">
  <button onclick={() => gantt?.scrollToToday()}>Today</button>
  <Gantry
    bind:element={gantt}
    {tasks}
    options={{ viewMode: ViewMode.Week, criticalPath: true }}
    darkMode="auto"
    onTaskDragged={e => {
      const task = tasks.find(t => t.id === e.taskId);
      if (task) Object.assign(task, { start: e.newStart, end: e.newEnd });
    }}
    onSelectionChange={e => console.log(e.selectedIds)}
  />
</div>
```

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla#properties): `tasks`, `options`,
  `columns`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`,
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, plus any HTML attribute.
- **Callback props** receive the event detail: `onTaskDragged`, `onTaskResized`,
  `onSelectionChange`, `onRowClick`, `onRowDblClick`, `onViewModeChange`.
- **`bind:element`** — the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla#methods).

`tasks` and `annotations` are tracked deeply, so mutating `$state` arrays re-renders the chart.

All `@gantry/core` types and helpers are re-exported.

## License

MIT
