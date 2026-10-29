<!--
  The generic renderer: a case's shared data and options (`CASE_DATA[id]` of demo-kit/gallery)
  drawn with `<Gantry>`, without the case's own controls. A case uses it until its Svelte file
  exists (`cases/<id>/<Pascal>Example.svelte`).
-->
<script lang="ts">
  import { Gantry, GanttDataSource, createGanttSyncGroup } from '@gantryjs/svelte';
  import { CASE_DATA, type CaseId, type GalleryChart } from 'demo-kit/gallery';
  import { siteTheme } from './site-theme.svelte';

  type Chart = GalleryChart & { source: GanttDataSource | undefined };

  let { id }: { id: CaseId } = $props();

  // The charts for this page's `now`: a paged source becomes a data source, a synced case one
  // group for all its charts
  const setup = $derived.by(() => {
    const data = CASE_DATA[id];
    const charts: Chart[] = data.charts(new Date()).map(c => ({
      ...c,
      source: c.dataSource ? new GanttDataSource(c.dataSource) : undefined,
    }));
    const group = data.sync ? createGanttSyncGroup(data.sync === true ? {} : data.sync) : undefined;
    return { charts, group };
  });
</script>

{#snippet chart(c: Chart)}
  <Gantry
    class="gs-chart gs-case-chart"
    tasks={c.source ? undefined : c.tasks}
    dataSource={c.source}
    options={c.options}
    annotations={c.annotations}
    resources={c.resources}
    darkMode={siteTheme.dark}
    showToolbar={c.showToolbar ?? true}
    showLegend={c.showLegend ?? false}
    loading={c.loading ?? false}
    errorMessage={c.errorMessage ?? null}
    syncGroup={setup.group}
  />
{/snippet}

<div class="gs-case">
  {#if setup.charts.length === 1}
    {@render chart(setup.charts[0])}
  {:else}
    <div class="gs-case-stack">
      {#each setup.charts as c (c)}
        <div>
          {#if c.caption}<p class="gs-case-caption">{c.caption}</p>{/if}
          {@render chart(c)}
        </div>
      {/each}
    </div>
  {/if}
  <p class="gs-case-hint">The shared data and options of this case; the Shared data tab below shows them.</p>
</div>
