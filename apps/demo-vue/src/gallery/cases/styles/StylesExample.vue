<!--
  Default styles by kind, parent, level and rule (`options.styles`), under each task's own `style`.
  Field by field the later layer wins; the legend lists the layers in the order they apply.
-->
<script setup lang="ts">
import { Gantry } from '@gantryjs/vue';
import { STYLES_OPTIONS, STYLES_PRECEDENCE, stylesTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The tree, one task with a `style` of its own (the last layer)
const tasks = stylesTasks(new Date());
</script>

<template>
  <div class="gs-case">
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="STYLES_OPTIONS" :dark-mode="dark" />
    <p class="gs-case-hint">Field by field, a later layer wins over an earlier one; class names add up.</p>
    <ol class="gs-case-legend" aria-label="Style layers, first to last">
      <li v-for="step in STYLES_PRECEDENCE" :key="step.layer">
        <!-- No colour: the layer keeps the colour it inherits (a neutral swatch) -->
        <span class="gs-case-swatch" :style="{ backgroundColor: step.color ?? undefined }" aria-hidden="true"></span>
        {{ step.layer }} <code class="gs-code-inline">{{ step.option }}</code>
      </li>
    </ol>
  </div>
</template>
