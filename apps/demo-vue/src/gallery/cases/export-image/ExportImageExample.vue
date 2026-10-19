<!--
  The plan saved as an image: `download('svg' | 'png', options)` on the template ref's `element`
  saves a file named after `export.fileName`, and `exportSvg(options)` returns the SVG text, previewed
  here through an object URL. `theme` picks the palette, `range` the whole plan or the dates on screen.
-->
<script setup lang="ts">
import { shallowRef, useTemplateRef, watchEffect } from 'vue';
import { Gantry, type GantryElement } from '@gantryjs/vue';
import {
  EXPORT_IMAGE_INITIAL,
  EXPORT_IMAGE_OPTIONS,
  EXPORT_RANGES,
  EXPORT_THEMES,
  describeFailedExport,
  exportImageTasks,
  formatBytes,
  imageExportOptions,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const tasks = exportImageTasks(new Date());
const state = shallowRef(EXPORT_IMAGE_INITIAL);
const busy = shallowRef(false);
const failure = shallowRef<string | null>(null);
const preview = shallowRef<{ url: string; size: number } | null>(null);

// The object URL lives as long as its preview: replaced or unmounted, it is revoked
watchEffect(onCleanup => {
  const shown = preview.value;
  if (shown) onCleanup(() => URL.revokeObjectURL(shown.url));
});

// One export at a time; a failure (a rejected promise) shows under the chart
function run(task: (element: GantryElement) => Promise<unknown>) {
  const element = chart.value?.element;
  if (busy.value || !element) return;
  busy.value = true;
  failure.value = null;
  void task(element)
    .catch((error: unknown) => (failure.value = describeFailedExport(error)))
    .finally(() => (busy.value = false));
}

async function showPreview(element: GantryElement) {
  const blob = new Blob([await element.exportSvg(imageExportOptions(state.value))], { type: 'image/svg+xml' });
  preview.value = { url: URL.createObjectURL(blob), size: blob.size };
}
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="export-image-theme-label">Theme</span>
        <div class="gs-seg" role="group" aria-labelledby="export-image-theme-label">
          <button
            v-for="t in EXPORT_THEMES"
            :key="t.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="state.theme === t.value"
            @click="state = { ...state, theme: t.value }"
          >
            {{ t.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="export-image-range-label">Range</span>
        <div class="gs-seg" role="group" aria-labelledby="export-image-range-label">
          <button
            v-for="r in EXPORT_RANGES"
            :key="r.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="state.range === r.value"
            @click="state = { ...state, range: r.value }"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
      <!-- aria-disabled while an export runs, not disabled: the button keeps focus -->
      <button
        id="export-image-svg"
        type="button"
        class="gs-btn gs-btn--sm"
        :aria-disabled="busy || undefined"
        @click="run(element => element.download('svg', imageExportOptions(state)))"
      >
        Download SVG
      </button>
      <button
        id="export-image-png"
        type="button"
        class="gs-btn gs-btn--sm"
        :aria-disabled="busy || undefined"
        @click="run(element => element.download('png', imageExportOptions(state)))"
      >
        Download PNG
      </button>
      <button
        id="export-image-preview"
        type="button"
        class="gs-btn gs-btn--sm"
        :aria-disabled="busy || undefined"
        @click="run(showPreview)"
      >
        Preview
      </button>
    </div>
    <Gantry
      ref="chart"
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="EXPORT_IMAGE_OPTIONS"
      :dark-mode="dark"
    />
    <p v-if="failure" class="gs-case-hint" role="alert">{{ failure }}</p>
    <figure v-if="preview" class="gs-case-preview">
      <img :src="preview.url" alt="Preview of the exported SVG" />
      <figcaption>SVG · {{ formatBytes(preview.size) }}</figcaption>
    </figure>
  </div>
</template>
