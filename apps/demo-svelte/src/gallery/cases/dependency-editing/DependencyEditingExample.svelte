<!--
  Links drawn and removed in the chart (`editing.dependencies`): from a connector, with two clicks or
  with L and Enter; Delete removes the selected link. `parentChild` allows links between a task and
  its own parent. Each accepted change calls `onTasksChange` and goes to the log.
-->
<script lang="ts">
  import { Gantry, type GanttTasksChangeEvent } from '@gantryjs/svelte';
  import {
    DEPENDENCY_EDITING_INITIAL,
    LINK_KEYS,
    dependencyEditingOptions,
    dependencyEditingTasks,
    describeTasksChange,
    pushLog,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // Uncontrolled: the chart keeps the links you draw (store `detail.tasks` to own them)
  const tasks = dependencyEditingTasks(new Date());
  let parentChild = $state(DEPENDENCY_EDITING_INITIAL.parentChild);
  const options = $derived(dependencyEditingOptions(parentChild));
  let log = $state.raw<string[]>([]);

  function logChange(detail: GanttTasksChangeEvent) {
    log = pushLog(log, describeTasksChange(detail, detail.tasks));
  }
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <label class="gs-switch gs-case-control">
      <span>Parent–child links</span>
      <input id="dependency-editing-parent-child" type="checkbox" role="switch" bind:checked={parentChild} />
    </label>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} onTasksChange={logChange} />
  <dl class="gs-case-keys">
    {#each LINK_KEYS as row (row.action)}
      <dt>
        {#each row.keys as key, i (i)}<kbd class="gs-kbd">{key}</kbd>{/each}
      </dt>
      <dd>{row.action}</dd>
    {/each}
  </dl>
  <!-- Not a live region: the chart announces each change itself -->
  <ol class="gs-case-log" aria-label="Last changes">
    {#each log as line, i (i)}<li>{line}</li>{/each}
  </ol>
</div>
