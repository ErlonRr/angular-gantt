<!--
  The plan with an editable Resources column and, synchronised below it, the workload of the same
  tasks (`rows: 'resources'`): one `createGanttSyncGroup()` in both charts' `sync-group`, and the
  plan's `@tasks-change` hands each edit to the second chart.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry, createGanttSyncGroup } from '@gantryjs/vue';
import {
  PANEL_HINT,
  PANEL_INITIAL,
  overloadSummary,
  panelBottomOptions,
  panelResources,
  panelTasks,
  panelTopOptions,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// Created once per component, as a plain constant: every chart gets this very object (no ref)
const group = createGanttSyncGroup();
const resources = panelResources();
const topOptions = panelTopOptions();
// Uncontrolled: the plan keeps each edit, so `initial` is only the starting plan
const initial = panelTasks(new Date());
const tasks = shallowRef(initial);
const unassigned = shallowRef(PANEL_INITIAL.unassigned);
const bottomOptions = computed(() => panelBottomOptions({ unassigned: unassigned.value }));
const summary = computed(() => overloadSummary(tasks.value, resources, bottomOptions.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <label class="gs-switch gs-case-control">
        <span>Show unassigned</span>
        <input id="resource-panel-unassigned" v-model="unassigned" type="checkbox" role="switch" />
      </label>
    </div>

    <div class="gs-case-stack">
      <div>
        <p class="gs-case-caption">Plan</p>
        <Gantry
          class="gs-chart gs-case-chart"
          :tasks="initial"
          :resources="resources"
          :options="topOptions"
          :sync-group="group"
          :dark-mode="dark"
          @tasks-change="detail => (tasks = detail.tasks)"
        />
      </div>
      <div>
        <p class="gs-case-caption">Workload</p>
        <!-- Only the plan shows its toolbar: its zoom reaches the workload through the group -->
        <Gantry
          class="gs-chart gs-case-chart"
          :tasks="tasks"
          :resources="resources"
          :options="bottomOptions"
          :sync-group="group"
          :show-toolbar="false"
          :dark-mode="dark"
        />
      </div>
    </div>
    <p class="gs-case-status">{{ summary }}</p>
    <p class="gs-case-hint">{{ PANEL_HINT }}</p>
  </div>
</template>
