<!--
  Tooltip content of your own: `tooltip.render` returns a DOM node (tooltip-card.ts), not a snippet,
  and `tooltip.trigger` opens it on hover, on keyboard focus, or both.
-->
<script lang="ts">
  import { Gantry, type GanttOptions } from '@gantryjs/svelte';
  import {
    TOOLTIP_INITIAL,
    TOOLTIP_TRIGGERS,
    tooltipOptions,
    tooltipTasks,
    type TooltipTrigger,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';
  import { tooltipCard } from './tooltip-card';

  const tasks = tooltipTasks(new Date());
  let trigger = $state<TooltipTrigger>(TOOLTIP_INITIAL);
  const options = $derived.by((): GanttOptions => {
    const base = tooltipOptions(trigger);
    return { ...base, tooltip: { ...base.tooltip, render: tooltipCard } };
  });
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="tooltip-trigger-label">Trigger</span>
      <div class="gs-seg" role="group" aria-labelledby="tooltip-trigger-label">
        {#each TOOLTIP_TRIGGERS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={trigger === choice.value}
            onclick={() => (trigger = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />

  <p class="gs-case-hint">
    Rest the pointer on a bar, or Tab to the bars and move with ↑ and ↓; Escape closes the tooltip.
  </p>
</div>
