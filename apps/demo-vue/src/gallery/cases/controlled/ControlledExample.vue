<!--
  The app owns the tasks (`editing.controlled`): the chart proposes each change in `@before-change`,
  where `detail.preventDefault()` vetoes it, and `@tasks-change` carries the proposed tasks, which
  the app sets itself. The chart applies nothing and keeps no history.
-->
<script setup lang="ts">
import { shallowRef } from 'vue';
import { Gantry, type GanttBeforeChangeEvent } from '@gantryjs/vue';
import { CONTROLLED_INITIAL, CONTROLLED_OPTIONS, controlledDecision, controlledTasks, pushLog } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The plan as it was, built once: Reset sets it again
const initial = controlledTasks(new Date());
// `shallowRef`: the chart gets the very array the event proposed (a deep `ref` would proxy it)
const tasks = shallowRef(initial);
const lockDone = shallowRef(CONTROLLED_INITIAL.lockDone);
const log = shallowRef<string[]>([]);

// The app's rule, synchronously: veto any change to a finished task while the lock is on
function decide(detail: GanttBeforeChangeEvent) {
  const { veto, line } = controlledDecision(detail, lockDone.value);
  if (veto) detail.preventDefault();
  log.value = pushLog(log.value, line);
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <label class="gs-switch gs-case-control">
        <span>Lock finished tasks</span>
        <input v-model="lockDone" type="checkbox" role="switch" />
      </label>
      <button type="button" class="gs-btn gs-btn--sm" @click="tasks = initial">Reset</button>
    </div>

    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="CONTROLLED_OPTIONS"
      :dark-mode="dark"
      @before-change="decide"
      @tasks-change="detail => (tasks = detail.tasks)"
    />
    <ol class="gs-case-log" aria-label="Decisions">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ol>
  </div>
</template>
