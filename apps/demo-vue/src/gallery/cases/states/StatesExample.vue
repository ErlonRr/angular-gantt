<!--
  The chart's loading, empty and error states: the `loading` and `errorMessage` props (Retry emits
  `retry`) and your own empty-state content in the `#empty` slot.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  STATES_EMPTY_ACTION,
  STATES_EMPTY_TEXT,
  STATES_INITIAL_MODE,
  STATES_MODES,
  STATES_OPTIONS,
  statesProps,
  statesTasks,
  type StatesMode,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = statesTasks(new Date());
const mode = shallowRef<StatesMode>(STATES_INITIAL_MODE);
// `tasks` (only in 'tasks'), `loading` and `errorMessage` for the chosen state
const chart = computed(() => statesProps(mode.value, tasks));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="states-mode-label">State</span>
        <div class="gs-seg" role="group" aria-labelledby="states-mode-label">
          <button
            v-for="m in STATES_MODES"
            :key="m.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="mode === m.value"
            @click="mode = m.value"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Retry on the error state: load again (here the tasks simply come back) -->
    <Gantry
      class="gs-chart gs-case-chart"
      v-bind="chart"
      :options="STATES_OPTIONS"
      :dark-mode="dark"
      @retry="mode = 'tasks'"
    >
      <!-- Shown instead of the built-in text while there are no tasks -->
      <template #empty>
        <div class="gs-case-empty">
          <p>{{ STATES_EMPTY_TEXT }}</p>
          <button type="button" class="gs-btn gs-btn--sm" @click="mode = 'tasks'">{{ STATES_EMPTY_ACTION }}</button>
        </div>
      </template>
    </Gantry>
  </div>
</template>
