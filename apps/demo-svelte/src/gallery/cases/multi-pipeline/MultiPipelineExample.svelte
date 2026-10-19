<!--
  Three pipelines on one timeline: the same `createGanttSyncGroup()` in every chart's `syncGroup`
  keeps the range, the zoom level, the horizontal scroll and the task-list width in step.
-->
<script lang="ts">
  import { Gantry, createGanttSyncGroup } from '@gantryjs/svelte';
  import { MULTI_PIPELINE_NAMES, multiPipelineOptions, multiPipelineTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // Created once per component, as a plain constant: every chart gets this very object (a `$state`
  // proxy would not be the same object)
  const group = createGanttSyncGroup();

  const now = new Date();
  const pipelines = MULTI_PIPELINE_NAMES.map(name => ({
    name,
    tasks: multiPipelineTasks(name, now),
    options: multiPipelineOptions(name),
  }));
</script>

<div class="gs-case">
  <div class="gs-case-stack">
    {#each pipelines as pipeline, i (pipeline.name)}
      <div>
        <p class="gs-case-caption">{pipeline.name} pipeline</p>
        <!-- Only the first chart shows its toolbar: its zoom reaches the others through the group -->
        <Gantry
          class="gs-chart gs-case-chart"
          tasks={pipeline.tasks}
          options={pipeline.options}
          syncGroup={group}
          showToolbar={i === 0}
          darkMode={siteTheme.dark}
        />
      </div>
    {/each}
  </div>

  <p class="gs-case-hint">Zoom, scroll or drag the splitter in any chart: the other two follow.</p>
</div>
