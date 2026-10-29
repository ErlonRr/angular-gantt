<!--
  A resource view (`rows`): one row per person and team, drawing the daily load against the capacity line,
  the part above it hatched. `resources` holds the people, each task's `resources` the assignments.
  `onStateChange` brings the toolbar's Rows toggle and zoom back to the controls.
-->
<script lang="ts">
  import { Gantry, type GanttState } from '@gantryjs/svelte';
  import {
    LOAD_SCALES,
    RESOURCE_LOAD_HINT,
    RESOURCE_LOAD_INITIAL,
    RESOURCE_ROWS,
    loadOptions,
    loadResources,
    loadTasks,
    overloadSummary,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const now = new Date();
  const tasks = loadTasks(now);
  const resources = loadResources();

  let rows = $state(RESOURCE_LOAD_INITIAL.rows);
  let viewMode = $state(RESOURCE_LOAD_INITIAL.viewMode);
  let unassigned = $state(RESOURCE_LOAD_INITIAL.unassigned);
  let overallocation = $state(RESOURCE_LOAD_INITIAL.overallocation);
  const options = $derived(loadOptions({ rows, viewMode, unassigned, overallocation }, now));
  const summary = $derived(overloadSummary(tasks, resources, options));

  // The chart's own toolbar switches the rows and the zoom too
  function follow(state: GanttState) {
    if (state.rows) rows = state.rows;
    if (state.viewMode) viewMode = state.viewMode;
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="resource-load-rows-label">Rows</span>
      <div id="resource-load-rows" class="gs-seg" role="group" aria-labelledby="resource-load-rows-label">
        {#each RESOURCE_ROWS as r (r.value)}
          <button type="button" class="gs-seg-btn" aria-pressed={rows === r.value} onclick={() => (rows = r.value)}>
            {r.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="resource-load-scale-label">Scale</span>
      <div id="resource-load-scale" class="gs-seg" role="group" aria-labelledby="resource-load-scale-label">
        {#each LOAD_SCALES as s (s.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={viewMode === s.value}
            onclick={() => (viewMode = s.value)}
          >
            {s.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Show unassigned</span>
      <input id="resource-load-unassigned" type="checkbox" role="switch" bind:checked={unassigned} />
    </label>
    <label class="gs-switch gs-case-control">
      <span>Highlight over-allocation</span>
      <input id="resource-load-over" type="checkbox" role="switch" bind:checked={overallocation} />
    </label>
  </div>

  <Gantry
    class="gs-chart gs-case-chart"
    {tasks}
    {resources}
    {options}
    darkMode={siteTheme.dark}
    onStateChange={follow}
  />
  <p class="gs-case-status">{summary}</p>
  <p class="gs-case-hint">{RESOURCE_LOAD_HINT}</p>
</div>
