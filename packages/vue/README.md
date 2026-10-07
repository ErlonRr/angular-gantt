# @gantry/vue

The free, full-featured **Gantry Gantt chart for Vue 3** (3.5+): drag & resize,
dependencies, critical path, baselines, virtual scrolling, sorting, lazy loading,
theming and i18n. MIT licensed.

A thin binding over the [`<gantry-element>`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla) Web Component — no
`isCustomElement` compiler configuration needed.

## Install

```bash
npm i @gantry/vue
```

## Usage

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Gantry, ViewMode, type GanttTask, type TaskDragEvent } from '@gantry/vue';

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

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla#properties): `tasks`, `options`,
  `columns`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`,
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`.
- **Events** carry the event detail: `@task-dragged`, `@task-resized`,
  `@selection-change`, `@row-click`, `@row-dblclick`, `@view-mode-change`.
- **Template ref** — `.element` is the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla#methods).

Array props (`tasks`, `columns`, `annotations`) are watched one level deep, so
`tasks.value.push(…)` or replacing an item re-renders the chart.

All `@gantry/core` types and helpers are re-exported.

## License

MIT
