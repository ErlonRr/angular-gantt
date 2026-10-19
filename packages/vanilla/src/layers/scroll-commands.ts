/**
 * @file scroll-commands.ts
 * Scroll-commands region, after every painting region: scrolls the timeline for the model just
 * painted. A requested scroll (`scrollToDate`, `scrollToTask` made before the model was painted)
 * wins; then a scroll the sync group sent; otherwise the first render with data applies
 * `initialScroll`; otherwise a new timeline keeps its place (core `anchoredScrollLeft`): a zoom
 * keeps the date under the zoom anchor — the pointer's x for a Ctrl/⌘ + wheel or pinch zoom
 * (`zoomAnchor`, written with the zoom by `interaction/zoom.ts`), the viewport's centre otherwise
 * — and a new range start keeps the date at the left edge.
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
 *
 * Inside a sync group (`layers/sync.ts`, the viewport's `ViewportSync` from `interaction/scroll.ts`):
 * - the group's scroll is applied here, after the paint of the timeline the same patch brought
 *   (a level, a shared range), as an instant jump; it replaces `initialScroll` when it arrives
 *   first (on joining a group that has a scroll), and waits while the table view hides the
 *   timeline. Its scroll event is an echo: the guard expects the offset read back from the
 *   viewport (the browser clamps it to this chart's scroll range), so a chart that cannot scroll
 *   as far does not push the others back;
 * - the zoom anchoring after a level the group applied is not reported either (its scroll event is
 *   an echo): each chart would keep its own centre, so the chart that zoomed reports its anchored
 *   scroll and the others apply it;
 * - a start correction (a new shared or own range start, same scale) is reported like any scroll:
 *   every chart keeps the same date at the left edge, so their reports agree (the first one the
 *   group hears wins, the others wait for it, `interaction/scroll.ts`), and the group's scroll
 *   stays measured from the shared start — a chart that joins later, or whose earlier tasks moved
 *   the start, opens at the others' date. Except at the chart's scroll limit: a chart that cannot
 *   scroll as far would pull the others back, so that correction is an echo too;
 * - an echo jump reads `scrollLeft` before and after it (the guard needs the offset the browser
 *   kept): once per group scroll or quiet correction, never on the chart's own scrolls.
 */

import {
  anchoredScrollLeft,
  clampScroll,
  initialScrollLeft,
  type RowGeometry,
  type TimelineModel,
} from '@gantryjs/core';
import { scrollToX, viewportSync } from '../interaction/scroll';
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
  const group = viewportSync(dom.viewport);
  let rendered: { timeline: TimelineModel; geometries: RowGeometry[] } | undefined;
  let initialScrollDone = false;
  let pending: (() => void) | undefined;
  /** Timeline the canvas was last painted with: anchors the scroll when it changes */
  let painted: TimelineModel | undefined;
  let anchorLeft = 0;

  const sync = (tl: TimelineModel) => ({ inputs: I, maxLeft: tl.totalWidth - I.canvasW.peek() });

  /** An instant jump whose scroll event is the group's echo, not the chart's move (see the file comment). */
  const groupJump = (tl: TimelineModel, x: number): void => {
    const viewport = dom.viewport;
    const from = viewport.scrollLeft;
    scrollToX(viewport, x, 'instant', sync(tl));
    group.guard.expect(viewport.scrollLeft, from);
  };

  /**
   * Whether the anchoring correction to `x` (from `prev` to `tl`) stays out of the group: the zoom
   * anchoring after a level the group applied, or a start correction that ends at the chart's
   * scroll limit (see the file comment).
   */
  const quietCorrection = (prev: TimelineModel, tl: TimelineModel, x: number, groupLevel: boolean): boolean =>
    prev.pxPerDay !== tl.pxPerDay ? groupLevel : x >= clampScroll(Number.POSITIVE_INFINITY, tl, I.canvasW.peek());

  /** Keep the date under the zoom anchor (zoom) or at the left edge (new range start) in place. */
  const keepAnchor = (tl: TimelineModel, groupLevel: boolean): void => {
    if (!painted) return;
    const x = anchoredScrollLeft(painted, tl, anchorLeft, I.canvasW.peek(), I.zoomAnchor.peek());
    if (x === null) return;
    if (group.report !== null && quietCorrection(painted, tl, x, groupLevel)) groupJump(tl, x);
    else scrollToX(dom.viewport, x, 'instant', sync(tl));
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
      // The group's scroll (a tracked read: the region runs when one arrives)
      const groupX = group.waiting();
      // A level the group applied concerns the timeline painted now only (a plain flag, not a signal)
      const groupLevel = group.groupLevel;
      group.groupLevel = false;
      rendered = { timeline: tl, geometries };

      if (pending) {
        const scroll = pending;
        pending = undefined;
        initialScrollDone = true;
        // The chart's own scroll replaces a group scroll waiting for this paint (and is reported)
        group.consume();
        scroll();
      } else if (groupX !== null && view !== 'table') {
        group.consume();
        initialScrollDone = true;
        groupJump(tl, groupX);
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
        keepAnchor(tl, groupLevel);
      }
      if (view !== 'table') {
        if (painted !== tl) releaseAnchor();
        painted = tl;
      }
    },
  };
}
