/**
 * @file arrows.ts
 * Dependency links indexed by their vertical span (`buildArrowIndex`), built once per
 * (tasks, geometries): a scroll queries the window's links instead of scanning every task.
 * Each link's `ArrowVisual` is memoised per link and per bar-visual memo, so a scroll computes
 * only the links that entered the window. The visual carries its dash and its lag label's font
 * size (core: the chart font size − 2), so the painter adds no geometry of its own.
 *
 * The arrows read `barVisualBase` (a progress being edited moves no bar end). The selected link
 * (`inputs.selectedLinkKey`, an `ArrowLink.key`) is drawn with core `selectedArrowVisual`
 * (focus-ring paint, width + 1, a halo, `selected: true`); a selection change keeps every other
 * memo.
 *
 * `linkPreviewPath`: the open link session's preview drawn from the bars as they are now (core
 * `linkPreviewPathOf`), so a zoom or any re-layout during a session moves it with them.
 */

import {
  buildArrowIndex,
  computeArrowVisual,
  linkPreviewPathOf,
  selectedArrowVisual,
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
  /** Arrow visuals as painted: the selected link (`inputs.selectedLinkKey`) included */
  readonly arrowVisual: ReadonlySignal<ArrowVisualOf>;
  /**
   * The `d` of `path.gantt-link-preview` with the bars as they are now: from the source's
   * connector to the target's, else to the last pointer (core `linkPreviewPathOf`); `null` while
   * no preview shows. The session's own `preview.d` when an end has no row.
   */
  readonly linkPreviewPath: ReadonlySignal<string | null>;
}

export function arrowsGraph(I: Inputs, g: CoreGraph & VisualsGraph, node: NodeFactory): ArrowsGraph {
  // The resource view draws no link (its rows have no bar): an empty index, built once
  const noArrows = buildArrowIndex([], new Map());
  const arrowIndex = node('arrowIndex', () =>
    g.utilization() === null ? buildArrowIndex(g.tasks(), g.geoById()) : noArrows,
  );
  const arrowVisualBase = node('arrowVisualBase', (): ArrowVisualOf => {
    // Every input of an arrow: the bar visuals of both ends (their memo restarts with the config,
    // the timeline, the critical path and the metrics), the rows, the critical path and the font size
    const visualOf = g.barVisualBase();
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
  const arrowVisual = node('arrowVisual', (): ArrowVisualOf => {
    const base = arrowVisualBase();
    const selectedKey = I.selectedLinkKey();
    if (selectedKey === null) return base;
    let selected: { link: ArrowLink; visual: ArrowVisual | null } | null = null;
    return link => {
      if (link.key !== selectedKey) return base(link);
      if (selected?.link !== link) {
        const a = base(link);
        selected = { link, visual: a && selectedArrowVisual(a) };
      }
      return selected.visual;
    };
  });
  const linkPreviewPath = node('linkPreviewPath', (): string | null => {
    const link = I.link();
    const preview = link?.preview;
    if (!link || !preview) return null;
    const geoById = g.geoById();
    const source = geoById.get(link.sourceId);
    const target = preview.targetId === null ? undefined : geoById.get(preview.targetId);
    const visualOf = g.barVisual();
    if (source && target && preview.targetSide) {
      return linkPreviewPathOf(visualOf(source), link.side, { visual: visualOf(target), side: preview.targetSide });
    }
    if (source && preview.targetId === null && link.pointer) {
      return linkPreviewPathOf(visualOf(source), link.side, link.pointer);
    }
    return preview.d;
  });
  return { arrowIndex, arrowVisual, linkPreviewPath };
}
