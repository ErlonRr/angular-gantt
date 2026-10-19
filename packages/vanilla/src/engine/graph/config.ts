/**
 * @file config.ts
 * The resolved config. It depends on the options, the zoom level, the locale and the bar radius
 * only — not on the clock, the tasks or the theme colours — so it stays the same object across
 * clock ticks, drag ends and colour changes.
 *
 * Also the chart's "now" for everything but the today line: `nowDay`, the clock quantised to the
 * bottom scale's day / hour (core `quantizeNow`), which the timeline, the rollup statuses and the
 * style rules read, so the minute clock rebuilds them only when the day / hour changes.
 */

import { bottomScale, quantizeNow, resolveConfig, type ResolvedGanttConfig } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { NodeFactory } from './node';

export interface ConfigGraph {
  readonly config: ReadonlySignal<ResolvedGanttConfig>;
  /** Zoom level shown: `viewModeOverride`, or the fallback when `zoomLevels` has no such level */
  readonly viewMode: ReadonlySignal<string>;
  /** `nowTick` quantised to the bottom scale's day / hour (changes once per day or hour) */
  readonly nowDay: ReadonlySignal<Date>;
}

export function configGraph(I: Inputs, chrome: ChromeGraph, node: NodeFactory): ConfigGraph {
  // Only the radius of the theme metrics enters the config
  const barRadius = node('barRadius', () => chrome.metrics().barRadius);
  const config = node('config', () =>
    resolveConfig({ ...I.optionsIn(), viewMode: I.viewModeOverride() }, chrome.i18n(), { barRadius: barRadius() }),
  );
  const viewMode = node('viewMode', () => config().level.name);
  const unit = node('scaleUnit', () => bottomScale(config().scales).unit);
  const nowDay = node('nowDay', () => quantizeNow(I.nowTick(), unit()), {
    equals: (a, b) => a.getTime() === b.getTime(),
  });
  return { config, viewMode, nowDay };
}
