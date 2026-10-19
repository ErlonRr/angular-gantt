<!--
  Density: compact, normal or comfortable rows, header and toolbar (`density`). The chart sets
  its row and bar heights on its element as read-only CSS variables: the side list copies them
  and its CSS uses them, so it keeps the chart's row pitch without knowing the density.
-->
<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  DENSITIES,
  DENSITY_CSS_VARIABLES,
  DENSITY_INITIAL,
  densityOptions,
  densityTasks,
  type DensityCssVariable,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = densityTasks(new Date());
const density = shallowRef(DENSITY_INITIAL);
const options = computed(() => densityOptions(density.value));

const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const layout = shallowRef<Partial<Record<DensityCssVariable, string>>>({});

function copyVariables() {
  const el = chart.value?.element;
  if (!el) return;
  const style = getComputedStyle(el);
  layout.value = Object.fromEntries(DENSITY_CSS_VARIABLES.map(name => [name, style.getPropertyValue(name)]));
}
// Once mounted, then after each render with new options ('post'): the chart has them by then
onMounted(copyVariables);
watch(options, copyVariables, { flush: 'post' });
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="density-density-label">Density</span>
        <div class="gs-seg" role="group" aria-labelledby="density-density-label">
          <button
            v-for="choice in DENSITIES"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="density === choice.value"
            @click="density = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
    </div>
    <div class="gs-case-split">
      <div>
        <p id="density-list-caption" class="gs-case-caption">Page content at the chart’s row pitch</p>
        <ul class="density-list" aria-labelledby="density-list-caption" :style="layout">
          <li v-for="task in tasks" :key="task.id">
            <span>{{ task.name }}</span>
          </li>
        </ul>
      </div>
      <Gantry ref="chart" class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
    </div>
    <p class="gs-case-hint">
      The chart sets
      <code class="gs-code-inline">--gantt-row-height: {{ layout['--gantt-row-height'] }}</code> and
      <code class="gs-code-inline">--gantt-bar-height: {{ layout['--gantt-bar-height'] }}</code> on its element.
    </p>
  </div>
</template>

<style scoped>
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
