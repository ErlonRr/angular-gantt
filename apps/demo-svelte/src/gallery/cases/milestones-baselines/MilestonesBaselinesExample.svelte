<!--
  Milestones (`type: TaskType.Milestone`) in three shapes (`milestone.shape`), and baseline bars
  (`task.baseline`, shown with `baseline: true`) under the actual dates; the Variance column reads the difference.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    MILESTONE_SHAPES,
    MILESTONES_BASELINES_INITIAL,
    milestonesBaselinesOptions,
    milestonesBaselinesTasks,
    type MilestoneShape,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The plan, with `baseline: { start, end }` on the tasks that slipped or ran early
  const tasks = milestonesBaselinesTasks(new Date());
  let shape = $state<MilestoneShape>(MILESTONES_BASELINES_INITIAL.shape);
  let baseline = $state(MILESTONES_BASELINES_INITIAL.baseline);
  const options = $derived(milestonesBaselinesOptions(shape, baseline));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="milestones-baselines-shape-label">Milestone shape</span>
      <div class="gs-seg" role="group" aria-labelledby="milestones-baselines-shape-label">
        {#each MILESTONE_SHAPES as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={shape === choice.value}
            onclick={() => (shape = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Baselines</span>
      <input type="checkbox" role="switch" bind:checked={baseline} />
    </label>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
</div>
