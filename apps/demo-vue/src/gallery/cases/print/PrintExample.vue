<!--
  Prints every row of the schedule, not only the rows on screen: the async `print(options)` on the
  template ref's `element` with the `paper`, `orientation`, `fit` and `repeatTable` the controls
  pick; `@export` reports the pages printed.
-->
<script setup lang="ts">
import { reactive, shallowRef, useTemplateRef } from 'vue';
import { Gantry, type GanttExportEvent } from '@gantryjs/vue';
import {
  PRINT_FITS,
  PRINT_HINT,
  PRINT_INITIAL,
  PRINT_OPTIONS,
  PRINT_ORIENTATIONS,
  PRINT_PAPERS,
  describeExport,
  describeFailedExport,
  printOptionsOf,
  printTasks,
  pushLog,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const tasks = printTasks(new Date());

// The controls edit this object
const state = reactive({ ...PRINT_INITIAL });
const printing = shallowRef(false);
const log = shallowRef<string[]>([]);
const failure = shallowRef<string | null>(null);

// One print at a time; a failure (a `RangeError` over `maxPages`, say) shows under the chart
function print() {
  const element = chart.value?.element;
  if (printing.value || !element) return;
  printing.value = true;
  failure.value = null;
  void element
    .print(printOptionsOf(state))
    .catch((error: unknown) => (failure.value = describeFailedExport(error)))
    .finally(() => (printing.value = false));
}

function logPrint(detail: GanttExportEvent) {
  log.value = pushLog(log.value, describeExport(detail));
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <label for="print-paper">Paper</label>
        <select id="print-paper" v-model="state.paper" class="gs-select">
          <option v-for="c in PRINT_PAPERS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <div class="gs-case-control">
        <span id="print-orientation-label">Orientation</span>
        <div class="gs-seg" role="group" aria-labelledby="print-orientation-label">
          <button
            v-for="c in PRINT_ORIENTATIONS"
            :key="c.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="state.orientation === c.value"
            @click="state.orientation = c.value"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="print-fit-label">Fit</span>
        <div class="gs-seg" role="group" aria-labelledby="print-fit-label">
          <button
            v-for="c in PRINT_FITS"
            :key="c.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="state.fit === c.value"
            @click="state.fit = c.value"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Repeat task list</span>
        <input v-model="state.repeatTable" type="checkbox" role="switch" />
      </label>
      <button type="button" class="gs-btn gs-btn--sm" :aria-disabled="printing ? 'true' : undefined" @click="print">
        Print…
      </button>
    </div>

    <Gantry
      ref="chart"
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="PRINT_OPTIONS"
      :dark-mode="dark"
      @export="logPrint"
    />
    <p v-if="failure" class="gs-case-hint" role="alert">{{ failure }}</p>
    <!-- Not a live region: the chart announces each print itself -->
    <ol class="gs-case-log" aria-label="Prints">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ol>
    <p class="gs-case-hint">{{ PRINT_HINT }}</p>
  </div>
</template>
