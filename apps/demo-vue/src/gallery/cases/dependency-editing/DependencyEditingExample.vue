<!--
  Links drawn and removed in the chart (`editing.dependencies`): from a connector, with two clicks or
  with L and Enter; Delete removes the selected link. `parentChild` allows links between a task and
  its own parent. Each accepted change emits `tasks-change` and goes to the log.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry, type GanttTasksChangeEvent } from '@gantryjs/vue';
import {
  DEPENDENCY_EDITING_INITIAL,
  LINK_KEYS,
  dependencyEditingOptions,
  dependencyEditingTasks,
  describeTasksChange,
  pushLog,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// Uncontrolled: the chart keeps the links you draw (store `e.tasks` to own them)
const tasks = dependencyEditingTasks(new Date());

const parentChild = shallowRef(DEPENDENCY_EDITING_INITIAL.parentChild);
const options = computed(() => dependencyEditingOptions(parentChild.value));
const log = shallowRef<string[]>([]);

function logChange(e: GanttTasksChangeEvent) {
  log.value = pushLog(log.value, describeTasksChange(e, e.tasks));
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <label class="gs-switch gs-case-control">
        <span>Parent–child links</span>
        <input id="dependency-editing-parent-child" v-model="parentChild" type="checkbox" role="switch" />
      </label>
    </div>
    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="options"
      :dark-mode="dark"
      @tasks-change="logChange"
    />
    <dl class="gs-case-keys">
      <template v-for="row in LINK_KEYS" :key="row.action">
        <dt>
          <kbd v-for="(key, i) in row.keys" :key="i" class="gs-kbd">{{ key }}</kbd>
        </dt>
        <dd>{{ row.action }}</dd>
      </template>
    </dl>
    <!-- Not a live region: the chart announces each change itself -->
    <ol class="gs-case-log" aria-label="Last changes">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ol>
  </div>
</template>
