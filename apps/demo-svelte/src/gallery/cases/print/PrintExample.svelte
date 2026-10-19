<!--
  Prints every row of the schedule, not only the rows on screen: the async `print(options)` on the
  element from `bind:element` with the `paper`, `orientation`, `fit` and `repeatTable` the controls
  pick; `onExport` reports the pages printed.
-->
<script lang="ts">
  import { Gantry, type GantryElement, type GanttExportEvent } from '@gantryjs/svelte';
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
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = printTasks(new Date());
  let gantt = $state<GantryElement>();
  // The controls edit this object
  const choice = $state({ ...PRINT_INITIAL });
  let printing = $state(false);
  let log = $state.raw<string[]>([]);
  let failure = $state<string | null>(null);

  // One print at a time; a failure (a `RangeError` over `maxPages`, say) shows under the chart
  function print() {
    if (printing || !gantt) return;
    printing = true;
    failure = null;
    void gantt
      .print(printOptionsOf(choice))
      .catch((error: unknown) => (failure = describeFailedExport(error)))
      .finally(() => (printing = false));
  }

  function logPrint(detail: GanttExportEvent) {
    log = pushLog(log, describeExport(detail));
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <label for="print-paper">Paper</label>
      <select id="print-paper" class="gs-select" bind:value={choice.paper}>
        {#each PRINT_PAPERS as c (c.value)}
          <option value={c.value}>{c.label}</option>
        {/each}
      </select>
    </div>
    <div class="gs-case-control">
      <span id="print-orientation-label">Orientation</span>
      <div class="gs-seg" role="group" aria-labelledby="print-orientation-label">
        {#each PRINT_ORIENTATIONS as c (c.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={choice.orientation === c.value}
            onclick={() => (choice.orientation = c.value)}
          >
            {c.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="print-fit-label">Fit</span>
      <div class="gs-seg" role="group" aria-labelledby="print-fit-label">
        {#each PRINT_FITS as c (c.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={choice.fit === c.value}
            onclick={() => (choice.fit = c.value)}
          >
            {c.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Repeat task list</span>
      <input type="checkbox" role="switch" bind:checked={choice.repeatTable} />
    </label>
    <button type="button" class="gs-btn gs-btn--sm" aria-disabled={printing ? 'true' : undefined} onclick={print}>
      Print…
    </button>
  </div>

  <Gantry
    bind:element={gantt}
    class="gs-chart gs-case-chart"
    {tasks}
    options={PRINT_OPTIONS}
    darkMode={siteTheme.dark}
    onExport={logPrint}
  />

  {#if failure}
    <p class="gs-case-hint" role="alert">{failure}</p>
  {/if}

  <!-- Not a live region: the chart announces each print itself -->
  <ol class="gs-case-log" aria-label="Prints">
    {#each log as line, i (i)}
      <li>{line}</li>
    {/each}
  </ol>
  <p class="gs-case-hint">{PRINT_HINT}</p>
</div>
