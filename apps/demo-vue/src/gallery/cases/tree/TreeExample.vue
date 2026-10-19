<!--
  A three-level task tree (`parentId`). The buttons call `expandAll()` / `collapseAll()` on the
  template ref's `element`; `@view-mode-change` receives `{ viewMode }` when the zoom level changes.
-->
<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import { TREE_ACTIONS, TREE_OPTIONS, TREE_VIEW_MODE, treeTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const tasks = treeTasks(new Date());
const viewMode = shallowRef<string>(TREE_VIEW_MODE);
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <button
        v-for="action in TREE_ACTIONS"
        :key="action.method"
        type="button"
        class="gs-btn gs-btn--sm"
        @click="chart?.element?.[action.method]()"
      >
        {{ action.label }}
      </button>
    </div>
    <Gantry
      ref="chart"
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="TREE_OPTIONS"
      :dark-mode="dark"
      @view-mode-change="e => (viewMode = e.viewMode)"
    />
    <p class="gs-case-hint">Zoom level: {{ viewMode }}</p>
  </div>
</template>
