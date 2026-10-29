<!--
  A working calendar (`calendar`): durations count working days, so a bar dragged across a weekend or
  a holiday keeps its working days and stretches over the days off, and edits skip non-working time
  (`skipNonWorking`). `@tasks-change` hands the edited tasks back for the status line.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  WORKING_DAYS_HINT,
  WORKING_DAYS_INITIAL,
  WORKING_DURATIONS,
  WORKING_SHADINGS,
  workingDaysOptions,
  workingDaysTasks,
  workingSummary,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The holidays are placed around the same `now` as the tasks
const now = new Date();
const tasks = workingDaysTasks(now);
// The edited tasks: the chart keeps them itself, `@tasks-change` reports them for the status line
const edited = shallowRef(tasks);

const durations = shallowRef(WORKING_DAYS_INITIAL.durations);
const skipNonWorking = shallowRef(WORKING_DAYS_INITIAL.skipNonWorking);
const shading = shallowRef(WORKING_DAYS_INITIAL.shading);
const options = computed(() =>
  workingDaysOptions({ durations: durations.value, skipNonWorking: skipNonWorking.value, shading: shading.value }, now),
);
const summary = computed(() => workingSummary(edited.value, options.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="working-days-durations-label">Durations</span>
        <div class="gs-seg" role="group" aria-labelledby="working-days-durations-label">
          <button
            v-for="d in WORKING_DURATIONS"
            :key="d.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="durations === d.value"
            @click="durations = d.value"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Skip non-working time</span>
        <input id="working-days-skip" v-model="skipNonWorking" type="checkbox" role="switch" />
      </label>
      <div class="gs-case-control">
        <span id="working-days-shading-label">Shading</span>
        <div class="gs-seg" role="group" aria-labelledby="working-days-shading-label">
          <button
            v-for="s in WORKING_SHADINGS"
            :key="s.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="shading === s.value"
            @click="shading = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="options"
      :dark-mode="dark"
      @tasks-change="detail => (edited = detail.tasks)"
    />
    <p class="gs-case-status">{{ summary }}</p>
    <p class="gs-case-hint">{{ WORKING_DAYS_HINT }}</p>
  </div>
</template>
