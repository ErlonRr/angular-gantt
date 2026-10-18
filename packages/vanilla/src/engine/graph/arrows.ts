/**
 * @file arrows.ts
 * Dependency links indexed by their vertical span (`buildArrowIndex`), built once per
 * (tasks, geometries): a scroll queries the window's links instead of scanning every task.
 * Each link's `ArrowVisual` is memoised per link and per bar-visual memo, so a scroll computes
 * only the links that entered the window. The visual carries its dash and its lag label's font
 * size (core: the chart font size − 2), so the painter adds no geometry of its own.
 */

import {
  buildArrowIndex,
  computeArrowVisual,
  DependencyType,
  type ArrowIndex,
  type ArrowLink,
  type ArrowVisual,
} from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { CoreGraph } from '../engine';
import type { Inputs } from '../inputs';
import type { NodeFactory } from './node';
import type { VisualsGraph } from './visuals';

/** Arrow visual of a link of the current index (`null` when an end has no row). */
export type ArrowVisualOf = (link: ArrowLink) => ArrowVisual | null;

export interface ArrowsGraph {
  readonly arrowIndex: ReadonlySignal<ArrowIndex>;
  readonly arrowVisual: ReadonlySignal<ArrowVisualOf>;
}

export function arrowsGraph(_I: Inputs, g: CoreGraph & VisualsGraph, node: NodeFactory): ArrowsGraph {
  const arrowIndex = node('arrowIndex', () => buildArrowIndex(g.tasks(), g.geoById()));
  const arrowVisual = node('arrowVisual', (): ArrowVisualOf => {
    // Every input of an arrow: the bar visuals of both ends (their memo restarts with the config,
    // the timeline, the critical path and the metrics), the rows, the critical path and the font size
    const visualOf = g.barVisual();
    const geoById = g.geoById();
    const cfg = g.config();
    const critical = g.critical()?.criticalIds;
    const fontPx = g.metrics().fontPx;
    const memo = new WeakMap<ArrowLink, ArrowVisual | null>();
    return link => {
      let a = memo.get(link);
      if (a === undefined) {
        const from = geoById.get(link.from);
        const to = geoById.get(link.to);
        a =
          from && to
            ? computeArrowVisual(
                visualOf(from),
                visualOf(to),
                { type: link.dep.type ?? DependencyType.FS, lag: link.dep.lag },
                cfg,
                { fromTop: from.y, fromBottom: from.y + from.height },
                !!critical?.has(link.from) && critical.has(link.to),
                fontPx,
              )
            : null;
        memo.set(link, a);
      }
      return a;
    };
  });
  return { arrowIndex, arrowVisual };
}
