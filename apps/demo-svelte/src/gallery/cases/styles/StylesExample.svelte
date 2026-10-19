<!--
  Default styles by kind, parent, level and rule (`options.styles`), under each task's own `style`.
  Field by field the later layer wins; the legend lists the layers in the order they apply.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import { STYLES_OPTIONS, STYLES_PRECEDENCE, stylesTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The tree, one task with a `style` of its own (the last layer)
  const tasks = stylesTasks(new Date());
</script>

<div class="gs-case">
  <Gantry class="gs-chart gs-case-chart" {tasks} options={STYLES_OPTIONS} darkMode={siteTheme.dark} />
  <p class="gs-case-hint">Field by field, a later layer wins over an earlier one; class names add up.</p>
  <ol class="gs-case-legend" aria-label="Style layers, first to last">
    {#each STYLES_PRECEDENCE as step (step.layer)}
      <li>
        <!-- No colour: the layer keeps the colour it inherits (a neutral swatch) -->
        <span class="gs-case-swatch" style:background-color={step.color} aria-hidden="true"></span>
        {step.layer} <code class="gs-code-inline">{step.option}</code>
      </li>
    {/each}
  </ol>
</div>
