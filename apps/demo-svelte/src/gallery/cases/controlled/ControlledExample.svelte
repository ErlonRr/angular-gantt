<!--
  The app owns the tasks (`editing.controlled`): the chart proposes each change in `onBeforeChange`,
  where `detail.preventDefault()` vetoes it, and `onTasksChange` carries the proposed tasks, which
  the app sets itself. The chart applies nothing and keeps no history.
-->
<script lang="ts">
  import { Gantry, type GanttBeforeChangeEvent } from '@gantryjs/svelte';
  import {
    CONTROLLED_INITIAL,
    CONTROLLED_OPTIONS,
    controlledDecision,
    controlledTasks,
    pushLog,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The plan as it was, built once: Reset sets it again
  const initial = controlledTasks(new Date());
  // `$state.raw`: the tasks are replaced, never mutated, and stay the objects the event proposed
  let tasks = $state.raw(initial);
  let lockDone = $state(CONTROLLED_INITIAL.lockDone);
  let log = $state.raw<string[]>([]);

  // The app's rule, synchronously: veto any change to a finished task while the lock is on
  function decide(detail: GanttBeforeChangeEvent) {
    const { veto, line } = controlledDecision(detail, lockDone);
    if (veto) detail.preventDefault();
    log = pushLog(log, line);
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <label class="gs-switch gs-case-control">
      <span>Lock finished tasks</span>
      <input type="checkbox" role="switch" bind:checked={lockDone} />
    </label>
    <button type="button" class="gs-btn gs-btn--sm" onclick={() => (tasks = initial)}>Reset</button>
  </div>

  <Gantry
    class="gs-chart gs-case-chart"
    {tasks}
    options={CONTROLLED_OPTIONS}
    darkMode={siteTheme.dark}
    onBeforeChange={decide}
    onTasksChange={detail => (tasks = detail.tasks)}
  />
  <ol class="gs-case-log" aria-label="Decisions">
    {#each log as line, i (i)}
      <li>{line}</li>
    {/each}
  </ol>
</div>
