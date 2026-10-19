<!--
  Parents that start collapsed (`groupBar.collapsed`) and roll up the dates and the progress of their
  children (`rollup`). The buttons call `expandAll()` / `collapseAll()` on the element (`bind:element`).
-->
<script lang="ts">
  import { Gantry, type GantryElement } from '@gantryjs/svelte';
  import { ONLY_PARENTS_INITIAL_ROLLUP, TREE_ACTIONS, onlyParentsOptions, onlyParentsTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = onlyParentsTasks(new Date());
  let gantt = $state<GantryElement>();
  // Without the rollup the parents keep their own dates and progress
  let rollup = $state(ONLY_PARENTS_INITIAL_ROLLUP);
  const options = $derived(onlyParentsOptions(rollup));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <label class="gs-switch gs-case-control">
      <span>Roll up children</span>
      <input type="checkbox" role="switch" bind:checked={rollup} />
    </label>
    {#each TREE_ACTIONS as action (action.method)}
      <button type="button" class="gs-btn gs-btn--sm" onclick={() => gantt?.[action.method]()}>
        {action.label}
      </button>
    {/each}
  </div>

  <Gantry bind:element={gantt} class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
</div>
