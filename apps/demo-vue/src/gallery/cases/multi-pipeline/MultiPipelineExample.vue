<!--
  Three pipelines on one timeline: the same `createGanttSyncGroup()` in every chart's `sync-group`
  keeps the range, the zoom level, the horizontal scroll and the task-list width in step.
-->
<script setup lang="ts">
import { Gantry, createGanttSyncGroup } from '@gantryjs/vue';
import { MULTI_PIPELINE_NAMES, multiPipelineOptions, multiPipelineTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();

// Created once per component, as a plain constant: every chart gets this very object (no ref)
const group = createGanttSyncGroup();

const now = new Date();
const pipelines = MULTI_PIPELINE_NAMES.map(name => ({
  name,
  tasks: multiPipelineTasks(name, now),
  options: multiPipelineOptions(name),
}));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-stack">
      <div v-for="(pipeline, i) in pipelines" :key="pipeline.name">
        <p class="gs-case-caption">{{ pipeline.name }} pipeline</p>
        <!-- Only the first chart shows its toolbar: its zoom reaches the others through the group -->
        <Gantry
          class="gs-chart gs-case-chart"
          :tasks="pipeline.tasks"
          :options="pipeline.options"
          :sync-group="group"
          :show-toolbar="i === 0"
          :dark-mode="dark"
        />
      </div>
    </div>
    <p class="gs-case-hint">Zoom, scroll or drag the splitter in any chart: the other two follow.</p>
  </div>
</template>
