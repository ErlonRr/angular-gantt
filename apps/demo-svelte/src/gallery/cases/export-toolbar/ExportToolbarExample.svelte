<!--
  The toolbar's Export menu (`toolbar.export`) saves SVG, PNG and CSV files and prints. Each one
  calls `onBeforeExport` first, synchronously (`detail.preventDefault()` vetoes it: PNG while
  "Block PNG" is on), then `onExport` with the file's name and size. The flag bars come from
  `renderBar` (flag-bar.ts), and the exports draw them too.
-->
<script lang="ts">
  import { Gantry, type GanttBeforeExportEvent } from '@gantryjs/svelte';
  import {
    EXPORT_TOOLBAR_HINT,
    EXPORT_TOOLBAR_INITIAL,
    EXPORT_TOOLBAR_OPTIONS,
    describeBlockedExport,
    describeExport,
    exportToolbarTasks,
    pushLog,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';
  import { flagBar } from './flag-bar';

  const tasks = exportToolbarTasks(new Date());
  let blockPng = $state(EXPORT_TOOLBAR_INITIAL.blockPng);
  let log = $state.raw<string[]>([]);

  // Synchronously, before the file is made: veto PNG while the switch is on
  function beforeExport(detail: GanttBeforeExportEvent) {
    if (!blockPng || detail.format !== 'png') return;
    detail.preventDefault();
    log = pushLog(log, describeBlockedExport(detail.format));
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <label class="gs-switch gs-case-control">
      <span>Block PNG</span>
      <input type="checkbox" role="switch" bind:checked={blockPng} />
    </label>
  </div>

  <Gantry
    class="gs-chart gs-case-chart"
    {tasks}
    options={EXPORT_TOOLBAR_OPTIONS}
    renderBar={flagBar}
    darkMode={siteTheme.dark}
    onBeforeExport={beforeExport}
    onExport={detail => (log = pushLog(log, describeExport(detail)))}
  />
  <ol class="gs-case-log" aria-label="Exports">
    {#each log as line, i (i)}
      <li>{line}</li>
    {/each}
  </ol>
  <p class="gs-case-hint">{EXPORT_TOOLBAR_HINT}</p>
</div>

<style>
  /* The pennant sits in the chart's shadow root: ::part() reaches it and wins over its fill attribute */
  @media (forced-colors: active) {
    :global(gantry-element::part(flag-pennant)) {
      fill: CanvasText;
    }
  }
</style>
