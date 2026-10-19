<!--
  The built-in cell editors (`editing`, whose `cells` is on unless set to false) in the task list
  beside the chart, or as a table (`view`). The chart keeps the edits by itself: `tasks` is set once.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  CELL_EDITING_HINT,
  CELL_EDITING_INITIAL,
  CELL_EDITING_KEYS,
  CELL_EDITING_VIEWS,
  cellEditingOptions,
  cellEditingTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = cellEditingTasks(new Date());
const view = shallowRef(CELL_EDITING_INITIAL.view);
// New options keep the tasks, edits included
const options = computed(() => cellEditingOptions(view.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="cell-editing-view-label">View</span>
        <div class="gs-seg" role="group" aria-labelledby="cell-editing-view-label">
          <button
            v-for="choice in CELL_EDITING_VIEWS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="view === choice.value"
            @click="view = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
    </div>
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
    <p class="gs-case-hint">{{ CELL_EDITING_HINT }}</p>
    <dl class="gs-case-keys">
      <template v-for="row in CELL_EDITING_KEYS" :key="row.action">
        <dt>
          <kbd v-for="key in row.keys" :key="key" class="gs-kbd">{{ key }}</kbd>
        </dt>
        <dd>{{ row.action }}</dd>
      </template>
    </dl>
  </div>
</template>
