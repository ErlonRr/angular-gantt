<!--
  Non-working time (`nonWorkingTime`): weekends and holidays shaded, hatched or greyed out (`style`);
  on the hour scale, the hours outside `workingHours` and an `intensiveHours` window too. The Scale
  buttons follow the chart's own zoom (`viewModeChange`).
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  NON_WORKING_INITIAL,
  NON_WORKING_STYLES,
  NON_WORKING_VIEW_MODES,
  nonWorkingOptions,
  nonWorkingTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The holidays are placed around the same `now` as the tasks
const now = new Date();
const tasks = nonWorkingTasks(now);

const style = shallowRef(NON_WORKING_INITIAL.style);
// Days or Hours, or a level picked in the chart's toolbar (then no Scale button is pressed)
const viewMode = shallowRef<string>(NON_WORKING_INITIAL.viewMode);
const options = computed(() => nonWorkingOptions(style.value, viewMode.value, now));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="non-working-style-label">Non-working time</span>
        <div class="gs-seg" role="group" aria-labelledby="non-working-style-label">
          <button
            v-for="s in NON_WORKING_STYLES"
            :key="s.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="style === s.value"
            @click="style = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="non-working-scale-label">Scale</span>
        <div class="gs-seg" role="group" aria-labelledby="non-working-scale-label">
          <button
            v-for="m in NON_WORKING_VIEW_MODES"
            :key="m.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="viewMode === m.value"
            @click="viewMode = m.value"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="options"
      :dark-mode="dark"
      @view-mode-change="e => (viewMode = e.viewMode)"
    />
  </div>
</template>
