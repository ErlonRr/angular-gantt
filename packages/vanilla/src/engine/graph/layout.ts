/**
 * @file layout.ts
 * Layout nodes the region effects share: the panel width, the header and content heights, and
 * which rows are mounted (the virtual window plus the pinned rows). Each one compares by value,
 * so a scroll that keeps the window, or a timeline change that keeps the header height,
 * re-runs nothing that reads them.
 */

import { resolvePanelWidth, splitterValue, virtualIndexes, type RowGeometry, type SplitterValue } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { Inputs } from '../inputs';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';
import type { RowsGraph } from './rows';
import type { TimelineGraph } from './timeline';
import type { WindowsGraph } from './windows';

/** Vertical pixel range of the virtual window (`first` to `last` row, pinned rows excluded). */
export interface WindowSpan {
  readonly top: number;
  readonly bottom: number;
}

export interface LayoutGraph {
  /** Task-list panel width for the current view (px): the whole host in table view, 0 in chart view */
  readonly panelPx: ReadonlySignal<number>;
  /** The splitter separator's `aria-valuenow` / `aria-valuemin` / `aria-valuemax`: the panel width (px) and its range */
  readonly splitter: ReadonlySignal<SplitterValue>;
  /** Height of the timeline header (the task-list column header matches it) */
  readonly headerHeight: ReadonlySignal<number>;
  /** Height of every visible row together: the canvas height */
  readonly totalHeight: ReadonlySignal<number>;
  /** Geometries mounted in the canvas: the pinned rows before the window, the window, the pinned rows after it */
  readonly mountedGeometries: ReadonlySignal<RowGeometry[]>;
  readonly windowSpan: ReadonlySignal<WindowSpan>;
}

export function layoutGraph(
  I: Inputs,
  g: ConfigGraph & RowsGraph & TimelineGraph & WindowsGraph,
  node: NodeFactory,
): LayoutGraph {
  const panelPx = node('panelPx', () =>
    // The splitter is 6px wide (styles/splitter.css.ts): the core default
    resolvePanelWidth({ view: I.viewOverride(), panel: g.config().panel, userWidth: I.panelW(), hostWidth: I.mainW() }),
  );
  const splitter = node(
    'splitter',
    () =>
      splitterValue({ view: I.viewOverride(), panel: g.config().panel, userWidth: I.panelW(), hostWidth: I.mainW() }),
    { equals: (a, b) => a.now === b.now && a.min === b.min && a.max === b.max },
  );
  const headerHeight = node('headerHeight', () => g.timeline().headerHeight);
  const totalHeight = node('totalHeight', () => g.visibleRows().length * g.config().rowHeight);
  const mountedGeometries = node('mountedGeometries', () => {
    const geos = g.geometries();
    const out: RowGeometry[] = [];
    for (const i of virtualIndexes(g.vWindow(), geos.length)) {
      const geo = geos[i];
      if (geo) out.push(geo);
    }
    return out;
  });
  const windowSpan = node(
    'windowSpan',
    (): WindowSpan => {
      const { first, last } = g.vWindow();
      const rh = g.config().rowHeight;
      return { top: first * rh, bottom: (last + 1) * rh };
    },
    { equals: (a, b) => a.top === b.top && a.bottom === b.bottom },
  );
  return { panelPx, splitter, headerHeight, totalHeight, mountedGeometries, windowSpan };
}
