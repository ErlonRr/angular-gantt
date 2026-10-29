<!--
  A shift calendar (`calendar.unit: 'hour'`): working hours with a lunch break and a short Friday
  (`nonWorkingTime.workingHours`); bars skip the hours off, and Duration cells read and parse hours,
  a day being `calendar.hoursPerDay`. The Scale buttons follow the chart's own zoom (`viewModeChange`).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    SHIFT_FRIDAYS,
    SHIFT_HINT,
    SHIFT_HOURS_PER_DAY,
    SHIFT_INITIAL,
    SHIFT_VIEW_MODES,
    shiftOptions,
    shiftTasks,
    type ShiftState,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = shiftTasks(new Date());
  // `viewMode` is Hours or Days, or a level picked in the chart's toolbar (then no Scale button is pressed)
  const state = $state<ShiftState>({ ...SHIFT_INITIAL });
  const options = $derived(shiftOptions(state));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="shift-calendar-scale-label">Scale</span>
      <div class="gs-seg" role="group" aria-labelledby="shift-calendar-scale-label">
        {#each SHIFT_VIEW_MODES as m (m.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={state.viewMode === m.value}
            onclick={() => (state.viewMode = m.value)}
          >
            {m.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <label for="shift-calendar-hours">Hours per day</label>
      <!-- `bind:value` keeps the hours as numbers -->
      <select id="shift-calendar-hours" class="gs-select" bind:value={state.hoursPerDay}>
        {#each SHIFT_HOURS_PER_DAY as h (h.value)}
          <option value={h.value}>{h.label}</option>
        {/each}
      </select>
    </div>
    <div class="gs-case-control">
      <span id="shift-calendar-friday-label">Friday</span>
      <div class="gs-seg" role="group" aria-labelledby="shift-calendar-friday-label">
        {#each SHIFT_FRIDAYS as f (f.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={state.friday === f.value}
            onclick={() => (state.friday = f.value)}
          >
            {f.label}
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
    onViewModeChange={e => (state.viewMode = e.viewMode)}
  />
  <p class="gs-case-hint">{SHIFT_HINT}</p>
</div>
