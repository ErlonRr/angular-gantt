<!--
  The toolbar's Export menu (`toolbar.export`) saves SVG, PNG and CSV files and prints. Each one
  emits `@before-export` first, synchronously (`detail.preventDefault()` vetoes it: PNG while
  "Block PNG" is on), then `@export` with the file's name and size. The flag bars come from
  `render-bar` (flag-bar.ts), and the exports draw them too.
-->
<script setup lang="ts">
import { shallowRef } from 'vue';
import { Gantry, type GanttBeforeExportEvent, type GanttExportEvent } from '@gantryjs/vue';
import {
  EXPORT_TOOLBAR_HINT,
  EXPORT_TOOLBAR_INITIAL,
  EXPORT_TOOLBAR_OPTIONS,
  describeBlockedExport,
  describeExport,
  exportToolbarTasks,
  pushLog,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { flagBar } from './flag-bar';

const dark = useDarkMode();
const tasks = exportToolbarTasks(new Date());
const blockPng = shallowRef(EXPORT_TOOLBAR_INITIAL.blockPng);
const log = shallowRef<string[]>([]);

// Synchronously, before the file is made: veto PNG while the switch is on
function beforeExport(detail: GanttBeforeExportEvent) {
  if (!blockPng.value || detail.format !== 'png') return;
  detail.preventDefault();
  log.value = pushLog(log.value, describeBlockedExport(detail.format));
}

function exported(detail: GanttExportEvent) {
  log.value = pushLog(log.value, describeExport(detail));
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <label class="gs-switch gs-case-control">
        <span>Block PNG</span>
        <input v-model="blockPng" type="checkbox" role="switch" />
      </label>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="EXPORT_TOOLBAR_OPTIONS"
      :render-bar="flagBar"
      :dark-mode="dark"
      @before-export="beforeExport"
      @export="exported"
    />
    <ol class="gs-case-log" aria-label="Exports">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ol>
    <p class="gs-case-hint">{{ EXPORT_TOOLBAR_HINT }}</p>
  </div>
</template>

<style>
/* The pennant sits in the chart's shadow root: ::part() reaches it and wins over its fill attribute */
@media (forced-colors: active) {
  gantry-element::part(flag-pennant) {
    fill: CanvasText;
  }
}
</style>
