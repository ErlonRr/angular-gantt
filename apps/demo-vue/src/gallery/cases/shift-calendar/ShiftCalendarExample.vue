<!--
  A shift calendar (`calendar.unit: 'hour'`): working hours with a lunch break and a short Friday
  (`nonWorkingTime.workingHours`); bars skip the hours off, and Duration cells read and parse hours,
  a day being `calendar.hoursPerDay`. The Scale buttons follow the chart's own zoom (`viewModeChange`).
-->
<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Gantry } from '@gantryjs/vue';
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
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = shiftTasks(new Date());

// `viewMode` is Hours or Days, or a level picked in the chart's toolbar (then no Scale button is pressed)
const state = reactive<ShiftState>({ ...SHIFT_INITIAL });
const options = computed(() => shiftOptions(state));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="shift-calendar-scale-label">Scale</span>
        <div class="gs-seg" role="group" aria-labelledby="shift-calendar-scale-label">
          <button
            v-for="m in SHIFT_VIEW_MODES"
            :key="m.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="state.viewMode === m.value"
            @click="state.viewMode = m.value"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <label for="shift-calendar-hours">Hours per day</label>
        <!-- `v-model` keeps the hours as numbers -->
        <select id="shift-calendar-hours" v-model="state.hoursPerDay" class="gs-select">
          <option v-for="h in SHIFT_HOURS_PER_DAY" :key="h.value" :value="h.value">{{ h.label }}</option>
        </select>
      </div>
      <div class="gs-case-control">
        <span id="shift-calendar-friday-label">Friday</span>
        <div class="gs-seg" role="group" aria-labelledby="shift-calendar-friday-label">
          <button
            v-for="f in SHIFT_FRIDAYS"
            :key="f.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="state.friday === f.value"
            @click="state.friday = f.value"
          >
            {{ f.label }}
          </button>
        </div>
      </div>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="options"
      :dark-mode="dark"
      @view-mode-change="e => (state.viewMode = e.viewMode)"
    />
    <p class="gs-case-hint">{{ SHIFT_HINT }}</p>
  </div>
</template>
