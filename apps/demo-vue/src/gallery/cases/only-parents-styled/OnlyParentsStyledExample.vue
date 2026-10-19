<!--
  Collapsed parents painted from their children: `rollup.color` is `'status'` (the summary status of
  the children) or a callback (`mainTeamColor`), and `rollup.segments` draws each child inside the bar.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  ONLY_PARENTS_STYLED_COLORS,
  ONLY_PARENTS_STYLED_INITIAL,
  ONLY_PARENTS_STYLED_TEAMS,
  onlyParentsStyledOptions,
  onlyParentsStyledTasks,
  type OnlyParentsColor,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The tree, every task in its team's colour (what the segments show)
const tasks = onlyParentsStyledTasks(new Date());

const color = shallowRef<OnlyParentsColor>(ONLY_PARENTS_STYLED_INITIAL.color);
const segments = shallowRef(ONLY_PARENTS_STYLED_INITIAL.segments);
const options = computed(() => onlyParentsStyledOptions(color.value, segments.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <label for="only-parents-styled-color">Parent colour</label>
        <select id="only-parents-styled-color" v-model="color" class="gs-select">
          <option v-for="c in ONLY_PARENTS_STYLED_COLORS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Child segments</span>
        <input v-model="segments" type="checkbox" role="switch" />
      </label>
    </div>
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
    <ul class="gs-case-legend" aria-label="Team colours">
      <li v-for="team in ONLY_PARENTS_STYLED_TEAMS" :key="team.label">
        <span class="gs-case-swatch" :style="{ backgroundColor: team.color }" aria-hidden="true"></span>
        {{ team.label }}
      </li>
    </ul>
  </div>
</template>
