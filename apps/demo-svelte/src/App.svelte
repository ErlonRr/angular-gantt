<script lang="ts">
  import { Gantry } from '@gantry/svelte';
  import { DEMO_TASKS } from '@gantry/core';
  import type { GanttTask } from '@gantry/core';

  let tasks: GanttTask[] = $state(DEMO_TASKS);
  let viewMode = $state<'Day' | 'Week' | 'Month'>('Month');

  let columns = [
    { key: 'name', label: 'Initiative', width: 250 },
    { key: 'progress', label: 'Progress (%)', width: 100 }
  ];

  function handleTaskUpdate(e: CustomEvent<GanttTask>) {
    const task = e.detail;
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      tasks[idx] = task;
    }
  }
</script>

<div style="height: 100vh; display: flex; flex-direction: column; background: #0f172a; color: #f1f5f9; margin: 0; font-family: system-ui, sans-serif;">
  <header style="display: flex; align-items: center; gap: 16px; padding: 8px 14px; background: #1e293b; border-bottom: 1px solid #334155; flex-shrink: 0;">
    <div style="display: flex; align-items: center; gap: 5px;">
      <span style="font-family: monospace; font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Features</span>
      <button style="padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; background: #334155; color: #f1f5f9; border: 1px solid #475569;">Baseline</button>
      <button style="padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; background: #334155; color: #f1f5f9; border: 1px solid #475569;">Critical path</button>
    </div>
    <div style="display: flex; align-items: center; gap: 5px;">
      <span style="font-family: monospace; font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">View</span>
      <select bind:value={viewMode} style="padding: 4px; border-radius: 4px; background: #334155; color: white; border: 1px solid #475569;">
        <option value="Day">Day</option>
        <option value="Week">Week</option>
        <option value="Month">Month</option>
      </select>
    </div>
  </header>
  <div style="flex: 1; overflow: hidden;">
      <Gantry 
        {tasks}
        {columns}
        options={{ viewMode }}
        on:taskUpdated={handleTaskUpdate}
      />
  </div>
</div>
