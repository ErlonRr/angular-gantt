<!--
  Compact, normal or comfortable rows, header and toolbar (`density`). The chart sets its row
  and bar heights as read-only CSS variables on its element; the side list copies them and takes
  its row pitch from them, so it follows the chart without knowing the density.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Gantry, type GantryElement, type GanttDensity } from '@gantryjs/svelte';
  import {
    DENSITIES,
    DENSITY_CSS_VARIABLES,
    DENSITY_INITIAL,
    densityOptions,
    densityTasks,
    type DensityCssVariable,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = densityTasks(new Date());
  let density = $state(DENSITY_INITIAL);
  const options = $derived(densityOptions(density));

  let chart = $state<GantryElement>();
  /** `--gantt-row-height` and `--gantt-bar-height`, as the chart last set them on its element */
  let layout = $state.raw<Partial<Record<DensityCssVariable, string>>>({});

  function copyVariables() {
    if (!chart) return;
    const style = getComputedStyle(chart);
    layout = Object.fromEntries(DENSITY_CSS_VARIABLES.map(name => [name, style.getPropertyValue(name)]));
  }
  onMount(copyVariables);

  async function choose(value: GanttDensity) {
    density = value;
    await tick(); // the chart has its new options, and its variables with them
    copyVariables();
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="density-density-label">Density</span>
      <div class="gs-seg" role="group" aria-labelledby="density-density-label">
        {#each DENSITIES as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={density === choice.value}
            onclick={() => choose(choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="gs-case-split">
    <div>
      <p id="density-list-caption" class="gs-case-caption">Page content at the chart’s row pitch</p>
      <ul
        class="density-list"
        aria-labelledby="density-list-caption"
        style:--gantt-row-height={layout['--gantt-row-height']}
        style:--gantt-bar-height={layout['--gantt-bar-height']}
      >
        {#each tasks as task (task.id)}
          <li><span>{task.name}</span></li>
        {/each}
      </ul>
    </div>
    <Gantry bind:element={chart} class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
  </div>

  <p class="gs-case-hint">
    The chart sets
    <code class="gs-code-inline">--gantt-row-height: {layout['--gantt-row-height']}</code> and
    <code class="gs-code-inline">--gantt-bar-height: {layout['--gantt-bar-height']}</code> on its element.
  </p>
</div>

<style>
  /* The side list: its rows take the chart's --gantt-row-height, its markers --gantt-bar-height. */
  .density-list {
    margin: 0;
    padding: 0;
    border: 1px solid var(--gs-border);
    border-radius: var(--gs-radius);
    list-style: none;
    overflow: hidden;
  }
  .density-list li {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--gantt-row-height);
    padding: 0 10px;
    border-bottom: 1px solid var(--gs-border);
    color: var(--gs-text);
    font-size: 13px;
  }
  .density-list li:last-child {
    border-bottom: 0;
  }
  .density-list li::before {
    content: '';
    flex: none;
    width: 4px;
    height: var(--gantt-bar-height);
    border-radius: 2px;
    background: var(--gs-accent-solid);
  }
  .density-list span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
