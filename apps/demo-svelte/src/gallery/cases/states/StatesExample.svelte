<!--
  The chart's loading, empty and error states: the `loading` and `errorMessage` props (Retry calls
  `onRetry`) and your own empty-state content in the `empty` snippet (a `<div slot="empty">` child
  is not rendered).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    STATES_EMPTY_ACTION,
    STATES_EMPTY_TEXT,
    STATES_INITIAL_MODE,
    STATES_MODES,
    STATES_OPTIONS,
    statesProps,
    statesTasks,
    type StatesMode,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = statesTasks(new Date());
  let mode = $state<StatesMode>(STATES_INITIAL_MODE);
  // `tasks` (only in 'tasks'), `loading` and `errorMessage` for the chosen state
  const chart = $derived(statesProps(mode, tasks));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="states-mode-label">State</span>
      <div class="gs-seg" role="group" aria-labelledby="states-mode-label">
        {#each STATES_MODES as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={mode === choice.value}
            onclick={() => (mode = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <Gantry
    class="gs-chart gs-case-chart"
    tasks={chart.tasks}
    loading={chart.loading}
    errorMessage={chart.errorMessage}
    options={STATES_OPTIONS}
    darkMode={siteTheme.dark}
    onRetry={() => (mode = 'tasks')}
  >
    {#snippet empty()}
      <div class="gs-case-empty">
        <p>{STATES_EMPTY_TEXT}</p>
        <button type="button" class="gs-btn gs-btn--sm" onclick={() => (mode = 'tasks')}>
          {STATES_EMPTY_ACTION}
        </button>
      </div>
    {/snippet}
  </Gantry>
</div>
