<!--
  A resource view (`rows`): one row per person and team, drawing the daily load against the capacity line,
  the part above it hatched. `resources` holds the people, each task's `resources` the assignments.
  `@state-change` brings the toolbar's Rows toggle and zoom back to the controls.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry, type GanttState } from '@gantryjs/vue';
import {
  LOAD_SCALES,
  RESOURCE_LOAD_HINT,
  RESOURCE_LOAD_INITIAL,
  RESOURCE_ROWS,
  loadOptions,
  loadResources,
  loadTasks,
  overloadSummary,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const now = new Date();
const tasks = loadTasks(now);
const resources = loadResources();

const rows = shallowRef(RESOURCE_LOAD_INITIAL.rows);
const viewMode = shallowRef(RESOURCE_LOAD_INITIAL.viewMode);
const unassigned = shallowRef(RESOURCE_LOAD_INITIAL.unassigned);
const overallocation = shallowRef(RESOURCE_LOAD_INITIAL.overallocation);
const options = computed(() =>
  loadOptions(
    { rows: rows.value, viewMode: viewMode.value, unassigned: unassigned.value, overallocation: overallocation.value },
    now,
  ),
);
const summary = computed(() => overloadSummary(tasks, resources, options.value));

// The chart's own toolbar switches the rows and the zoom too
function follow(state: GanttState) {
  if (state.rows) rows.value = state.rows;
  if (state.viewMode) viewMode.value = state.viewMode;
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="resource-load-rows-label">Rows</span>
        <div id="resource-load-rows" class="gs-seg" role="group" aria-labelledby="resource-load-rows-label">
          <button
            v-for="r in RESOURCE_ROWS"
            :key="r.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="rows === r.value"
            @click="rows = r.value"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="resource-load-scale-label">Scale</span>
        <div id="resource-load-scale" class="gs-seg" role="group" aria-labelledby="resource-load-scale-label">
          <button
            v-for="s in LOAD_SCALES"
            :key="s.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="viewMode === s.value"
            @click="viewMode = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Show unassigned</span>
        <input id="resource-load-unassigned" v-model="unassigned" type="checkbox" role="switch" />
      </label>
      <label class="gs-switch gs-case-control">
        <span>Highlight over-allocation</span>
        <input id="resource-load-over" v-model="overallocation" type="checkbox" role="switch" />
      </label>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :resources="resources"
      :options="options"
      :dark-mode="dark"
      @state-change="follow"
    />
    <p class="gs-case-status">{{ summary }}</p>
    <p class="gs-case-hint">{{ RESOURCE_LOAD_HINT }}</p>
  </div>
</template>
