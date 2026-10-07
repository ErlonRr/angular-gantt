<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { Gantry, ViewMode, type GanttTask, type TaskDragEvent, type TaskResizeEvent } from '@gantry/vue';
import { DEMO_TASKS, DEMO_ANNOTATIONS } from '@gantry/core/demo';
import '../../demo.css';

const gantt = shallowRef<InstanceType<typeof Gantry> | null>(null);
const tasks = ref<GanttTask[]>([...DEMO_TASKS]);
const viewMode = ref<ViewMode>(ViewMode.Month);
const baseline = ref(false);
const criticalPath = ref(false);
const dark = ref(true);
const log = ref('');

const options = computed(() => ({ viewMode: viewMode.value, baseline: baseline.value, criticalPath: criticalPath.value }));

function applyDates(e: TaskDragEvent | TaskResizeEvent) {
  const task = tasks.value.find(t => t.id === e.taskId);
  if (task) Object.assign(task, { start: e.newStart, end: e.newEnd });
}
function onDragged(e: TaskDragEvent) {
  applyDates(e);
  log.value = `moved ${e.taskId} by ${e.daysMoved} day(s)`;
}
function onResized(e: TaskResizeEvent) {
  applyDates(e);
  log.value = `resized ${e.taskId} (${e.handle}) by ${e.daysDelta} day(s)`;
}
</script>

<template>
  <div class="demo">
    <header class="demo-header">
      <h1>Gantry · Vue</h1>
      <div class="demo-group">
        <span class="demo-label">Features</span>
        <button :aria-pressed="baseline" @click="baseline = !baseline">Baseline</button>
        <button :aria-pressed="criticalPath" @click="criticalPath = !criticalPath">Critical path</button>
        <button :aria-pressed="dark" @click="dark = !dark">Dark</button>
        <button @click="gantt?.element?.scrollToToday()">Today</button>
      </div>
      <div class="demo-group">
        <span class="demo-label">View</span>
        <select v-model="viewMode">
          <option v-for="v in Object.values(ViewMode)" :key="v">{{ v }}</option>
        </select>
      </div>
      <span class="demo-log">{{ log }}</span>
    </header>
    <Gantry
      ref="gantt"
      class="demo-chart"
      :tasks="tasks"
      :annotations="DEMO_ANNOTATIONS"
      :options="options"
      :dark-mode="dark"
      show-legend
      @task-dragged="onDragged"
      @task-resized="onResized"
      @selection-change="e => (log = `selected: ${e.selectedIds.join(', ') || 'none'}`)"
      @view-mode-change="e => (viewMode = e.viewMode)"
    />
  </div>
</template>
