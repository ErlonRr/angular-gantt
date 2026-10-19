<!--
  Ten thousand rows, virtualised in both panes: only the rows in view are in the DOM. Keep a big
  plan out of deep reactivity: a `computed` (or a `shallowRef`) hands the array over as it is,
  where `ref()` would turn every task into a proxy.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import { LARGE_COUNT, LARGE_COUNTS, LARGE_OPTIONS, largeCaseTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const now = new Date();
const count = shallowRef(LARGE_COUNT);
// A new array for a new count: the chart compares the array, never its tasks
const tasks = computed(() => largeCaseTasks(count.value, now));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="large-rows-label">Rows</span>
        <div class="gs-seg" role="group" aria-labelledby="large-rows-label">
          <button
            v-for="choice in LARGE_COUNTS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="count === choice.value"
            @click="count = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
      <span class="gs-pill">{{ tasks.length.toLocaleString('en-US') }} tasks</span>
    </div>
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="LARGE_OPTIONS" :dark-mode="dark" />
    <p class="gs-case-hint">Scroll either pane: only the rows in view are in the DOM.</p>
  </div>
</template>
