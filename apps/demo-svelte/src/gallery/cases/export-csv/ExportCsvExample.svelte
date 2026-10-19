<!--
  The tasks as a CSV table: `exportCsv(options)` on the element from `bind:element` fills the preview
  after every control change and every edit (`onTasksChange`), and `download('csv', options)` saves
  budget-plan.csv (`aria-disabled` while it runs: an unavailable button keeps focus).
-->
<script lang="ts">
  import { Gantry, type GantryElement } from '@gantryjs/svelte';
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
  import { siteTheme } from '../../site-theme.svelte';

  // Uncontrolled: the chart keeps each edit, so these tasks are only the starting plan
  const tasks = exportCsvTasks(new Date());
  let gantt = $state<GantryElement>();
  let settings = $state.raw<ExportCsvState>(EXPORT_CSV_INITIAL);
  let preview = $state('');
  // A failed export, under the chart while there is one; the preview keeps its last good text
  let failure = $state<string | null>(null);
  let busy = $state(false);

  function update(change: Partial<ExportCsvState>) {
    settings = { ...settings, ...change };
  }

  // The first records of the CSV the chart gives now; a preview that succeeds clears the failure
  function refresh() {
    void gantt?.exportCsv(csvExportOptions(settings)).then(
      csv => {
        preview = csvPreviewLines(csv).join('\n');
        failure = null;
      },
      (error: unknown) => (failure = describeFailedExport(error)),
    );
  }
  // Again on every control change, and once `bind:element` has the element (both read above)
  $effect(refresh);

  // A download clears the failure when it starts
  async function download() {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      await gantt?.download('csv', csvExportOptions(settings));
    } catch (error) {
      failure = describeFailedExport(error);
    } finally {
      busy = false;
    }
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="export-csv-columns-label">Columns</span>
      <div class="gs-seg" role="group" aria-labelledby="export-csv-columns-label">
        {#each CSV_COLUMNS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={settings.columns === choice.value}
            onclick={() => update({ columns: choice.value })}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="export-csv-values-label">Values</span>
      <div class="gs-seg" role="group" aria-labelledby="export-csv-values-label">
        {#each CSV_VALUES as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={settings.values === choice.value}
            onclick={() => update({ values: choice.value })}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Byte order mark</span>
      <input
        id="export-csv-bom"
        type="checkbox"
        role="switch"
        checked={settings.bom}
        onchange={e => update({ bom: e.currentTarget.checked })}
      />
    </label>
    <button
      id="export-csv-download"
      type="button"
      class="gs-btn gs-btn--sm"
      aria-disabled={busy ? 'true' : undefined}
      onclick={download}
    >
      Download CSV
    </button>
  </div>

  <Gantry
    bind:element={gantt}
    class="gs-chart gs-case-chart"
    {tasks}
    options={EXPORT_CSV_OPTIONS}
    darkMode={siteTheme.dark}
    onTasksChange={refresh}
  />

  {#if failure}
    <p class="gs-case-hint" role="alert">{failure}</p>
  {/if}

  <!-- The first records of the CSV; it scrolls sideways, so it takes focus -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre class="gs-case-csv" tabindex="0" aria-label="CSV preview">{preview}</pre>

  <p class="gs-case-hint">{EXPORT_CSV_HINT}</p>
</div>
