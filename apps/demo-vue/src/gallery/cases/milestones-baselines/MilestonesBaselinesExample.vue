<!--
  Milestones (`type: TaskType.Milestone`) in three shapes (`milestone.shape`), and baseline bars
  (`task.baseline`, shown with `baseline: true`) under the actual dates; the Variance column reads the difference.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  MILESTONE_SHAPES,
  MILESTONES_BASELINES_INITIAL,
  milestonesBaselinesOptions,
  milestonesBaselinesTasks,
  type MilestoneShape,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The plan, with `baseline: { start, end }` on the tasks that slipped or ran early
const tasks = milestonesBaselinesTasks(new Date());

const shape = shallowRef<MilestoneShape>(MILESTONES_BASELINES_INITIAL.shape);
const baseline = shallowRef(MILESTONES_BASELINES_INITIAL.baseline);
const options = computed(() => milestonesBaselinesOptions(shape.value, baseline.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="milestones-baselines-shape-label">Milestone shape</span>
        <div class="gs-seg" role="group" aria-labelledby="milestones-baselines-shape-label">
          <button
            v-for="s in MILESTONE_SHAPES"
            :key="s.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="shape === s.value"
            @click="shape = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Baselines</span>
        <input v-model="baseline" type="checkbox" role="switch" />
      </label>
    </div>
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
  </div>
</template>
