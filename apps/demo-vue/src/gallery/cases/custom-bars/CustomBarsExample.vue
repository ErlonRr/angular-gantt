<!--
  Bars drawn by your own code: `render-bar` returns the SVG of every epic (`barType: 'epic'`, see
  epic-bar.ts) and `null` for the other bars, which keep the built-in look. Page CSS restyles the
  epic's `part`s in forced colours (the `<style>` below, not scoped).
-->
<script setup lang="ts">
import { Gantry } from '@gantryjs/vue';
import { CUSTOM_BARS_OPTIONS, RISKS, RISK_COLORS, RISK_LABELS, customBarsTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { renderEpicBar } from './epic-bar';

const dark = useDarkMode();
const tasks = customBarsTasks(new Date());
</script>

<template>
  <div class="gs-case">
    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :options="CUSTOM_BARS_OPTIONS"
      :render-bar="renderEpicBar"
      :dark-mode="dark"
    />
    <p class="gs-case-hint">An epic underlines its progress; its badge shows its risk (L, M or H).</p>
    <ul class="gs-case-legend" aria-label="Risk badges">
      <li v-for="risk in RISKS" :key="risk">
        <span class="gs-case-swatch" :style="{ backgroundColor: RISK_COLORS[risk] }" />
        {{ RISK_LABELS[risk] }}
      </li>
    </ul>
  </div>
</template>

<style>
/* The epic's nodes sit in the chart's shadow root: ::part() reaches them and wins over their CSSOM paints */
@media (forced-colors: active) {
  gantry-element::part(epic-body) {
    fill: ButtonFace;
    stroke: ButtonText;
  }
  gantry-element::part(epic-selected) {
    stroke: Highlight;
    stroke-width: 2.5px;
  }
  gantry-element::part(epic-track) {
    fill: GrayText;
    opacity: 1;
  }
  gantry-element::part(epic-progress) {
    fill: ButtonText;
  }
  gantry-element::part(epic-risk) {
    fill: ButtonText;
    stroke: ButtonFace;
  }
  gantry-element::part(epic-risk-text) {
    fill: ButtonFace;
  }
  gantry-element::part(epic-label) {
    fill: ButtonText;
  }
  gantry-element::part(epic-label-outside) {
    fill: CanvasText;
  }
}
</style>
