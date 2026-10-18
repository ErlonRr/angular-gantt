/**
 * @file scroll-commands.ts
 * Scroll-commands region, after every painting region: scrolls the timeline for the model just
 * painted. A requested scroll (`scrollToDate`, `scrollToTask` made before the model was painted)
 * wins; otherwise the first render with data applies `initialScroll`; otherwise a new timeline
 * (zoom, new range start) keeps the date under the viewport's centre / left edge in place.
 *
 * Centring needs the viewport width the painted model produces (its scrollbars included), so
 * the initial scroll and a requested scroll read `clientWidth` once, after the painting
 * regions — like the tooltip, a D9 exception: it happens once per command, never on a scroll.
 * The zoom anchor uses the measured `canvasW`.
 *
 * The zoom anchor needs the scroll offset in the coordinates of the timeline painted so far:
 * `captureAnchor` reads it at the start of the flush (host priority, before any region writes
 * the DOM), and only when the timeline changed — never on a plain scroll.
 */

import { initialScrollLeft, zoomAnchorScroll, type RowGeometry, type TimelineModel } from '@gantryjs/core';
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

  /** Keep the date at the viewport centre (zoom) or left edge (new range start) in place. */
  const keepAnchor = (tl: TimelineModel): void => {
    const prev = painted;
    if (!prev || prev === tl) return;
    const zoomed = prev.pxPerDay !== tl.pxPerDay;
    if (!zoomed && prev.start.getTime() === tl.start.getTime()) return;
    const anchorX = zoomed ? I.canvasW.peek() / 2 : 0;
    scrollToX(dom.viewport, zoomAnchorScroll(prev, tl, anchorLeft, anchorX), 'instant', sync(tl));
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
      if (view !== 'table') painted = tl;
    },
  };
}
