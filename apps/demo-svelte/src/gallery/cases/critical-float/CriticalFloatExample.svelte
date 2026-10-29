<!--
  The critical path, lags and float counted in working time: `calendar.durations` picks working or
  calendar days and `nonWorkingTime.weekends` the days off. The Float column is a `ColumnDef` with a
  `render` function; the line under the chart follows each edit reported by `onTasksChange`.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    CRITICAL_DURATIONS,
    CRITICAL_FLOAT_HINT,
    CRITICAL_FLOAT_INITIAL,
    criticalFloatOptions,
    criticalFloatTasks,
    criticalSummary,
    type CriticalFloatState,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // Uncontrolled: the chart keeps each edit, so `initial` is only the starting plan
  const initial = criticalFloatTasks(new Date());
  // `$state.raw`: the tasks are replaced, never mutated
  let tasks = $state.raw(initial);
  let durations = $state<CriticalFloatState['durations']>(CRITICAL_FLOAT_INITIAL.durations);
  let saturdays = $state(CRITICAL_FLOAT_INITIAL.saturdays);
  const options = $derived(criticalFloatOptions({ durations, saturdays }));
  const summary = $derived(criticalSummary(tasks, options));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="critical-float-durations-label">Durations</span>
      <div class="gs-seg" role="group" aria-labelledby="critical-float-durations-label">
        {#each CRITICAL_DURATIONS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={durations === choice.value}
            onclick={() => (durations = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Work on Saturdays</span>
      <input id="critical-float-saturdays" type="checkbox" role="switch" bind:checked={saturdays} />
    </label>
  </div>

  <Gantry
    class="gs-chart gs-case-chart"
    tasks={initial}
    {options}
    darkMode={siteTheme.dark}
    onTasksChange={detail => (tasks = detail.tasks)}
  />
  <p class="gs-case-status">{summary}</p>
  <p class="gs-case-hint">{CRITICAL_FLOAT_HINT}</p>
</div>
