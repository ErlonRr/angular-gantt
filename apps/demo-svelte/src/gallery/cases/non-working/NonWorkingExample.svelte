<!--
  Non-working time (`nonWorkingTime`): weekends and holidays shaded, hatched or greyed out (`style`);
  on the hour scale, the hours outside `workingHours` and an `intensiveHours` window too. The Scale
  buttons follow the chart's own zoom (`viewModeChange`).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    NON_WORKING_INITIAL,
    NON_WORKING_STYLES,
    NON_WORKING_VIEW_MODES,
    nonWorkingOptions,
    nonWorkingTasks,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The holidays are placed around the same `now` as the tasks
  const now = new Date();
  const tasks = nonWorkingTasks(now);
  let style = $state(NON_WORKING_INITIAL.style);
  // Days or Hours, or a level picked in the chart's toolbar (then no Scale button is pressed)
  let viewMode = $state<string>(NON_WORKING_INITIAL.viewMode);
  const options = $derived(nonWorkingOptions(style, viewMode, now));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="non-working-style-label">Non-working time</span>
      <div class="gs-seg" role="group" aria-labelledby="non-working-style-label">
        {#each NON_WORKING_STYLES as s (s.value)}
          <button type="button" class="gs-seg-btn" aria-pressed={style === s.value} onclick={() => (style = s.value)}>
            {s.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="non-working-scale-label">Scale</span>
      <div class="gs-seg" role="group" aria-labelledby="non-working-scale-label">
        {#each NON_WORKING_VIEW_MODES as m (m.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={viewMode === m.value}
            onclick={() => (viewMode = m.value)}
          >
            {m.label}
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
    onViewModeChange={e => (viewMode = e.viewMode)}
  />
</div>
