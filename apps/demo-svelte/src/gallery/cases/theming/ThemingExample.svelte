<!--
  Theme presets (`theme`: the overrides of the mode shown), the chart's own dark mode or the site's
  (`darkMode`), and page CSS on the element: custom properties, `::part()` and `:state(dark)`.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
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
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = themingTasks(new Date());
  let preset = $state(THEMING_INITIAL.preset);
  let mode = $state<ThemingMode>(THEMING_INITIAL.mode);
  const dark = $derived(themingDark(mode, siteTheme.dark));
  // The preset's overrides for the mode the chart shows
  const options = $derived(themingOptions(preset, dark));

  // An attachment: Gantry spreads it onto `<gantry-element>`, where inline custom properties win
  // over the theme the element writes in its `:host` stylesheet
  const cssVariables = (variables: Readonly<Record<string, string>>) => (element: HTMLElement) => {
    for (const [name, value] of Object.entries(variables)) element.style.setProperty(name, value);
  };
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="theming-theme-label">Theme</span>
      <div class="gs-seg" role="group" aria-labelledby="theming-theme-label">
        {#each THEMING_PRESETS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={preset === choice.value}
            onclick={() => (preset = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="gs-case-control">
      <span id="theming-mode-label">Mode</span>
      <div class="gs-seg" role="group" aria-labelledby="theming-mode-label">
        {#each THEMING_MODES as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={mode === choice.value}
            onclick={() => (mode = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <Gantry
    {@attach cssVariables(THEMING_CSS_VARIABLES)}
    class="gs-chart gs-case-chart themed-chart"
    {tasks}
    {options}
    darkMode={dark}
  />

  <p class="gs-case-hint">
    The font, focus ring and row hover colour are CSS variables set on the element; page CSS draws the toolbar line and
    the dark-mode frame.
  </p>
</div>

<style>
  /* The chart renders in a shadow root: reach it through its parts and custom states.
     A part: an accent line on top of the toolbar, in the bar colour of the preset */
  :global(gantry-element.themed-chart::part(toolbar)) {
    border-top: 3px solid var(--gantt-bar);
  }
  /* A custom state: while the chart is dark, its frame takes the bar colour too */
  :global(gantry-element.themed-chart:state(dark)) {
    border-color: var(--gantt-bar);
  }
</style>
