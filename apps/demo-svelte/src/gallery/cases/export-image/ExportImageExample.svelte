<!--
  The plan saved as an image: `download('svg' | 'png', options)` on the element from `bind:element`
  saves a file named after `export.fileName`, and `exportSvg(options)` returns the SVG text, previewed
  here through an object URL. `theme` picks the palette, `range` the whole plan or the dates on screen.
-->
<script lang="ts">
  import { Gantry, type GantryElement } from '@gantryjs/svelte';
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
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = exportImageTasks(new Date());
  let gantt = $state<GantryElement>();
  let theme = $state(EXPORT_IMAGE_INITIAL.theme);
  let range = $state(EXPORT_IMAGE_INITIAL.range);
  let busy = $state(false);
  let failure = $state<string | null>(null);
  let preview = $state.raw<{ url: string; size: number } | null>(null);

  // The object URL lives as long as its preview: replaced or destroyed, it is revoked
  $effect(() => {
    const shown = preview;
    if (!shown) return;
    return () => URL.revokeObjectURL(shown.url);
  });

  // One export at a time; a failure (a rejected promise) shows under the chart
  function run(task: (element: GantryElement) => Promise<unknown>) {
    if (busy || !gantt) return;
    busy = true;
    failure = null;
    void task(gantt)
      .catch((error: unknown) => (failure = describeFailedExport(error)))
      .finally(() => (busy = false));
  }

  async function showPreview(element: GantryElement) {
    const blob = new Blob([await element.exportSvg(imageExportOptions({ theme, range }))], { type: 'image/svg+xml' });
    preview = { url: URL.createObjectURL(blob), size: blob.size };
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="export-image-theme-label">Theme</span>
      <div class="gs-seg" role="group" aria-labelledby="export-image-theme-label">
        {#each EXPORT_THEMES as t (t.value)}
          <button type="button" class="gs-seg-btn" aria-pressed={theme === t.value} onclick={() => (theme = t.value)}>
            {t.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="export-image-range-label">Range</span>
      <div class="gs-seg" role="group" aria-labelledby="export-image-range-label">
        {#each EXPORT_RANGES as r (r.value)}
          <button type="button" class="gs-seg-btn" aria-pressed={range === r.value} onclick={() => (range = r.value)}>
            {r.label}
          </button>
        {/each}
      </div>
    </div>
    <!-- aria-disabled while an export runs, not disabled: the button keeps focus -->
    <button
      id="export-image-svg"
      type="button"
      class="gs-btn gs-btn--sm"
      aria-disabled={busy || undefined}
      onclick={() => run(element => element.download('svg', imageExportOptions({ theme, range })))}
    >
      Download SVG
    </button>
    <button
      id="export-image-png"
      type="button"
      class="gs-btn gs-btn--sm"
      aria-disabled={busy || undefined}
      onclick={() => run(element => element.download('png', imageExportOptions({ theme, range })))}
    >
      Download PNG
    </button>
    <button
      id="export-image-preview"
      type="button"
      class="gs-btn gs-btn--sm"
      aria-disabled={busy || undefined}
      onclick={() => run(showPreview)}
    >
      Preview
    </button>
  </div>

  <Gantry
    bind:element={gantt}
    class="gs-chart gs-case-chart"
    {tasks}
    options={EXPORT_IMAGE_OPTIONS}
    darkMode={siteTheme.dark}
  />

  {#if failure}
    <p class="gs-case-hint" role="alert">{failure}</p>
  {/if}
  {#if preview}
    <figure class="gs-case-preview">
      <img src={preview.url} alt="Preview of the exported SVG" />
      <figcaption>SVG · {formatBytes(preview.size)}</figcaption>
    </figure>
  {/if}
</div>
