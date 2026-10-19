<!--
  The tasks as a CSV table: `exportCsv(options)` on the template ref's `element` fills the preview
  after every control change and every edit (`@tasks-change`), and `download('csv', options)` saves
  budget-plan.csv (`aria-disabled` while it runs: an unavailable button keeps focus).
-->
<script setup lang="ts">
import { onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  CSV_COLUMNS,
  CSV_VALUES,
  EXPORT_CSV_HINT,
  EXPORT_CSV_INITIAL,
  EXPORT_CSV_OPTIONS,
  csvExportOptions,
  csvPreviewLines,
  describeFailedExport,
  exportCsvTasks,
  type ExportCsvState,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
// Uncontrolled: the chart keeps each edit, so these tasks are only the starting plan
const tasks = exportCsvTasks(new Date());
const settings = shallowRef<ExportCsvState>(EXPORT_CSV_INITIAL);
const preview = shallowRef('');
// A failed export, under the chart while there is one; the preview keeps its last good text
const failure = shallowRef<string | null>(null);
const busy = shallowRef(false);

function update(change: Partial<ExportCsvState>) {
  settings.value = { ...settings.value, ...change };
}

// The first records of the CSV the chart gives now: once mounted, after every control change and
// every edit (`@tasks-change`). A preview that succeeds clears the failure
function refresh() {
  void chart.value?.element?.exportCsv(csvExportOptions(settings.value)).then(
    csv => {
      preview.value = csvPreviewLines(csv).join('\n');
      failure.value = null;
    },
    (error: unknown) => (failure.value = describeFailedExport(error)),
  );
}
onMounted(refresh);
watch(settings, refresh);

// A download clears the failure when it starts
async function download() {
  if (busy.value) return;
  busy.value = true;
  failure.value = null;
  try {
    await chart.value?.element?.download('csv', csvExportOptions(settings.value));
  } catch (error) {
    failure.value = describeFailedExport(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="export-csv-columns-label">Columns</span>
        <div class="gs-seg" role="group" aria-labelledby="export-csv-columns-label">
          <button
            v-for="choice in CSV_COLUMNS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="settings.columns === choice.value"
            @click="update({ columns: choice.value })"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="export-csv-values-label">Values</span>
        <div class="gs-seg" role="group" aria-labelledby="export-csv-values-label">
          <button
            v-for="choice in CSV_VALUES"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="settings.values === choice.value"
            @click="update({ values: choice.value })"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Byte order mark</span>
        <input
          id="export-csv-bom"
          type="checkbox"
          role="switch"
          :checked="settings.bom"
          @change="update({ bom: ($event.target as HTMLInputElement).checked })"
        />
      </label>
      <button
        id="export-csv-download"
        type="button"
        class="gs-btn gs-btn--sm"
        :aria-disabled="busy ? 'true' : undefined"
        @click="download"
      >
        Download CSV
      </button>
    </div>

    <Gantry
      ref="chart"
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="EXPORT_CSV_OPTIONS"
      :dark-mode="dark"
      @tasks-change="refresh"
    />
    <p v-if="failure" class="gs-case-hint" role="alert">{{ failure }}</p>
    <!-- The first records of the CSV; it scrolls sideways, so it takes focus -->
    <pre class="gs-case-csv" tabindex="0" aria-label="CSV preview">{{ preview }}</pre>
    <p class="gs-case-hint">{{ EXPORT_CSV_HINT }}</p>
  </div>
</template>
