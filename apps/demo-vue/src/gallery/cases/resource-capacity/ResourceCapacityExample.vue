<!--
  Capacity and working time (`resources`, `calendar`): Ana's capacity moves the line her load is
  measured against, the Engineering team is two people, and with the working calendar on the weekend
  and the holiday carry no load. The chart and the status line follow the controls.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  CAPACITIES,
  CAPACITY_HINT,
  CAPACITY_INITIAL,
  capacityOptions,
  capacityResources,
  capacitySummary,
  capacityTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The holiday is placed around the same `now` as the tasks
const now = new Date();
const tasks = capacityTasks(now);

const anaCapacity = shallowRef(CAPACITY_INITIAL.anaCapacity);
const calendar = shallowRef(CAPACITY_INITIAL.calendar);
const resources = computed(() => capacityResources({ anaCapacity: anaCapacity.value, calendar: calendar.value }));
const options = computed(() => capacityOptions({ anaCapacity: anaCapacity.value, calendar: calendar.value }, now));
const summary = computed(() => capacitySummary(tasks, resources.value, options.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="resource-capacity-capacity-label">Ana's capacity</span>
        <div class="gs-seg" role="group" aria-labelledby="resource-capacity-capacity-label">
          <button
            v-for="c in CAPACITIES"
            :key="c.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="anaCapacity === c.value"
            @click="anaCapacity = c.value"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Working calendar</span>
        <input id="resource-capacity-calendar" v-model="calendar" type="checkbox" role="switch" />
      </label>
    </div>

    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :resources="resources" :options="options" :dark-mode="dark" />
    <p class="gs-case-status">{{ summary }}</p>
    <p class="gs-case-hint">{{ CAPACITY_HINT }}</p>
  </div>
</template>
