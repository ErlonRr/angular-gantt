<!--
  A chart in a container you narrow: below `responsive.breakpoint` it shows `responsive.view`, and
  the toolbar moves what doesn't fit into a More menu or wraps it (`toolbar.overflow`).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    RESPONSIVE_BREAKPOINT,
    RESPONSIVE_INITIAL,
    RESPONSIVE_OVERFLOWS,
    RESPONSIVE_VIEWS,
    RESPONSIVE_WIDTH,
    responsiveOptions,
    responsiveTasks,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = responsiveTasks(new Date());
  let width = $state<number>(RESPONSIVE_WIDTH.initial);
  let overflow = $state(RESPONSIVE_INITIAL.overflow);
  let narrowView = $state(RESPONSIVE_INITIAL.narrowView);
  const options = $derived(responsiveOptions(overflow, narrowView));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <label for="responsive-width">Container width</label>
      <input
        id="responsive-width"
        type="range"
        class="gs-range width-range"
        min={RESPONSIVE_WIDTH.min}
        max={RESPONSIVE_WIDTH.max}
        step={RESPONSIVE_WIDTH.step}
        aria-valuetext="{width} px"
        bind:value={width}
      />
      <span class="gs-value" aria-hidden="true">{width} px</span>
    </div>
    <div class="gs-case-control">
      <span id="responsive-overflow-label">Toolbar overflow</span>
      <div class="gs-seg" role="group" aria-labelledby="responsive-overflow-label">
        {#each RESPONSIVE_OVERFLOWS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={overflow === choice.value}
            onclick={() => (overflow = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="responsive-view-label">Narrow view</span>
      <div class="gs-seg" role="group" aria-labelledby="responsive-view-label">
        {#each RESPONSIVE_VIEWS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={narrowView === choice.value}
            onclick={() => (narrowView = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- The chart follows its container, not the window -->
  <div class="gs-case-frame" style:width="{width}px">
    <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
  </div>

  <p class="gs-case-hint">Below {RESPONSIVE_BREAKPOINT} px the chart switches to the narrow view.</p>
</div>

<style>
  .width-range {
    width: 200px;
  }
</style>
