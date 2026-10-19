<!--
  The chart from the keyboard alone: the key map, and an echo of the chart's polite live region
  (`.gantt-sr-live`, in the element's open shadow root), which a MutationObserver watches.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import { KEYBOARD_KEYS, KEYBOARD_LIVE_SELECTOR, KEYBOARD_OPTIONS, keyboardTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = keyboardTasks(new Date());

const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const announced = shallowRef('');
let observer: MutationObserver | undefined;

onMounted(() => {
  const live = chart.value?.element?.shadowRoot?.querySelector(KEYBOARD_LIVE_SELECTOR);
  if (!live) return;
  observer = new MutationObserver(() => {
    const text = live.textContent?.trim();
    if (text) announced.value = text;
  });
  observer.observe(live, { childList: true, characterData: true, subtree: true });
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="gs-case">
    <Gantry ref="chart" class="gs-chart gs-case-chart" :tasks="tasks" :options="KEYBOARD_OPTIONS" :dark-mode="dark" />
    <!-- A plain paragraph, not a live region: screen readers already hear the chart's own -->
    <p class="gs-case-hint">
      Announced: {{ announced || 'nothing yet. Tab into the chart, then select a row or zoom.' }}
    </p>
    <dl class="gs-case-keys">
      <template v-for="row in KEYBOARD_KEYS" :key="`${row.area} ${row.keys.join(' ')}`">
        <dt>
          <kbd v-for="key in row.keys" :key="key" class="gs-kbd">{{ key }}</kbd>
        </dt>
        <dd>{{ row.area }}: {{ row.action }}</dd>
      </template>
    </dl>
  </div>
</template>
