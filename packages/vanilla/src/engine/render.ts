/**
 * @file render.ts
 * The region effects. Each region of the element is painted by one layer (`layers/*.ts`) inside
 * its own effect, queued on the per-element frame scheduler and flushed once per frame in this
 * order:
 *
 *   host → toolbar → legend → header → static → rows → hover → bars → arrows → overlay
 *        → readout → tasklist → states → scroll-commands → focus-restore → lazy-load
 *
 * A region re-runs only when a signal its layer read changed: a vertical scroll re-runs the
 * windowed regions (rows, bars, arrows, overlay, task list), not the toolbar, legend, header or
 * static layer; a horizontal scroll re-runs header and static only when it crosses a 256 px
 * chunk of the horizontal window; a selection re-runs rows, bars and the task list only. Every
 * run is counted in `runs` (tests and the perf page read it).
 *
 * `readout` (the drag readout chip, after the canvas overlay) and `states` (the loading, error
 * and empty boxes over the chart body, after the task list) paint the Phase 9 chrome; `hover`
 * (the hovered row's tint, right after the row backgrounds) the Phase 10 row hover.
 *
 * Besides the regions, `Layers` holds the parts driven from outside the flush: the tooltip
 * (pointer and focus events), the sync-group link (`layers/sync.ts`: the connection's sync effect,
 * `setState()`, the splitter) and the narrow-width switch (`layers/responsive.ts`: the
 * ResizeObserver, `options`, `setView()`).
 */

import { effect, type FrameScheduler } from '../reactive';
import type { Layer, LayerContext } from '../layers/context';
import { createHostLayer, type HostLayer } from '../layers/host';
import { createToolbarLayer } from '../layers/toolbar';
import { createLegendLayer } from '../layers/legend';
import { createHeaderLayer } from '../layers/header';
import { createStaticLayer } from '../layers/static';
import { createRowsLayer } from '../layers/rows';
import { createHoverLayer } from '../layers/hover';
import { createBarsLayer } from '../layers/bars';
import { createArrowsLayer } from '../layers/arrows';
import { createOverlayLayer } from '../layers/overlay';
import { createReadoutLayer } from '../layers/readout';
import { createTasklistLayer } from '../layers/tasklist';
import { createStatesLayer } from '../layers/states';
import { createScrollCommandsLayer, type ScrollCommands } from '../layers/scroll-commands';
import { createFocusRestoreLayer } from '../layers/focus-restore';
import { createLazyLoadLayer } from '../layers/lazy-load';
import { createTooltipLayer, type TooltipLayer } from '../layers/tooltip';
import { createSyncLayer, type SyncLayer } from '../layers/sync';
import { createResponsiveLayer, type ResponsiveLayer } from '../layers/responsive';
import type { Runs } from './graph/node';

/** Flush order of the frame scheduler: one priority per region. */
export const REGIONS = [
  'host',
  'toolbar',
  'legend',
  'header',
  'static',
  'rows',
  'hover',
  'bars',
  'arrows',
  'overlay',
  'readout',
  'tasklist',
  'states',
  'scroll-commands',
  'focus-restore',
  'lazy-load',
] as const;
export type Region = (typeof REGIONS)[number];

/** Every region's layer, plus the tooltip, the sync-group link and the narrow-width switch (outside the flush). */
export type Layers = { readonly [R in Exclude<Region, 'host' | 'scroll-commands'>]: Layer } & {
  readonly host: HostLayer;
  readonly 'scroll-commands': ScrollCommands;
  readonly tooltip: TooltipLayer;
  readonly sync: SyncLayer;
  readonly responsive: ResponsiveLayer;
};

/** Builds every layer (once per element). */
export function createLayers(ctx: LayerContext): Layers {
  return {
    host: createHostLayer(ctx),
    toolbar: createToolbarLayer(ctx),
    legend: createLegendLayer(ctx),
    header: createHeaderLayer(ctx),
    static: createStaticLayer(ctx),
    rows: createRowsLayer(ctx),
    hover: createHoverLayer(ctx),
    bars: createBarsLayer(ctx),
    arrows: createArrowsLayer(ctx),
    overlay: createOverlayLayer(ctx),
    readout: createReadoutLayer(ctx),
    tasklist: createTasklistLayer(ctx),
    states: createStatesLayer(ctx),
    'scroll-commands': createScrollCommandsLayer(ctx),
    'focus-restore': createFocusRestoreLayer(ctx),
    'lazy-load': createLazyLoadLayer(ctx),
    tooltip: createTooltipLayer(ctx),
    sync: createSyncLayer(ctx),
    responsive: createResponsiveLayer(ctx),
  };
}

/**
 * Creates the region effects on `frame` (call inside the connection's owner: disconnecting
 * disposes them). Their first runs happen in the first flush, in region order.
 */
export function registerRegions(layers: Layers, frame: FrameScheduler<Region>, runs: Runs): void {
  // A failed region is reported once per error (a throwing node rethrows the same error to every reader)
  const reported = new WeakSet<object>();
  const report = (region: Region, err: unknown): void => {
    if (typeof err === 'object' && err !== null) {
      if (reported.has(err)) return;
      reported.add(err);
    }
    console.error(`[gantry] render error (${region}):`, err);
  };
  const scroll = layers['scroll-commands'];
  // Before any region writes the DOM: the scroll offset the zoom anchor is computed from
  effect(
    () => {
      try {
        scroll.captureAnchor();
      } catch {
        // invalid options: the regions report it
      }
    },
    { scheduler: run => frame.schedule(run, 'host') },
  );
  for (const region of REGIONS) {
    const layer = layers[region];
    effect(
      () => {
        runs[region] = (runs[region] ?? 0) + 1;
        try {
          layer.paint();
        } catch (err) {
          report(region, err);
        }
      },
      { scheduler: run => frame.schedule(run, region) },
    );
  }
}

/** The element left the document: every layer cancels its pending work. */
export function disconnectLayers(layers: Layers): void {
  for (const region of REGIONS) layers[region].disconnect?.();
  layers.tooltip.hide();
}
