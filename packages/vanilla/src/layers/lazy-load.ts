/**
 * @file lazy-load.ts
 * Lazy-load region, last in the flush: fetch the data source's next page when the virtual window
 * nears the end — never while a failed page waits for `retry()`, and the first page only per
 * `initialPage`. A page that starts loading updates the footer in the same flush.
 */

import type { Layer, LayerContext } from './context';

export function createLazyLoadLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G } = ctx;
  return {
    paint() {
      const ds = I.dataSource();
      const s = I.loadState();
      if (!ds || !s || !s.hasMore || s.isLoading || s.error || s.loadedCount === 0) return;
      if (G.vWindow().last >= G.visibleRows().length - 3) void ds.loadNext();
    },
  };
}
