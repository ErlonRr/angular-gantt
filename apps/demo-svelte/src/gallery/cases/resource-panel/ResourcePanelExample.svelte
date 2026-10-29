<!--
  The plan with an editable Resources column and, synchronised below it, the workload of the same
  tasks (`rows: 'resources'`): one `createGanttSyncGroup()` in both charts' `syncGroup`, and the
  plan's `onTasksChange` hands each edit to the second chart.
-->
<script lang="ts">
  import { Gantry, createGanttSyncGroup } from '@gantryjs/svelte';
  import {
    PANEL_HINT,
    PANEL_INITIAL,
    overloadSummary,
    panelBottomOptions,
    panelResources,
    panelTasks,
    panelTopOptions,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // Created once per component, as a plain constant: every chart gets this very object (a `$state`
  // proxy would not be the same object)
  const group = createGanttSyncGroup();
  const resources = panelResources();
  const topOptions = panelTopOptions();
  // Uncontrolled: the plan keeps each edit, so `initial` is only the starting plan
  const initial = panelTasks(new Date());
  // `$state.raw`: the tasks are replaced, never mutated
  let tasks = $state.raw(initial);
  let unassigned = $state(PANEL_INITIAL.unassigned);
  const bottomOptions = $derived(panelBottomOptions({ unassigned }));
  const summary = $derived(overloadSummary(tasks, resources, bottomOptions));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <label class="gs-switch gs-case-control">
      <span>Show unassigned</span>
      <input id="resource-panel-unassigned" type="checkbox" role="switch" bind:checked={unassigned} />
    </label>
  </div>

  <div class="gs-case-stack">
    <div>
      <p class="gs-case-caption">Plan</p>
      <Gantry
        class="gs-chart gs-case-chart"
        tasks={initial}
        {resources}
        options={topOptions}
        syncGroup={group}
        darkMode={siteTheme.dark}
        onTasksChange={detail => (tasks = detail.tasks)}
      />
    </div>
    <div>
      <p class="gs-case-caption">Workload</p>
      <!-- Only the plan shows its toolbar: its zoom reaches the workload through the group -->
      <Gantry
        class="gs-chart gs-case-chart"
        {tasks}
        {resources}
        options={bottomOptions}
        syncGroup={group}
        showToolbar={false}
        darkMode={siteTheme.dark}
      />
    </div>
  </div>
  <p class="gs-case-status">{summary}</p>
  <p class="gs-case-hint">{PANEL_HINT}</p>
</div>
