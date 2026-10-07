<script lang="ts">
  import { Gantry, ViewMode, type GantryElement, type GanttTask, type TaskDragEvent, type TaskResizeEvent } from '@gantry/svelte';
  import { DEMO_TASKS, DEMO_ANNOTATIONS } from '@gantry/core/demo';
  import '../../demo.css';

  let gantt = $state<GantryElement>();
  let tasks = $state<GanttTask[]>([...DEMO_TASKS]);
  let viewMode = $state<ViewMode>(ViewMode.Month);
  let baseline = $state(false);
  let criticalPath = $state(false);
  let dark = $state(true);
  let log = $state('');

  const options = $derived({ viewMode, baseline, criticalPath });

  function applyDates(e: TaskDragEvent | TaskResizeEvent) {
    const task = tasks.find(t => t.id === e.taskId);
    if (task) Object.assign(task, { start: e.newStart, end: e.newEnd });
  }
</script>

<div class="demo">
  <header class="demo-header">
    <h1>Gantry · Svelte</h1>
    <div class="demo-group">
      <span class="demo-label">Features</span>
      <button aria-pressed={baseline} onclick={() => (baseline = !baseline)}>Baseline</button>
      <button aria-pressed={criticalPath} onclick={() => (criticalPath = !criticalPath)}>Critical path</button>
      <button aria-pressed={dark} onclick={() => (dark = !dark)}>Dark</button>
      <button onclick={() => gantt?.scrollToToday()}>Today</button>
    </div>
    <div class="demo-group">
      <span class="demo-label">View</span>
      <select bind:value={viewMode}>
        {#each Object.values(ViewMode) as v (v)}<option>{v}</option>{/each}
      </select>
    </div>
    <span class="demo-log">{log}</span>
  </header>
  <Gantry
    bind:element={gantt}
    class="demo-chart"
    {tasks}
    annotations={DEMO_ANNOTATIONS}
    {options}
    darkMode={dark}
    showLegend
    onTaskDragged={e => { applyDates(e); log = `moved ${e.taskId} by ${e.daysMoved} day(s)`; }}
    onTaskResized={e => { applyDates(e); log = `resized ${e.taskId} (${e.handle}) by ${e.daysDelta} day(s)`; }}
    onSelectionChange={e => (log = `selected: ${e.selectedIds.join(', ') || 'none'}`)}
    onViewModeChange={e => (viewMode = e.viewMode)}
  />
</div>
