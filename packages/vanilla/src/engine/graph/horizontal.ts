/**
 * @file horizontal.ts
 * Horizontal windowing over the timeline (D10): the pixel range the header and the static layer
 * mount around the viewport, snapped to 256px chunks so a scroll inside a chunk changes nothing,
 * and the header cells, non-working bands and grid lines inside it. While the viewport is not
 * measured (`canvasW` 0) the range is the whole timeline.
 *
 * Owned by step 2.1 (header and static layers); wired into the graph by the engine.
 */

import {
  HORIZONTAL_WINDOW_QUANTUM,
  bandsInRange,
  computeHorizontalWindow,
  linesInRange,
  sameHorizontalWindow,
  tiersInRange,
  type HorizontalWindow,
  type LinesWindow,
  type TierWindow,
  type TimeBand,
} from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { CoreGraph } from '../engine';
import type { Inputs } from '../inputs';
import type { NodeFactory } from './node';

export interface HorizontalGraph {
  /** Mounted pixel range `[x0, x1]` (viewport ± half its width, snapped outwards to 256px) */
  readonly hWindow: ReadonlySignal<HorizontalWindow>;
  /** Header tiers restricted to the cells inside `hWindow` */
  readonly tierWindows: ReadonlySignal<TierWindow[]>;
  /** Non-working bands inside `hWindow`, in painting order */
  readonly bandWindow: ReadonlySignal<TimeBand[]>;
  /** Minor and major grid-line x positions inside `hWindow` */
  readonly lineWindow: ReadonlySignal<LinesWindow>;
}

/** Scroll distance (px) the window snaps to: core's `HORIZONTAL_WINDOW_QUANTUM` (alias kept for the tests). */
export const HORIZONTAL_QUANTUM = HORIZONTAL_WINDOW_QUANTUM;

export function horizontalGraph(I: Inputs, g: CoreGraph, node: NodeFactory): HorizontalGraph {
  const hWindow = node(
    'hWindow',
    () =>
      computeHorizontalWindow({
        scrollLeft: I.scrollLeft(),
        viewportWidth: I.canvasW(),
        totalWidth: g.timeline().totalWidth,
        quantum: HORIZONTAL_WINDOW_QUANTUM,
      }),
    { equals: sameHorizontalWindow },
  );
  const tierWindows = node('tierWindows', () => {
    const { x0, x1 } = hWindow();
    return tiersInRange(g.timeline(), x0, x1);
  });
  const bandWindow = node('bandWindow', () => {
    const { x0, x1 } = hWindow();
    return bandsInRange(g.timeline(), x0, x1);
  });
  const lineWindow = node('lineWindow', () => {
    const { x0, x1 } = hWindow();
    return linesInRange(g.timeline(), x0, x1);
  });
  return { hWindow, tierWindows, bandWindow, lineWindow };
}
