<!--
  The custom tooltip's content (TooltipExample.vue renders it into a DOM node). It shows inside the
  chart's shadow root, out of reach of page and scoped CSS, so it is styled with inline style
  objects (CSSOM writes) and the chart's `--gantt-*` variables.
-->
<script setup lang="ts">
import type { CSSProperties } from 'vue';

defineProps<{
  title: string;
  lines: { label: string; value: string }[];
  progress: number;
}>();

const card: CSSProperties = { display: 'grid', gap: '6px', minWidth: '180px' };
const list: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0 };
const track: CSSProperties = {
  height: '6px',
  borderRadius: '3px',
  background: 'var(--gantt-grid-line)',
  overflow: 'hidden',
};
const fill: CSSProperties = { display: 'block', height: '100%', background: 'var(--gantt-bar)' };
</script>

<template>
  <div :style="card">
    <strong :style="{ fontSize: '13px' }">{{ title }}</strong>
    <dl :style="list">
      <template v-for="line in lines" :key="line.label">
        <dt :style="{ opacity: 0.75 }">{{ line.label }}</dt>
        <dd :style="{ margin: 0, fontVariantNumeric: 'tabular-nums' }">{{ line.value }}</dd>
      </template>
    </dl>
    <!-- The text below says the same -->
    <span :style="track" aria-hidden="true"><span :style="{ ...fill, width: `${progress}%` }" /></span>
    <span>{{ progress }} % done</span>
  </div>
</template>
