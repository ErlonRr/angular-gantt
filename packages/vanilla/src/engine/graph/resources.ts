/**
 * @file resources.ts
 * The resource view's load layer (Phase 14, `options.rows: 'resources'`): the paths each mounted row
 * draws (core `computeLoadVisuals`: the daily load up to the capacity, the part above it, the capacity
 * line) over the horizontal window, and the pixel → day mapping the pointer hit test uses.
 *
 * `loadVisuals` is empty in tasks mode (one shared array, so nothing downstream runs), and depends on
 * the utilization, the mounted rows, the timeline, the horizontal window and the two config values the
 * paths use (`resourceView`, `rowHeight`) only: a selection, a theme colour or a label change rebuilds
 * nothing. The paths are absolute canvas coordinates, so a scroll inside the mounted window keeps them.
 */

import { calendarDays, computeLoadVisuals, type LoadVisual } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { CoreGraph } from '../engine';
import { structuralEqual } from '../inputs';
import type { HorizontalGraph } from './horizontal';
import type { NodeFactory } from './node';

export interface ResourcesGraph {
  /** The fractional epoch day (`calendarDays` units) at a canvas x: the inverse of `timeline.toX` */
  readonly dayOfX: ReadonlySignal<(x: number) => number>;
  /** The load paths of the mounted resource rows, in row order; empty in tasks mode */
  readonly loadVisuals: ReadonlySignal<readonly LoadVisual[]>;
}

/** The load of a chart in tasks mode: one array, so nothing that reads it re-runs. */
const NONE: readonly LoadVisual[] = [];

export function resourcesGraph(g: CoreGraph & HorizontalGraph, node: NodeFactory): ResourcesGraph {
  const dayOfX = node('dayOfX', () => {
    const tl = g.timeline();
    return (x: number): number => calendarDays(tl.toDate(x), false);
  });
  /** What the paths read of the config */
  const loadConfig = node(
    'loadConfig',
    () => {
      const { resourceView, rowHeight } = g.config();
      return { resourceView, rowHeight };
    },
    { equals: structuralEqual },
  );
  const loadVisuals = node('loadVisuals', (): readonly LoadVisual[] => {
    const utilization = g.utilization();
    if (!utilization) return NONE;
    const { x0, x1 } = g.hWindow();
    return computeLoadVisuals({
      geos: g.mountedGeometries(),
      utilization,
      timeline: g.timeline(),
      window: { x0, x1 },
      cfg: loadConfig(),
      dayOfX: dayOfX(),
    });
  });
  return { dayOfX, loadVisuals };
}
