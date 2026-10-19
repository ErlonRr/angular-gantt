<!--
  Bars you drag, resize, set the progress of (the grip, or ↑ / ↓ in move mode) and undo. The buttons
  call `undo()` / `redo()` on the template ref's `element`, `@history-change` gives `canUndo` /
  `canRedo` (`aria-disabled`, not `disabled`: an unavailable button keeps focus), and `@tasks-change`
  feeds the log of the last changes.
-->
<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue';
import { Gantry, type GanttHistoryState, type GanttTasksChangeEvent } from '@gantryjs/vue';
import { EDITING_OPTIONS, describeTasksChange, editingTasks, pushLog } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
// Uncontrolled: the chart keeps each edit, so these tasks are only the starting plan
const tasks = editingTasks(new Date());
const history = shallowRef<Pick<GanttHistoryState, 'canUndo' | 'canRedo'>>({ canUndo: false, canRedo: false });
const log = shallowRef<string[]>([]);

function logChange(change: GanttTasksChangeEvent) {
  log.value = pushLog(log.value, describeTasksChange(change, change.tasks));
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <button
        id="editing-undo"
        type="button"
        class="gs-btn gs-btn--sm"
        :aria-disabled="history.canUndo ? undefined : 'true'"
        @click="history.canUndo && chart?.element?.undo()"
      >
        Undo
      </button>
      <button
        id="editing-redo"
        type="button"
        class="gs-btn gs-btn--sm"
        :aria-disabled="history.canRedo ? undefined : 'true'"
        @click="history.canRedo && chart?.element?.redo()"
      >
        Redo
      </button>
    </div>
    <Gantry
      ref="chart"
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="EDITING_OPTIONS"
      :dark-mode="dark"
      @history-change="state => (history = state)"
      @tasks-change="logChange"
    />
    <!-- Not a live region: the chart announces each change itself -->
    <ol class="gs-case-log" aria-label="Last changes">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ol>
  </div>
</template>
