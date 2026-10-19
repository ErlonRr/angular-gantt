<!--
  Tasks that arrive page by page from a slow fake API: a `GanttDataSource` as the `dataSource` prop.
  A failed page is retried on its own, then the chart offers Retry; `reset()` starts again from page
  one. Its `onChange` callback and plain getters drive the status line.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Gantry, GanttDataSource } from '@gantryjs/svelte';
  import { LAZY_OPTIONS, createLazyApi, lazySource, lazyStatus } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The fake server: `api.setFail(true)` makes its next answers fail
  const api = createLazyApi(new Date());
  // `fetcher`, `pageSize`, `retries` and `retryDelay` (`lazySource`)
  const source = new GanttDataSource(lazySource(api));
  onDestroy(() => source.destroy());

  // The source has plain getters: copy what the page shows into state on every change
  let status = $state(lazyStatus(source));
  source.onChange = () => (status = lazyStatus(source));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <label class="gs-switch gs-case-control">
      <span>Fail requests</span>
      <input type="checkbox" role="switch" checked={api.fail} onchange={e => api.setFail(e.currentTarget.checked)} />
    </label>
    <button type="button" class="gs-btn gs-btn--sm" onclick={() => source.reset()}>Reset</button>
  </div>

  <Gantry class="gs-chart gs-case-chart" dataSource={source} options={LAZY_OPTIONS} darkMode={siteTheme.dark} />
  <p class="gs-case-hint">{status}</p>
</div>
