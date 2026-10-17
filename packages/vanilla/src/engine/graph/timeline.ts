/**
 * @file timeline.ts
 * Timeline nodes. The timeline is built from a quantised "now" (`quantizeNow`: the local day, or
 * the local hour on hour scales), so the minute clock rebuilds it only when the day / hour
 * changes; the today line is placed for the exact tick by `todayX`.
 */

import {
  bottomScale,
  buildTimeline,
  computeRowGeometries,
  quantizeNow,
  todayX as todayXOf,
  type RowGeometry,
  type TimelineModel,
} from '@gantry/core';
import { computed, type ReadonlySignal } from '../../reactive';
import type { Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';
import type { RowsGraph } from './rows';

export interface TimelineGraph {
  /** `nowTick` quantised to the bottom scale's day / hour (changes once per day or hour) */
  readonly nowDay: ReadonlySignal<Date>;
  readonly timeline: ReadonlySignal<TimelineModel>;
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
  const unit = node('scaleUnit', () => bottomScale(cfg.config().scales).unit);
  const nowDay = node('nowDay', () => quantizeNow(I.nowTick(), unit()), {
    equals: (a, b) => a.getTime() === b.getTime(),
  });
  const timeline = node('timeline', () => {
    const config = cfg.config();
    return buildTimeline({
      tasks: rows.tasks(),
      config,
      // Read only for `fitToWidth`: other timelines don't depend on the viewport
      viewportWidth: config.fitToWidth ? I.canvasW() : undefined,
      i18n: chrome.i18n(),
      now: nowDay(),
    });
  });
  const todayX = node('todayX', () => (cfg.config().showToday ? todayXOf(timeline(), I.nowTick()) : null));
  // Geometries and their index in one pass
  const rowGeometry = node('geometries', () => {
    const list = computeRowGeometries(rows.visibleRows(), timeline(), cfg.config());
    return { list, byId: new Map(list.map(g => [g.row.task.id, g])) };
  });
  return {
    nowDay,
    timeline,
    todayX,
    geometries: computed(() => rowGeometry().list),
    geoById: computed(() => rowGeometry().byId),
  };
}
