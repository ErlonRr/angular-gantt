<!--
  The built-in cell editors (`editing`, whose `cells` is on unless set to false) in the task list
  beside the chart, or as a table (`view`). The chart keeps the edits by itself: `tasks` is set once.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    CELL_EDITING_HINT,
    CELL_EDITING_INITIAL,
    CELL_EDITING_KEYS,
    CELL_EDITING_VIEWS,
    cellEditingOptions,
    cellEditingTasks,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = cellEditingTasks(new Date());
  let view = $state(CELL_EDITING_INITIAL.view);
  // New options keep the tasks, edits included
  const options = $derived(cellEditingOptions(view));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="cell-editing-view-label">View</span>
      <div class="gs-seg" role="group" aria-labelledby="cell-editing-view-label">
        {#each CELL_EDITING_VIEWS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={view === choice.value}
            onclick={() => (view = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />

  <p class="gs-case-hint">{CELL_EDITING_HINT}</p>

  <dl class="gs-case-keys">
    {#each CELL_EDITING_KEYS as entry (entry.action)}
      <dt>
        {#each entry.keys as key (key)}<kbd class="gs-kbd">{key}</kbd>{/each}
      </dt>
      <dd>{entry.action}</dd>
    {/each}
  </dl>
</div>
