<!--
  A custom tooltip: `tooltip.render` returns a DOM node (not a VNode), so Vue's `render()` draws a
  component (TooltipCard.vue) into one detached element; `tooltip.trigger` picks what opens it.
-->
<script setup lang="ts">
import { computed, h, onBeforeUnmount, render, shallowRef } from 'vue';
import { Gantry, type GanttOptions, type GanttTooltipRenderContext } from '@gantryjs/vue';
import {
  TOOLTIP_INITIAL,
  TOOLTIP_TRIGGERS,
  tooltipContent,
  tooltipOptions,
  tooltipTasks,
  type TooltipTrigger,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import TooltipCard from './TooltipCard.vue';

const dark = useDarkMode();
const tasks = tooltipTasks(new Date());
const trigger = shallowRef<TooltipTrigger>(TOOLTIP_INITIAL);

// One element for the whole page: each call patches the card for the task in place
let card: HTMLElement | undefined;
function renderTooltip({ task }: GanttTooltipRenderContext): HTMLElement {
  card ??= document.createElement('div');
  render(h(TooltipCard, tooltipContent(task)), card);
  return card;
}
onBeforeUnmount(() => card && render(null, card));

const options = computed<GanttOptions>(() => {
  const base = tooltipOptions(trigger.value);
  return { ...base, tooltip: { ...base.tooltip, render: renderTooltip } };
});
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="tooltip-trigger-label">Trigger</span>
        <div class="gs-seg" role="group" aria-labelledby="tooltip-trigger-label">
          <button
            v-for="choice in TOOLTIP_TRIGGERS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="trigger === choice.value"
            @click="trigger = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
    </div>
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
    <p class="gs-case-hint">
      Rest the pointer on a bar, or Tab to the bars and move with ↑ and ↓; Escape closes the tooltip.
    </p>
  </div>
</template>
