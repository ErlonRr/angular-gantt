<!--
  The generic renderer: a case's shared data and options (`CASE_DATA[id]` of demo-kit/gallery)
  drawn with `<Gantry>`, without the case's own controls. A case uses it until its Vue file exists
  (`cases/<id>/<Pascal>Example.vue`).
-->
<script setup lang="ts">
import { Gantry, GanttDataSource, createGanttSyncGroup } from '@gantryjs/vue';
import { CASE_DATA, type CaseId } from 'demo-kit/gallery';
import { useDarkMode } from './site-theme';

const props = defineProps<{ id: CaseId }>();
const dark = useDarkMode();

// The charts for this page's `now`, built once (the page is keyed by the case): a paged source
// becomes a data source, a synced case one group for all its charts
const data = CASE_DATA[props.id];
const group = data.sync ? createGanttSyncGroup(data.sync === true ? {} : data.sync) : undefined;
const charts = data.charts(new Date()).map(c => ({
  caption: c.caption,
  props: {
    tasks: c.dataSource ? undefined : c.tasks,
    dataSource: c.dataSource ? new GanttDataSource(c.dataSource) : undefined,
    options: c.options,
    annotations: c.annotations,
    showToolbar: c.showToolbar ?? true,
    showLegend: c.showLegend ?? false,
    loading: c.loading ?? false,
    errorMessage: c.errorMessage ?? null,
    syncGroup: group,
  },
}));
</script>

<template>
  <div class="gs-case">
    <Gantry v-if="charts.length === 1" class="gs-chart gs-case-chart" v-bind="charts[0].props" :dark-mode="dark" />
    <div v-else class="gs-case-stack">
      <div v-for="(c, i) in charts" :key="i">
        <p v-if="c.caption" class="gs-case-caption">{{ c.caption }}</p>
        <Gantry class="gs-chart gs-case-chart" v-bind="c.props" :dark-mode="dark" />
      </div>
    </div>
    <p class="gs-case-hint">The shared data and options of this case; the Shared data tab below shows them.</p>
  </div>
</template>
