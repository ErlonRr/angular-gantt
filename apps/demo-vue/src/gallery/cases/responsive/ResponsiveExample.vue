<!--
  Responsive: below `responsive.breakpoint` the chart shows `responsive.view`, and the toolbar
  moves what doesn't fit into a More menu or wraps it (`toolbar.overflow`). The slider sizes the
  chart's container: the chart follows its own width, not the window's.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  RESPONSIVE_BREAKPOINT,
  RESPONSIVE_INITIAL,
  RESPONSIVE_OVERFLOWS,
  RESPONSIVE_VIEWS,
  RESPONSIVE_WIDTH,
  responsiveOptions,
  responsiveTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = responsiveTasks(new Date());
const width = shallowRef<number>(RESPONSIVE_WIDTH.initial);
const overflow = shallowRef(RESPONSIVE_INITIAL.overflow);
const narrowView = shallowRef(RESPONSIVE_INITIAL.narrowView);
const options = computed(() => responsiveOptions(overflow.value, narrowView.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <label for="responsive-width">Container width</label>
        <input
          id="responsive-width"
          v-model.number="width"
          class="gs-range width-range"
          type="range"
          :min="RESPONSIVE_WIDTH.min"
          :max="RESPONSIVE_WIDTH.max"
          :step="RESPONSIVE_WIDTH.step"
          :aria-valuetext="`${width} px`"
        />
        <span class="gs-value" aria-hidden="true">{{ width }} px</span>
      </div>
      <div class="gs-case-control">
        <span id="responsive-overflow-label">Toolbar overflow</span>
        <div class="gs-seg" role="group" aria-labelledby="responsive-overflow-label">
          <button
            v-for="choice in RESPONSIVE_OVERFLOWS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="overflow === choice.value"
            @click="overflow = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
      <div class="gs-case-control">
        <span id="responsive-view-label">Narrow view</span>
        <div class="gs-seg" role="group" aria-labelledby="responsive-view-label">
          <button
            v-for="choice in RESPONSIVE_VIEWS"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="narrowView === choice.value"
            @click="narrowView = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
    </div>
    <!-- The chart follows its container, not the window -->
    <div class="gs-case-frame" :style="{ width: `${width}px` }">
      <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
    </div>
    <p class="gs-case-hint">Below {{ RESPONSIVE_BREAKPOINT }} px the chart switches to the narrow view.</p>
  </div>
</template>

<style scoped>
.width-range {
  width: 200px;
}
</style>
