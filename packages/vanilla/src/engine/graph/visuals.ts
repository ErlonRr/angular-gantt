/**
 * @file visuals.ts
 * Bar visuals, memoised per row geometry, and the drag state the bars and the overlay paint.
 * A new visual memo starts whenever an input of `computeBarVisual` changes (config, timeline,
 * critical path, row styles, theme metrics, drag / resize flags); scrolling, selection, drag moves
 * and colour-only theme changes reuse every visual. The memo serves any visible row, mounted or not
 * (`getBarVisual` of a row outside the virtual window).
 *
 * Each visual gets its row's resolved style (`graph/styles.ts`), and a collapsed rolled-up parent
 * gets its children as segments (`rollup.segments`, core `rollupSegments`), each in its child's
 * style colour.
 */

import {
  computeBarVisual,
  computeDragGhostVisual,
  rollupSegments,
  taskOwnStyle,
  type BarSegment,
  type BarVisual,
  type GanttFlatRow,
  type GanttTask,
  type GhostVisual,
  type ResolvedTaskStyle,
  type RowGeometry,
} from '@gantryjs/core';
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
  /** The drag / resize ghost (`computeDragGhostVisual` with the row's resolved style), `null` when idle or when its row is gone */
  readonly ghostVisual: ReadonlySignal<GhostVisual | null>;
}

export function visualsGraph(I: Inputs, g: CoreGraph, node: NodeFactory): VisualsGraph {
  const barVisual = node('barVisual', (): BarVisualOf => {
    const config = g.config();
    const { toX } = g.timeline();
    const { fontPx, barTextColor } = g.metrics();
    const critical = g.critical()?.criticalIds;
    const styleOf = g.rowStyle();
    const drag = I.enableDrag();
    const resize = I.enableResize();
    // Segments: only with `rollup.segments` (the rows are read only then)
    const rollup = config.rollup;
    const segmentsOn = rollup !== false && rollup.segments;
    const rollups = segmentsOn ? g.rollups() : null;
    const allRows = segmentsOn ? g.allRows() : null;
    let rowById: Map<string, GanttFlatRow> | undefined;
    /** A child's style for its segment colour: its row's (collapsed rows are kept, flagged), else its own */
    const childStyle = (child: GanttTask): ResolvedTaskStyle => {
      rowById ??= new Map(allRows?.map(r => [r.task.id, r]));
      const row = rowById.get(child.id);
      return row ? styleOf(row) : taskOwnStyle(child);
    };
    const segmentsOf = (row: GanttFlatRow): BarSegment[] | null => {
      if (!rollups || !row.hasChildren || !row.isCollapsed) return null;
      const info = rollups.get(row.task.id);
      return info ? rollupSegments(info, { toX, cfg: config, styleOf: childStyle }) : null;
    };
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
          style: styleOf(geo.row),
          segments: segmentsOf(geo.row),
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
    // At its bar's height and radius: the row's resolved style, as `barVisual` paints it
    const style = g.rowStyle()(geo.row);
    return computeDragGhostVisual(preview, geo, g.config(), g.timeline().toX, g.i18n(), g.metrics().fontPx, style);
  });
  return { barVisual, draggedBarId, ghostVisual };
}
