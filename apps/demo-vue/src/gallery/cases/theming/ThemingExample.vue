<!--
  Theming: a preset's overrides in `options.theme` (one set per mode), `dark-mode` from the site
  or pinned, CSS custom properties on the element, and the shadow DOM's `::part` and `:state(dark)`.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  THEMING_CSS_VARIABLES,
  THEMING_INITIAL,
  THEMING_MODES,
  THEMING_PRESETS,
  themingDark,
  themingOptions,
  themingTasks,
  type ThemingMode,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const siteDark = useDarkMode();
const tasks = themingTasks(new Date());
const preset = shallowRef(THEMING_INITIAL.preset);
const mode = shallowRef<ThemingMode>(THEMING_INITIAL.mode);

const dark = computed(() => themingDark(mode.value, siteDark.value));
// The preset's overrides for the mode the chart shows
const options = computed(() => themingOptions(preset.value, dark.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="theming-theme-label">Theme</span>
        <div class="gs-seg" role="group" aria-labelledby="theming-theme-label">
          <button
            v-for="choice in THEMING_PRESETS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="preset === choice.value"
            @click="preset = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="theming-mode-label">Mode</span>
        <div class="gs-seg" role="group" aria-labelledby="theming-mode-label">
          <button
            v-for="choice in THEMING_MODES"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="mode === choice.value"
            @click="mode = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
    </div>
    <Gantry
      class="gs-chart gs-case-chart themed-chart"
      :style="THEMING_CSS_VARIABLES"
      :tasks="tasks"
      :options="options"
      :dark-mode="dark"
    />
    <p class="gs-case-hint">
      The font, focus ring and row hover colour are CSS variables set on the element; page CSS draws the toolbar line
      and the dark-mode frame.
    </p>
  </div>
</template>

<style scoped>
/* The chart renders in a shadow root: reach it through its parts and custom states.
   A part: an accent line on top of the toolbar, in the bar colour of the preset */
.themed-chart::part(toolbar) {
  border-top: 3px solid var(--gantt-bar);
}
/* A custom state: while the chart is dark, its frame takes the bar colour too */
.themed-chart:state(dark) {
  border-color: var(--gantt-bar);
}
</style>
