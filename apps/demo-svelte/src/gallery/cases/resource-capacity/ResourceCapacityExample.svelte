<!--
  Capacity and working time (`resources`, `calendar`): Ana's capacity moves the line her load is
  measured against, the Engineering team is two people, and with the working calendar on the weekend
  and the holiday carry no load. The chart and the status line follow the controls.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    CAPACITIES,
    CAPACITY_HINT,
    CAPACITY_INITIAL,
    capacityOptions,
    capacityResources,
    capacitySummary,
    capacityTasks,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The holiday is placed around the same `now` as the tasks
  const now = new Date();
  const tasks = capacityTasks(now);

  let anaCapacity = $state(CAPACITY_INITIAL.anaCapacity);
  let calendar = $state(CAPACITY_INITIAL.calendar);
  const resources = $derived(capacityResources({ anaCapacity, calendar }));
  const options = $derived(capacityOptions({ anaCapacity, calendar }, now));
  const summary = $derived(capacitySummary(tasks, resources, options));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="resource-capacity-capacity-label">Ana's capacity</span>
      <div class="gs-seg" role="group" aria-labelledby="resource-capacity-capacity-label">
        {#each CAPACITIES as c (c.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={anaCapacity === c.value}
            onclick={() => (anaCapacity = c.value)}
          >
            {c.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Working calendar</span>
      <input id="resource-capacity-calendar" type="checkbox" role="switch" bind:checked={calendar} />
    </label>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {resources} {options} darkMode={siteTheme.dark} />
  <p class="gs-case-status">{summary}</p>
  <p class="gs-case-hint">{CAPACITY_HINT}</p>
</div>
