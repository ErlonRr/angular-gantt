<!--
  A three-level task tree (`parentId`). `bind:element` gives the chart's methods (`expandAll()`,
  `collapseAll()`); `onViewModeChange` receives `{ viewMode }` whenever the zoom level changes.
-->
<script lang="ts">
  import { Gantry, type GantryElement } from '@gantryjs/svelte';
  import { TREE_ACTIONS, TREE_OPTIONS, TREE_VIEW_MODE, treeTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // Never reassigned, so a plain constant (use `$state.raw` for tasks you replace)
  const tasks = treeTasks(new Date());
  let gantt = $state<GantryElement>();
  let viewMode = $state<string>(TREE_VIEW_MODE);
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    {#each TREE_ACTIONS as action (action.method)}
      <button type="button" class="gs-btn gs-btn--sm" onclick={() => gantt?.[action.method]()}>
        {action.label}
      </button>
    {/each}
  </div>

  <Gantry
    bind:element={gantt}
    class="gs-chart gs-case-chart"
    {tasks}
    options={TREE_OPTIONS}
    darkMode={siteTheme.dark}
    onViewModeChange={e => (viewMode = e.viewMode)}
  />

  <p class="gs-case-hint">Zoom level: {viewMode}</p>
</div>
