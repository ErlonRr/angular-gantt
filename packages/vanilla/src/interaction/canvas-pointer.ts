/**
 * @file canvas-pointer.ts
 * Pointer interaction on the timeline canvas: pressing a bar (drag, resize, tap), hovering it
 * (cursor, grips, tooltip) and its row (the row tint), clicking and double-clicking a row; it also
 * binds the zoom gestures (`interaction/zoom.ts`) and the touch guard.
 *
 * Bars are hit by geometry, like Angular: the row under the pointer's `y`, then core `hitTestBar`
 * on that row's visual in canvas coordinates (the handles first, then the bar's hit box), so
 * custom bars hit the same way and the hover, the cursor and a press agree.
 *
 * - **Press** (D13, `interaction/gestures.ts`): a mouse drags once it has moved 3 px, a touch or
 *   pen once held still for 350 ms; moving a touch earlier lets the browser pan. A drag dismisses
 *   the tooltip, follows the pointer in content coordinates (client x plus the scroll since the
 *   press) and auto-scrolls near the viewport's edges (`interaction/autoscroll.ts`); the touch
 *   guard keeps the browser from panning meanwhile. A tap (touch / pen, no drag) toggles the bar's
 *   tooltip; a click selects through the `click` event. `pointercancel` and Escape cancel.
 * - **Focus**: a mouse press on a bar (one that can be dragged or not) prevents the native focus
 *   and text selection and focuses that bar itself, without scrolling (Escape then cancels its
 *   drag, the arrow keys move from it); a touch or pen press focuses the bar once it drags. The
 *   modality stays the pointer's (`interaction/keyboard.ts`): no focus ring, no focus tooltip
 *   until a key is pressed.
 * - **Hover** (mouse and pen): the bar under the pointer is `hoveredBarId` (its grips show), its
 *   tooltip opens (`tooltip.hover`); off the bars, `tooltip.unhover()`. The row under the pointer
 *   (core `rowIndexAtY`) is `hoveredRowId` (the row tint of both panes, `layers/hover.ts`). The
 *   cursor is a `data-cursor` attribute styled by the stylesheet (`styles/gestures.css.ts`):
 *   `ew-resize` on the handles and `grab` on the body of a bar that can be dragged; `grabbing` /
 *   `ew-resize` while dragging (the same cursors as Angular). Leaving the canvas, a drag starting
 *   and a scroll of either pane (the content moves under the pointer) clear the hovered bar, its
 *   grips, the hovered row and the cursor, until the pointer moves again.
 *
 * Handlers may read layout (they run outside the flush). The canvas box is measured once and
 * kept until something can move it — a scroll (of the viewport or the page), a resize, the
 * pointer entering the canvas, a press, or a change of the panes' measured sizes — so a hover
 * does not cost a layout read per `pointermove`.
 */

import {
  gestureKind,
  hitTestBar,
  rowIndexAtY,
  type BarHit,
  type GanttFlatRow,
  type GestureState,
  type RowGeometry,
} from '@gantryjs/core';
import { setAttr } from '../dom/patch';
import type { LayerContext } from '../layers/context';
import type { TooltipLayer } from '../layers/tooltip';
import { createAutoScroll, type AutoScroll } from './autoscroll';
import { bindTouchGuard, trackPress, type Press } from './gestures';
import { scrollToX } from './scroll';
import { bindZoomGestures } from './zoom';

export interface CanvasPointerOptions {
  readonly tooltip: TooltipLayer;
  /** Whether a model was painted (no tooltip before the first render) */
  readonly hasRendered: () => boolean;
  /** Aborted when the element disconnects: removes the listeners */
  readonly signal: AbortSignal;
}

/** The bar under the pointer and the part hit. */
interface BarPointerHit {
  readonly geo: RowGeometry;
  readonly part: BarHit;
  /** Drag is on and the task may be dragged */
  readonly draggable: boolean;
}

type Cursor = 'grab' | 'grabbing' | 'ew-resize' | null;

/** The hover cursor of a hit (Angular's `hoverCursor`). */
const hoverCursor = (hit: BarPointerHit | null): Cursor =>
  !hit?.draggable ? null : hit.part === 'bar' ? 'grab' : 'ew-resize';

export function bindCanvasPointer(ctx: LayerContext, opts: CanvasPointerOptions): void {
  const { inputs: I, graph: G, dom, drag } = ctx;
  const { tooltip, signal } = opts;
  const canvas = dom.canvasContainer;
  const viewport = dom.viewport;
  const on = <K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
    options: AddEventListenerOptions = {},
  ): void => canvas.addEventListener(type, listener, { ...options, signal });

  // ── Canvas coordinates ─────────────────────────────────────
  let box: { left: number; top: number } | null = null;
  let boxKey = '';
  /** The panes' measured sizes and the view: when they change, the canvas may have moved */
  const layoutKey = (): string =>
    `${I.mainW.peek()} ${I.canvasW.peek()} ${I.canvasH.peek()} ${I.headerH.peek()} ${I.panelW.peek()} ${I.viewOverride.peek()}`;
  const invalidate = (): void => {
    box = null;
  };
  /** Client → canvas coordinates */
  const point = (clientX: number, clientY: number): { x: number; y: number } => {
    const key = layoutKey();
    if (!box || key !== boxKey) {
      const r = canvas.getBoundingClientRect();
      box = { left: r.left, top: r.top };
      boxKey = key;
    }
    return { x: clientX - box.left, y: clientY - box.top };
  };
  // The page scrolling or resizing moves the canvas too (removed by hand: some DOMs don't tie a
  // window listener to an abort signal)
  const view = canvas.ownerDocument.defaultView;
  if (view) {
    view.addEventListener('scroll', invalidate, { passive: true, capture: true });
    view.addEventListener('resize', invalidate, { passive: true });
    signal.addEventListener('abort', () => {
      view.removeEventListener('scroll', invalidate, { capture: true });
      view.removeEventListener('resize', invalidate);
    });
  }
  on('pointerenter', invalidate);

  /**
   * Row geometry under a canvas-relative `y` (core `rowIndexAtY`; none while the options are
   * invalid: the render reports them)
   */
  const geoAt = (y: number): RowGeometry | undefined => {
    try {
      const geos = G.geometries.peek();
      const i = rowIndexAtY(y, G.config.peek().rowHeight, geos.length);
      return i === null ? undefined : geos[i];
    } catch {
      return undefined;
    }
  };

  /** The bar of `geo` at canvas `x` / `y` and the part hit (core `hitTestBar`), `null` off it. */
  const hitOf = (geo: RowGeometry | undefined, x: number, y: number): BarPointerHit | null => {
    if (!geo) return null;
    const part = hitTestBar(G.barVisual.peek()(geo), x, y);
    if (!part) return null;
    return { geo, part, draggable: I.enableDrag.peek() && geo.row.task.draggable !== false };
  };
  /** The bar under a client position and the part hit, `null` off the bars. */
  const hitAt = (clientX: number, clientY: number): BarPointerHit | null => {
    const { x, y } = point(clientX, clientY);
    return hitOf(geoAt(y), x, y);
  };

  /** The bar (`[data-task-id]` in the bars layer) an event target belongs to: the tooltip's anchor */
  const barAt = (target: EventTarget | null): Element | null => {
    const el = (target as Element | null)?.closest?.('[data-task-id]') ?? null;
    return el && dom.bars.contains(el) ? el : null;
  };
  const rowOf = (bar: Element | null): GanttFlatRow | undefined =>
    bar ? G.geoById.peek().get(bar.getAttribute('data-task-id')!)?.row : undefined;

  /** The painted bar of `id` (a tap in a handle's reach, outside the bar's own shapes) */
  const barById = (id: string): Element | null => {
    for (const child of dom.bars.children) if (child.getAttribute('data-task-id') === id) return child;
    return null;
  };

  const setCursor = (cursor: Cursor): void => setAttr(canvas, 'data-cursor', cursor);
  const setHovered = (id: string | null): void => {
    if (I.hoveredBarId.peek() !== id) I.hoveredBarId.set(id);
  };
  const setHoveredRow = (id: string | null): void => {
    if (I.hoveredRowId.peek() !== id) I.hoveredRowId.set(id);
  };
  /**
   * Cursor, grips and row tint for a fine pointer at a client position (geometry: the handles
   * reach past the bar).
   */
  const hoverAt = (clientX: number, clientY: number): void => {
    const { x, y } = point(clientX, clientY);
    const geo = geoAt(y);
    const hit = hitOf(geo, x, y);
    setCursor(hoverCursor(hit));
    setHovered(hit?.geo.row.task.id ?? null);
    setHoveredRow(geo?.row.task.id ?? null);
  };
  /** Nothing is hovered any more: cursor, grips and row tint go (the tooltip has its own rules). */
  const unhover = (): void => {
    setCursor(null);
    setHovered(null);
    setHoveredRow(null);
  };

  /** The painted bar of `id` takes keyboard focus, without scrolling (a press on it). */
  const focusBar = (id: string): void => {
    (barById(id) as HTMLElement | SVGElement | null)?.focus({ preventScroll: true });
  };

  // ── Press: drag, resize, tap ───────────────────────────────
  /** The press in progress: its bar, and its auto-scroll once it drags */
  let current: { press: Press; auto: AutoScroll | null } | null = null;
  /** `scrollLeft` of the viewport when the press started: content x = client x + the scroll since */
  let scroll0 = 0;
  const contentX = (clientX: number): number => clientX + viewport.scrollLeft - scroll0;
  const maxLeft = (): number => G.timeline.peek().totalWidth - I.canvasW.peek();
  const dragging = (): boolean => drag.state.peek().kind !== 'idle';

  const endPress = (): void => {
    current?.auto?.stop();
    current = null;
  };

  /** A press became a drag: the tooltip and the grips step aside, the bar follows the pointer. */
  const dragStart = (hit: BarPointerHit, g: GestureState): void => {
    if (!current) return;
    tooltip.dismiss();
    setHovered(null);
    setHoveredRow(null);
    setCursor(hit.part === 'bar' ? 'grabbing' : 'ew-resize');
    // A touch or pen drag focuses its bar too (a mouse press already did): Escape cancels it there
    if (g.kind === 'touch') focusBar(hit.geo.row.task.id);
    drag.start(hit.geo, hit.part, g.startX);
    let lastX = g.x;
    const auto = createAutoScroll({
      scroller: viewport,
      maxLeft,
      scrollTo: left => scrollToX(viewport, left, 'instant', { inputs: I, maxLeft: maxLeft() }),
      // The viewport scrolled under a still pointer: the bar moves by as much
      onScroll: () => drag.move(contentX(lastX)),
    });
    current.auto = auto;
    const follow = (next: GestureState): void => {
      lastX = next.x;
      drag.move(contentX(next.x));
      auto.update(next.x);
    };
    follow(g);
    dragMove = follow;
  };
  /** Follows the pointer while dragging (set by `dragStart`) */
  let dragMove: (g: GestureState) => void = () => {};

  on('pointerdown', e => {
    // The previous press's trailing click has been dispatched by now (or never comes: a touch drag)
    drag.lastDragMoved = false;
    if (current) {
      // A second pointer (a pinch, another finger): an undecided press gives way; a drag goes on
      if (current.press.pointerId !== e.pointerId && !dragging()) current.press.cancel();
      return;
    }
    if (e.button !== 0) return;
    invalidate();
    const hit = hitAt(e.clientX, e.clientY);
    if (!hit) return;
    const mouse = gestureKind(e.pointerType) === 'mouse';
    if (mouse) {
      // No text selection or native focus: the pressed bar takes keyboard focus itself, without
      // scrolling (Escape cancels its drag); the modality stays the pointer's (no focus ring)
      e.preventDefault();
      focusBar(hit.geo.row.task.id);
      // A bar that can't be dragged: the press is a plain click (touch and pen may still tap)
      if (!hit.draggable) return;
    }
    scroll0 = viewport.scrollLeft;
    const target = e.target;
    const press = trackPress(e, {
      target: canvas,
      // Escape cancels the press wherever focus is (the pressed bar has it), before anything else
      keyTarget: view ?? ctx.host,
      draggable: hit.draggable,
      signal,
      onDragStart: g => dragStart(hit, g),
      onDragMove: g => {
        // The keyboard shortcuts cancelled the drag (Escape): the press is over too
        if (!dragging()) current?.press.cancel();
        else dragMove(g);
      },
      onEnd: (result, g) => {
        endPress();
        dragMove = () => {};
        if (result === 'drop') drag.drop(contentX(g.x));
        else if (result === 'tap' && I.tooltipEnabled.peek() && opts.hasRendered()) {
          const bar = barAt(target) ?? barById(hit.geo.row.task.id);
          if (bar) tooltip.tap(hit.geo.row, bar);
        }
        // A mouse or pen hovers again where it was released (the bar may have moved under it)
        if (e.pointerType !== 'touch') hoverAt(g.x, g.y);
        else setCursor(null);
      },
      onCancel: () => {
        endPress();
        dragMove = () => {};
        drag.cancel();
        setCursor(null);
      },
    });
    current = { press, auto: null };
  });

  // A second finger anywhere on the timeline starts a pinch: an undecided press gives way
  viewport.addEventListener(
    'touchstart',
    e => {
      if (current && e.touches.length > 1 && !dragging()) current.press.cancel();
    },
    { passive: true, signal },
  );
  // While a touch drags a bar the browser must not pan
  bindTouchGuard(canvas, dragging, signal);
  bindZoomGestures(ctx, signal);

  // ── Click, double-click ────────────────────────────────────
  on('click', e => {
    if (drag.lastDragMoved) {
      drag.lastDragMoved = false;
      return;
    }
    const row = geoAt(point(e.clientX, e.clientY).y)?.row;
    if (row) ctx.rowClick(row, e);
  });

  on('dblclick', e => {
    const row = geoAt(point(e.clientX, e.clientY).y)?.row;
    if (row) ctx.emit('row-dblclick', row);
  });

  // ── Hover (mouse and pen) ──────────────────────────────────
  on(
    'pointermove',
    e => {
      if (current || e.pointerType === 'touch' || dragging()) return;
      hoverAt(e.clientX, e.clientY);
      if (!I.tooltipEnabled.peek()) return;
      // The tooltip follows the painted bar under the pointer (like Angular's delegated hover)
      const bar = barAt(e.target);
      const row = rowOf(bar);
      if (bar && row && opts.hasRendered()) tooltip.hover(row, bar, e.clientX);
      else tooltip.unhover();
    },
    { passive: true },
  );

  // A scroll of either pane moves the content under a still pointer: the canvas box is measured
  // again, and what was hovered is cleared (unless a press is in progress: a drag keeps its cursor)
  const onContentScroll = (): void => {
    invalidate();
    if (!current) unhover();
  };
  viewport.addEventListener('scroll', onContentScroll, { passive: true, signal });
  dom.panel.addEventListener('scroll', onContentScroll, { passive: true, signal });
  // Disconnected: no hover survives (a chart moved in the page is hovered again by the next move)
  signal.addEventListener(
    'abort',
    () => {
      setHovered(null);
      setHoveredRow(null);
    },
    { once: true },
  );

  on('pointerleave', e => {
    // A finger lifting is not the pointer leaving (a tapped tooltip stays), nor is a press in progress
    if (e.pointerType === 'touch' || current) return;
    invalidate();
    unhover();
    tooltip.unhover();
  });
}
