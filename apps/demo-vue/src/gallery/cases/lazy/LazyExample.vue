<!--
  Tasks that arrive page by page from a slow fake API: a `GanttDataSource` as the `data-source` prop.
  A failed page is retried on its own, then the chart offers Retry; `reset()` starts again from page
  one. Its `onChange` callback and plain getters drive the status line.
-->
<script setup lang="ts">
import { onUnmounted, shallowRef, watch } from 'vue';
import { Gantry, GanttDataSource } from '@gantryjs/vue';
import { LAZY_OPTIONS, createLazyApi, lazySource, lazyStatus } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
// The fake server: `api.setFail(true)` makes its next answers fail
const api = createLazyApi(new Date());
// `fetcher`, `pageSize`, `retries` and `retryDelay` (`lazySource`). A plain constant: the chart
// follows the source itself (a deep `ref` would proxy the class)
const source = new GanttDataSource(lazySource(api));
onUnmounted(() => source.destroy());

const failing = shallowRef(api.fail);
watch(failing, fail => api.setFail(fail));

const status = shallowRef(lazyStatus(source));
source.onChange = () => (status.value = lazyStatus(source));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <label class="gs-switch gs-case-control">
        <span>Fail requests</span>
        <input v-model="failing" type="checkbox" role="switch" />
      </label>
      <button type="button" class="gs-btn gs-btn--sm" @click="source.reset()">Reset</button>
    </div>

    <Gantry class="gs-chart gs-case-chart" :data-source="source" :options="LAZY_OPTIONS" :dark-mode="dark" />
    <p class="gs-case-hint">{{ status }}</p>
  </div>
</template>
