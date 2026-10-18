/**
 * @file scroll-commands.ts
 * Scroll-commands region, after every painting region: scrolls the timeline for the model just
 * painted. A requested scroll (`scrollToDate`, `scrollToTask` made before the model was painted)
 * wins; otherwise the first render with data applies `initialScroll`; otherwise a new timeline
 * keeps its place (core `anchoredScrollLeft`): a zoom keeps the date under the zoom anchor — the
 * pointer's x for a Ctrl/⌘ + wheel or pinch zoom (`zoomAnchor`, written with the zoom by
 * `interaction/zoom.ts`), the viewport's centre otherwise — and a new range start keeps the date
 * at the left edge.
 *
 * Centring needs the viewport width the painted model produces (its scrollbars included), so
 * the initial scroll and a requested scroll read `clientWidth` once, after the painting
 * regions — like the tooltip, a D9 exception: it happens once per command, never on a scroll.
 * The zoom anchoring uses the measured `canvasW`.
 *
 * The anchoring needs the scroll offset in the coordinates of the timeline painted so far:
 * `captureAnchor` reads it at the start of the flush (host priority, before any region writes
 * the DOM), and only when the timeline changed — never on a plain scroll. `zoomAnchor` is read
 * with `peek()` (an anchor alone repaints nothing) and serves one new timeline: once that is
 * painted the anchor is cleared in a microtask, after the flush (a region never writes a signal
 * while painting), so a later zoom from the options or a restored state keeps the centre.
 */

import { anchoredScrollLeft, initialScrollLeft, type RowGeometry, type TimelineModel } from '@gantryjs/core';
import { scrollToX } from '../interaction/scroll';
import type { Layer, LayerContext } from './context';

export interface ScrollCommands extends Layer {
  /** Records `scrollLeft` before the flush changes the DOM (tracks the timeline only). */
  captureAnchor(): void;
  /** At least one model was painted. */
  hasRendered(): boolean;
  /** The current model is not painted yet (scrolls wait for it). */
  isPending(): boolean;
  /** Runs `scroll` now, or right after the current model is painted. */
  request(scroll: () => void): void;
  /** Apply `initialScroll` again on the next render with data (the consumer changed it). */
  resetInitialScroll(): void;
}

export function createScrollCommandsLayer(ctx: LayerContext): ScrollCommands {
  const { inputs: I, graph: G, dom } = ctx;
  let rendered: { timeline: TimelineModel; geometries: RowGeometry[] } | undefined;
  let initialScrollDone = false;
  let pending: (() => void) | undefined;
  /** Timeline the canvas was last painted with: anchors the scroll when it changes */
  let painted: TimelineModel | undefined;
  let anchorLeft = 0;

  const sync = (tl: TimelineModel) => ({ inputs: I, maxLeft: tl.totalWidth - I.canvasW.peek() });

  /** Keep the date under the zoom anchor (zoom) or at the left edge (new range start) in place. */
  const keepAnchor = (tl: TimelineModel): void => {
    if (!painted) return;
    const x = anchoredScrollLeft(painted, tl, anchorLeft, I.canvasW.peek(), I.zoomAnchor.peek());
    if (x !== null) scrollToX(dom.viewport, x, 'instant', sync(tl));
  };
  /** The zoom anchor served the timeline just painted: cleared after the flush */
  const releaseAnchor = (): void => {
    const anchor = I.zoomAnchor.peek();
    if (anchor === null) return;
    queueMicrotask(() => {
      if (I.zoomAnchor.peek() === anchor) I.zoomAnchor.set(null);
    });
  };

  const isPending = (): boolean =>
    !rendered || rendered.timeline !== G.timeline.peek() || rendered.geometries !== G.geometries.peek();

  return {
    captureAnchor() {
      G.timeline();
      anchorLeft = dom.viewport.scrollLeft;
    },
    hasRendered: () => rendered !== undefined,
    isPending,
    request(scroll) {
      if (isPending()) pending = scroll;
      else scroll();
    },
    resetInitialScroll() {
      initialScrollDone = false;
    },
    paint() {
      const tl = G.timeline();
      const geometries = G.geometries();
      const rowCount = G.visibleRows().length;
      const view = I.viewOverride();
      const initialScroll = G.config().initialScroll;
      rendered = { timeline: tl, geometries };

      if (pending) {
        const scroll = pending;
        pending = undefined;
        initialScrollDone = true;
        scroll();
      } else if (!initialScrollDone && rowCount && view !== 'table') {
        initialScrollDone = true;
        const left = initialScrollLeft({
          timeline: tl,
          initialScroll,
          viewportWidth: dom.viewport.clientWidth,
          now: I.nowTick.peek(),
        });
        if (left !== null) scrollToX(dom.viewport, left, 'instant', sync(tl));
      } else if (view !== 'table') {
        keepAnchor(tl);
      }
      if (view !== 'table') {
        if (painted !== tl) releaseAnchor();
        painted = tl;
      }
    },
  };
}
