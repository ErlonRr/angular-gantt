<!--
  A working calendar (`calendar`): durations count working days, so a bar dragged across a weekend or
  a holiday keeps its working days and stretches over the days off, and edits skip non-working time
  (`skipNonWorking`). `onTasksChange` hands the edited tasks back for the status line.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    WORKING_DAYS_HINT,
    WORKING_DAYS_INITIAL,
    WORKING_DURATIONS,
    WORKING_SHADINGS,
    workingDaysOptions,
    workingDaysTasks,
    workingSummary,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The holidays are placed around the same `now` as the tasks
  const now = new Date();
  const tasks = workingDaysTasks(now);
  // The edited tasks: the chart keeps them itself, `onTasksChange` reports them for the status line
  let edited = $state.raw(tasks);

  let durations = $state(WORKING_DAYS_INITIAL.durations);
  let skipNonWorking = $state(WORKING_DAYS_INITIAL.skipNonWorking);
  let shading = $state(WORKING_DAYS_INITIAL.shading);
  const options = $derived(workingDaysOptions({ durations, skipNonWorking, shading }, now));
  const summary = $derived(workingSummary(edited, options));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="working-days-durations-label">Durations</span>
      <div class="gs-seg" role="group" aria-labelledby="working-days-durations-label">
        {#each WORKING_DURATIONS as d (d.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={durations === d.value}
            onclick={() => (durations = d.value)}
          >
            {d.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Skip non-working time</span>
      <input id="working-days-skip" type="checkbox" role="switch" bind:checked={skipNonWorking} />
    </label>
    <div class="gs-case-control">
      <span id="working-days-shading-label">Shading</span>
      <div class="gs-seg" role="group" aria-labelledby="working-days-shading-label">
        {#each WORKING_SHADINGS as s (s.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={shading === s.value}
            onclick={() => (shading = s.value)}
          >
            {s.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <Gantry
    class="gs-chart gs-case-chart"
    {tasks}
    {options}
    darkMode={siteTheme.dark}
    onTasksChange={detail => (edited = detail.tasks)}
  />
  <p class="gs-case-status">{summary}</p>
  <p class="gs-case-hint">{WORKING_DAYS_HINT}</p>
</div>
