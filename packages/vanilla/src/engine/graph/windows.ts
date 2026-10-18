/**
 * @file windows.ts
 * The vertical virtual window shared by the task list and the timeline. It compares by value
 * (core `sameVirtualWindow`), so scrolling inside the overscan changes nothing downstream.
 */

import {
  computeVirtualWindow,
  sameVirtualWindow,
  VIEWPORT_FALLBACK_HEIGHT,
  VIRTUAL_OVERSCAN_ROWS,
  type VirtualWindow,
} from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { Inputs } from '../inputs';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';
import type { RowsGraph } from './rows';
import type { TimelineGraph } from './timeline';

export interface WindowsGraph {
  /** Rows mounted in both panes; the focused and the dragged row stay pinned */
  readonly vWindow: ReadonlySignal<VirtualWindow>;
}

export function windowsGraph(
  I: Inputs,
  cfg: ConfigGraph,
  rows: RowsGraph,
  tl: TimelineGraph,
  node: NodeFactory,
): WindowsGraph {
  const draggedId = node('draggedId', () => I.dragPreview()?.taskId ?? null);
  const vWindow = node(
    'vWindow',
    () => {
      const rh = cfg.config().rowHeight;
      const count = rows.visibleRows().length;
      const pinned: number[] = [];
      for (const id of [I.focusedRowId(), draggedId()]) {
        const geo = id === null ? undefined : tl.geoById().get(id);
        if (geo) pinned.push(geo.row.visibleIndex);
      }
      const viewportH = Math.max(rh, (I.canvasH() || VIEWPORT_FALLBACK_HEIGHT) - I.headerH());
      return computeVirtualWindow(I.scrollTop(), rh, viewportH, count, VIRTUAL_OVERSCAN_ROWS, pinned);
    },
    { equals: sameVirtualWindow },
  );
  return { vWindow };
}
