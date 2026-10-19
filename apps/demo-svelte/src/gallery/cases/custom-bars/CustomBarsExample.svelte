<!--
  Bars drawn by your own code: `renderBar` returns the SVG of every epic (`barType: 'epic'`, see
  epic-bar.ts) and `null` for the other bars, which keep the built-in look. Page CSS restyles the
  epic's `part`s in forced colours (the `:global` rules below).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import { CUSTOM_BARS_OPTIONS, RISKS, RISK_COLORS, RISK_LABELS, customBarsTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';
  import { renderEpicBar } from './epic-bar';

  const tasks = customBarsTasks(new Date());
</script>

<div class="gs-case">
  <Gantry
    class="gs-chart gs-case-chart"
    {tasks}
    options={CUSTOM_BARS_OPTIONS}
    renderBar={renderEpicBar}
    darkMode={siteTheme.dark}
  />
  <p class="gs-case-hint">An epic underlines its progress; its badge shows its risk (L, M or H).</p>
  <ul class="gs-case-legend" aria-label="Risk badges">
    {#each RISKS as risk (risk)}
      <li><span class="gs-case-swatch" style:background-color={RISK_COLORS[risk]}></span>{RISK_LABELS[risk]}</li>
    {/each}
  </ul>
</div>

<style>
  /* The epic's nodes sit in the chart's shadow root: ::part() reaches them and wins over their CSSOM paints */
  @media (forced-colors: active) {
    :global(gantry-element::part(epic-body)) {
      fill: ButtonFace;
      stroke: ButtonText;
    }
    :global(gantry-element::part(epic-selected)) {
      stroke: Highlight;
      stroke-width: 2.5px;
    }
    :global(gantry-element::part(epic-track)) {
      fill: GrayText;
      opacity: 1;
    }
    :global(gantry-element::part(epic-progress)) {
      fill: ButtonText;
    }
    :global(gantry-element::part(epic-risk)) {
      fill: ButtonText;
      stroke: ButtonFace;
    }
    :global(gantry-element::part(epic-risk-text)) {
      fill: ButtonFace;
    }
    :global(gantry-element::part(epic-label)) {
      fill: ButtonText;
    }
    :global(gantry-element::part(epic-label-outside)) {
      fill: CanvasText;
    }
  }
</style>
