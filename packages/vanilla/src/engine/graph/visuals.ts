/**
 * @file visuals.ts
 * Bar visuals, memoised per row geometry, and the drag state the bars and the overlay paint.
 * A new visual memo starts whenever an input of `computeBarVisual` changes (config, timeline,
 * critical path, theme metrics, drag / resize flags); scrolling, selection, drag moves and
 * colour-only theme changes reuse every visual. The memo serves any visible row, mounted or not
 * (`getBarVisual` of a row outside the virtual window).
 */

import {
  computeBarVisual,
  computeDragGhostVisual,
  type BarVisual,
  type GhostVisual,
  type RowGeometry,
} from '@gantry/core';
import type { ReadonlySignal } from '../../reactive';
import type { CoreGraph } from '../engine';
import type { Inputs } from '../inputs';
import type { NodeFactory } from './node';

/** Bar visual of a row geometry (computed once per geometry while the memo lives). */
export type BarVisualOf = (geo: RowGeometry) => BarVisual;

export interface VisualsGraph {
  readonly barVisual: ReadonlySignal<BarVisualOf>;
  /** Task whose bar is being dragged or resized (dimmed), `null` when idle: changes once per gesture */
  readonly draggedBarId: ReadonlySignal<string | null>;
  /** The drag / resize ghost (`computeDragGhostVisual`), `null` when idle or when its row is gone */
  readonly ghostVisual: ReadonlySignal<GhostVisual | null>;
}

export function visualsGraph(I: Inputs, g: CoreGraph, node: NodeFactory): VisualsGraph {
  const barVisual = node('barVisual', (): BarVisualOf => {
    const config = g.config();
    const { toX } = g.timeline();
    const { fontPx, barTextColor } = g.metrics();
    const critical = g.critical()?.criticalIds;
    const drag = I.enableDrag();
    const resize = I.enableResize();
    const memo = new WeakMap<RowGeometry, BarVisual>();
    return geo => {
      let v = memo.get(geo);
      if (!v) {
        const task = geo.row.task;
        v = computeBarVisual({
          geo,
          cfg: config,
          toX,
          fontPx,
          barTextColor,
          isCritical: critical?.has(task.id) ?? false,
          resizable: drag && resize && task.draggable !== false,
        });
        memo.set(geo, v);
      }
      return v;
    };
  });
  const draggedBarId = node('draggedBarId', () => I.dragPreview()?.taskId ?? null);
  const ghostVisual = node('ghostVisual', (): GhostVisual | null => {
    const preview = I.dragPreview();
    const geo = preview && g.geoById().get(preview.taskId);
    if (!preview || !geo) return null;
    return computeDragGhostVisual(preview, geo, g.config(), g.timeline().toX, g.i18n(), g.metrics().fontPx);
  });
  return { barVisual, draggedBarId, ghostVisual };
}
