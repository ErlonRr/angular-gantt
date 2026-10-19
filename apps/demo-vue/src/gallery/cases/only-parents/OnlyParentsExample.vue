<!--
  Parents that start collapsed (`groupBar.collapsed`) and roll up the dates and the progress of their
  children (`rollup`). The buttons call `expandAll()` / `collapseAll()` on the template ref's `element`.
-->
<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import { ONLY_PARENTS_INITIAL_ROLLUP, TREE_ACTIONS, onlyParentsOptions, onlyParentsTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const tasks = onlyParentsTasks(new Date());

// Without the rollup the parents keep their own dates and progress
const rollup = shallowRef(ONLY_PARENTS_INITIAL_ROLLUP);
const options = computed(() => onlyParentsOptions(rollup.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <label class="gs-switch gs-case-control">
        <span>Roll up children</span>
        <input v-model="rollup" type="checkbox" role="switch" />
      </label>
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
    <Gantry ref="chart" class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
  </div>
</template>
