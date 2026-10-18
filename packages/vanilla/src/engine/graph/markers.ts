/**
 * @file markers.ts
 * The marker lane under the header tiers (core `computeMarkerLane`, D12): a "Today" marker and
 * one marker per annotation, with their labels, shown while `options.markers.lane` is `true`, or
 * `'auto'` (the default) with at least one labelled annotation.
 *
 * Two nodes, so the clock does not reach the layout: `laneHeight` depends on the config and the
 * annotations only (it decides the header height, `graph/layout.ts`), `markerLane` also follows
 * the today line (it moves every minute) and is what the header region paints.
 */

import { computeMarkerLane, markerLaneShown, MARKER_LANE_HEIGHT, type MarkerLane } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';
import type { TimelineGraph } from './timeline';

export interface MarkersGraph {
  /** Height of the marker lane: `MARKER_LANE_HEIGHT` while it is shown, else 0 */
  readonly laneHeight: ReadonlySignal<number>;
  /** The lane's markers and labels (`height` 0 and no markers while it is hidden) */
  readonly markerLane: ReadonlySignal<MarkerLane>;
}

export function markersGraph(I: Inputs, g: ChromeGraph & ConfigGraph & TimelineGraph, node: NodeFactory): MarkersGraph {
  const laneHeight = node('laneHeight', () =>
    markerLaneShown(g.config(), I.annotationsIn(), I.viewOverride()) ? MARKER_LANE_HEIGHT : 0,
  );
  const markerLane = node('markerLane', () =>
    computeMarkerLane({
      config: g.config(),
      timeline: g.timeline(),
      annotations: I.annotationsIn(),
      todayX: g.todayX(),
      labels: g.i18n().labels,
      fontPx: g.metrics().fontPx,
      view: I.viewOverride(),
    }),
  );
  return { laneHeight, markerLane };
}
