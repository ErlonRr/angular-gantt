/**
 * @file arrows.ts
 * Arrows region: the dependency links crossing the virtual window (`arrowIndex.query`, O(log n + k)),
 * keyed by `link.key` in drawing order. Each link's visual is memoised in the graph
 * (`graph.arrowVisual`, which carries the dash and the lag label's font size), so a scroll
 * computes and builds only the links that entered the window and leaves the others untouched.
 * The link selected for deletion (`inputs.selectedLinkKey`, `interaction/link.ts`) comes with its
 * selected visual (core `selectedArrowVisual`): only that group is patched (`gantt-arrow--selected`).
 */

import type { ArrowVisual } from '@gantryjs/core';
import { reconcile } from '../dom/keyed';
import { createArrow, patchArrow } from '../paint/arrows';
import type { Layer, LayerContext } from './context';

interface Item {
  readonly key: string;
  readonly a: ArrowVisual;
}

export function createArrowsLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  let painted = false;
  return {
    paint() {
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const { top, bottom } = G.windowSpan();
      const links = G.arrowIndex().query(top, bottom);
      const arrowOf = G.arrowVisual();

      const items: Item[] = [];
      for (const link of links) {
        const a = arrowOf(link);
        if (a) items.push({ key: link.key, a });
      }
      reconcile<Item, SVGGElement>(
        dom.arrows,
        items,
        item => item.key,
        item => createArrow(item.a),
        (el, item) => patchArrow(el, item.a),
      );
    },
  };
}
