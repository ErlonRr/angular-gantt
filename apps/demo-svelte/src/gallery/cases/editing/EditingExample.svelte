<!--
  Bars you drag, resize, set the progress of (the grip, or ↑ / ↓ in move mode) and undo. The buttons
  call `undo()` / `redo()` on the element from `bind:element`, `onHistoryChange` gives `canUndo` /
  `canRedo` (`aria-disabled`, not `disabled`: an unavailable button keeps focus), and `onTasksChange`
  feeds the log of the last changes.
-->
<script lang="ts">
  import { Gantry, type GantryElement, type GanttTasksChangeEvent } from '@gantryjs/svelte';
  import { EDITING_OPTIONS, describeTasksChange, editingTasks, pushLog } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // Uncontrolled: the chart keeps each edit, so these tasks are only the starting plan
  const tasks = editingTasks(new Date());
  let gantt = $state<GantryElement>();
  let history = $state.raw({ canUndo: false, canRedo: false });
  let log = $state.raw<string[]>([]);

  function logChange(change: GanttTasksChangeEvent) {
    log = pushLog(log, describeTasksChange(change, change.tasks));
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <button
      id="editing-undo"
      type="button"
      class="gs-btn gs-btn--sm"
      aria-disabled={history.canUndo ? undefined : 'true'}
      onclick={() => history.canUndo && gantt?.undo()}
    >
      Undo
    </button>
    <button
      id="editing-redo"
      type="button"
      class="gs-btn gs-btn--sm"
      aria-disabled={history.canRedo ? undefined : 'true'}
      onclick={() => history.canRedo && gantt?.redo()}
    >
      Redo
    </button>
  </div>

  <Gantry
    bind:element={gantt}
    class="gs-chart gs-case-chart"
    {tasks}
    options={EDITING_OPTIONS}
    darkMode={siteTheme.dark}
    onHistoryChange={state => (history = state)}
    onTasksChange={logChange}
  />

  <!-- Not a live region: the chart announces each change itself -->
  <ol class="gs-case-log" aria-label="Last changes">
    {#each log as line, i (i)}
      <li>{line}</li>
    {/each}
  </ol>
</div>
