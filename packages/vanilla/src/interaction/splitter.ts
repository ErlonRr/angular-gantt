/**
 * @file splitter.ts
 * The splitter between the task list and the timeline: drag (pointer capture) or Arrow keys to
 * resize the panel, the toggle button or Enter / Space to collapse it. Widths come from the
 * engine (`mainW` measured by the ResizeObserver, `graph.panelPx`); the panel width the user
 * chooses goes to the `panelW` input.
 */

import { availablePanelWidth, clampPanelWidth, SPLITTER_KEY_STEP } from '@gantry/core';
import type { LayerContext } from '../layers/context';

export interface SplitterOptions {
  /** Whether a model was painted (no resizing before the first render) */
  readonly hasRendered: () => boolean;
  /** Aborted when the element disconnects: removes the listeners and ends a drag in progress */
  readonly signal: AbortSignal;
}

export function bindSplitter(ctx: LayerContext, opts: SplitterOptions): void {
  const { inputs: I, graph: G, dom, host } = ctx;
  const { splitter, toggle, main } = dom;
  const { signal } = opts;
  toggle.addEventListener('pointerdown', e => e.stopPropagation(), { signal });
  toggle.addEventListener('click', () => host.togglePanel(), { signal });

  splitter.addEventListener(
    'pointerdown',
    e => {
      const cfg = G.config.peek();
      if (e.button !== 0 || !opts.hasRendered() || !cfg.panel.resizable || I.viewOverride.peek() !== 'split') return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = G.panelPx.peek();
      const available = availablePanelWidth(I.mainW.peek());
      main.classList.add('is-resizing');
      try {
        splitter.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic event */
      }
      const move = (ev: PointerEvent) => {
        I.panelW.set(clampPanelWidth(startW + ev.clientX - startX, cfg.panel, available));
      };
      // The gesture's listeners go when it ends: released, cancelled or the element disconnected
      // (the width reached so far is kept and saved)
      const gesture = new AbortController();
      const end = () => {
        gesture.abort();
        main.classList.remove('is-resizing');
        ctx.saveState();
      };
      const once = { signal: gesture.signal };
      splitter.addEventListener('pointermove', move, once);
      splitter.addEventListener('pointerup', end, once);
      splitter.addEventListener('pointercancel', end, once);
      signal.addEventListener('abort', end, once);
    },
    { signal },
  );

  splitter.addEventListener(
    'keydown',
    e => {
      if (!opts.hasRendered()) return;
      const cfg = G.config.peek();
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        host.togglePanel();
      } else if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        I.viewOverride.peek() === 'split' &&
        cfg.panel.resizable
      ) {
        e.preventDefault();
        const available = availablePanelWidth(I.mainW.peek());
        const step = e.key === 'ArrowLeft' ? -SPLITTER_KEY_STEP : SPLITTER_KEY_STEP;
        I.panelW.set(clampPanelWidth(G.panelPx.peek() + step, cfg.panel, available));
        ctx.saveState();
      }
    },
    { signal },
  );
}
