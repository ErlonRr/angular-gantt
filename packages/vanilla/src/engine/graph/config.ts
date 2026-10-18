/**
 * @file config.ts
 * The resolved config. It depends on the options, the zoom level, the locale and the bar radius
 * only — not on the clock, the tasks or the theme colours — so it stays the same object across
 * clock ticks, drag ends and colour changes.
 */

import { resolveConfig, type ResolvedGanttConfig } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { NodeFactory } from './node';

export interface ConfigGraph {
  readonly config: ReadonlySignal<ResolvedGanttConfig>;
  /** Zoom level shown: `viewModeOverride`, or the fallback when `zoomLevels` has no such level */
  readonly viewMode: ReadonlySignal<string>;
}

export function configGraph(I: Inputs, chrome: ChromeGraph, node: NodeFactory): ConfigGraph {
  // Only the radius of the theme metrics enters the config
  const barRadius = node('barRadius', () => chrome.metrics().barRadius);
  const config = node('config', () =>
    resolveConfig({ ...I.optionsIn(), viewMode: I.viewModeOverride() }, chrome.i18n(), { barRadius: barRadius() }),
  );
  const viewMode = node('viewMode', () => config().level.name);
  return { config, viewMode };
}
