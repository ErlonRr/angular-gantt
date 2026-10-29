<!--
  The critical path, lags and float counted in working time: `calendar.durations` picks working or
  calendar days and `nonWorkingTime.weekends` the days off. The Float column is a `ColumnDef` with a
  `render` function; the line under the chart follows each edit reported by `@tasks-change`.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  CRITICAL_DURATIONS,
  CRITICAL_FLOAT_HINT,
  CRITICAL_FLOAT_INITIAL,
  criticalFloatOptions,
  criticalFloatTasks,
  criticalSummary,
  type CriticalFloatState,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// Uncontrolled: the chart keeps each edit, so `initial` is only the starting plan
const initial = criticalFloatTasks(new Date());
const tasks = shallowRef(initial);
const durations = shallowRef<CriticalFloatState['durations']>(CRITICAL_FLOAT_INITIAL.durations);
const saturdays = shallowRef(CRITICAL_FLOAT_INITIAL.saturdays);
const options = computed(() => criticalFloatOptions({ durations: durations.value, saturdays: saturdays.value }));
const summary = computed(() => criticalSummary(tasks.value, options.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="critical-float-durations-label">Durations</span>
        <div class="gs-seg" role="group" aria-labelledby="critical-float-durations-label">
          <button
            v-for="choice in CRITICAL_DURATIONS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="durations === choice.value"
            @click="durations = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Work on Saturdays</span>
        <input id="critical-float-saturdays" v-model="saturdays" type="checkbox" role="switch" />
      </label>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="initial"
      :options="options"
      :dark-mode="dark"
      @tasks-change="detail => (tasks = detail.tasks)"
    />
    <p class="gs-case-status">{{ summary }}</p>
    <p class="gs-case-hint">{{ CRITICAL_FLOAT_HINT }}</p>
  </div>
</template>
