<!--
  10,000 tasks in a tree, virtualised in both panes. The plan lives in `$state.raw`: no proxy around
  each task, and assigning a new array replaces it (Gantry copies the array one level, never the tasks).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import { LARGE_COUNT, LARGE_COUNTS, LARGE_OPTIONS, largeCaseTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const now = new Date();
  let tasks = $state.raw(largeCaseTasks(LARGE_COUNT, now));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="large-rows-label">Rows</span>
      <div class="gs-seg" role="group" aria-labelledby="large-rows-label">
        {#each LARGE_COUNTS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={tasks.length === choice.value}
            onclick={() => (tasks = largeCaseTasks(choice.value, now))}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <span class="gs-pill">{tasks.length.toLocaleString('en-US')} tasks</span>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} options={LARGE_OPTIONS} darkMode={siteTheme.dark} />

  <p class="gs-case-hint">Scroll either pane: only the rows in view are in the DOM.</p>
</div>
