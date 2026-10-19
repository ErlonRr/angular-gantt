/**
 * @file timeline.ts
 * Timeline nodes. The timeline is built from a quantised "now" (`nowDay`, `graph/config.ts`: the
 * local day, or the local hour on hour scales), so the minute clock rebuilds it only when the day /
 * hour changes; the today line is placed for the exact tick by `todayX`.
 *
 * Inside a sync group the timeline covers the group's shared range too (`inputs.shared`, written by
 * `layers/sync.ts`): charts with the same start and px per day place every date at the same x. A
 * member reports its natural range (`naturalRange`, core `timelineRange`: its own tasks, padded and
 * snapped), never the shared timeline it draws, so the group's union has no feedback loop.
 */

import {
  buildTimeline,
  computeRowGeometries,
  timelineRange,
  todayX as todayXOf,
  type NaturalTimelineRange,
  type RowGeometry,
  type TimelineModel,
} from '@gantryjs/core';
import { computed, type ReadonlySignal } from '../../reactive';
import { structuralEqual, type Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';
import type { RowsGraph } from './rows';

export interface TimelineGraph {
  readonly timeline: ReadonlySignal<TimelineModel>;
  /**
   * The chart's own range and task extent (core `timelineRange`), before the shared range and the
   * viewport fill: what a sync group member reports. Compares dates by value. Lazy: computed only
   * while something reads it (the sync layer inside a group).
   */
  readonly naturalRange: ReadonlySignal<NaturalTimelineRange>;
  /** x of the today line for `nowTick`, or `null` when hidden (`showToday: false`) or out of range */
  readonly todayX: ReadonlySignal<number | null>;
  /** Bar geometry of every visible row */
  readonly geometries: ReadonlySignal<RowGeometry[]>;
  readonly geoById: ReadonlySignal<ReadonlyMap<string, RowGeometry>>;
}

export function timelineGraph(
  I: Inputs,
  chrome: ChromeGraph,
  cfg: ConfigGraph,
  rows: RowsGraph,
  node: NodeFactory,
): TimelineGraph {
  const timeline = node('timeline', () => {
    const config = cfg.config();
    return buildTimeline({
      tasks: rows.tasks(),
      config,
      // Read only for `fitToWidth`: other timelines don't depend on the viewport
      viewportWidth: config.fitToWidth ? I.canvasW() : undefined,
      i18n: chrome.i18n(),
      now: cfg.nowDay(),
      // The sync group's range and extent (`null` outside a group)
      shared: I.shared(),
    });
  });
  const naturalRange = node(
    'naturalRange',
    () => timelineRange({ tasks: rows.tasks(), config: cfg.config(), now: cfg.nowDay() }),
    { equals: structuralEqual },
  );
  const todayX = node('todayX', () => (cfg.config().showToday ? todayXOf(timeline(), I.nowTick()) : null));
  // Geometries and their index in one pass
  const rowGeometry = node('geometries', () => {
    const list = computeRowGeometries(rows.visibleRows(), timeline(), cfg.config());
    return { list, byId: new Map(list.map(g => [g.row.task.id, g])) };
  });
  return {
    timeline,
    naturalRange,
    todayX,
    geometries: computed(() => rowGeometry().list),
    geoById: computed(() => rowGeometry().byId),
  };
}
