/**
 * @file canvas-pointer.ts
 * Pointer interaction on the timeline canvas: pressing a bar (drag, resize, the progress grip, a
 * link connector, tap), hovering it (cursor, overlay shapes, tooltip) and its row (the row tint),
 * clicking (the row's selection, a dependency arrow's) and double-clicking a row; it also binds
 * the zoom gestures (`interaction/zoom.ts`) and the touch guard.
 *
 * Bars are hit by geometry, like Angular: the row under the pointer's `y`, then core `hitTestBar`
 * on that row's visual in canvas coordinates (D11 order: the resize handles, the progress grip,
 * the link connectors, then the bar's hit box), so custom bars hit the same way and the hover, the
 * cursor and a press agree. The progress grip and the connectors (Phase 11, `editing`) are hit
 * only on a bar whose overlay shows them (`shownTargets`: core `computeBarOverlay` of that row,
 * from the inputs the bars layer paints it from — the keyboard-focused bar, the hovered bar with
 * a fine pointer, the selected bars with a coarse one, the bar whose progress is being dragged, a
 * link session's ends), so a press inside a narrow bar that shows nothing still moves it.
 *
 * - **Press** (D13, `interaction/gestures.ts`): a mouse drags once it has moved 3 px, a touch or
 *   pen once held still for 350 ms; moving a touch earlier lets the browser pan. What drags is the
 *   part hit: the body or a resize handle (`drag`, when `editRules(row).move`), the progress grip
 *   (`ctx.progress`: core `ProgressSession`, the live fill and the readout chip follow
 *   `progressPreview`) or a link connector (`ctx.link.start(id, side, 'drag', at)`, then
 *   `link.move()` with the pointer and `link.move()` + `link.finish()` on release, D12). A drag
 *   dismisses the tooltip, follows the pointer in content coordinates (client x plus the scroll
 *   since the press) and auto-scrolls near the viewport's edges (`interaction/autoscroll.ts`); the
 *   touch guard keeps the browser from panning meanwhile. A tap (touch / pen, no drag) toggles the
 *   bar's tooltip; a click selects through the `click` event. `pointercancel` and Escape cancel.
 * - **Click-mode links** (WCAG 2.5.7): a click or tap on a connector arms a link
 *   (`link.start(…, 'click', …)`). While it is armed the pointer moves its preview (`link.move`)
 *   and the next press belongs to it: on a bar it finishes the link there (`link.move` +
 *   `link.finish`), elsewhere it cancels it (announced); a mouse acts on the press, a touch or pen
 *   on its release (a touch that pans keeps the link armed). A press during a keyboard link (L)
 *   has already cancelled it (`keyboard.ts`, capture phase) and goes on as usual. The click that
 *   ends a progress or link gesture selects nothing.
 * - **Click**: with `editing.dependencies.delete` a click first goes to the arrows
 *   (`ctx.link.selectAt`: the arrow under it, bars win; the press has already deselected the last
 *   one unless it was on that very link, so re-clicking it never flickers); a click that selects a
 *   link selects no row. Otherwise it selects the row (`ctx.rowClick`).
 * - **Focus**: a mouse press on a bar (one that can be dragged or not) prevents the native focus
 *   and text selection and focuses that bar itself, without scrolling (Escape then cancels its
 *   drag, the arrow keys move from it); a touch or pen press focuses the bar once it drags. The
 *   modality stays the pointer's (`interaction/keyboard.ts`): no focus ring, no focus tooltip
 *   until a key is pressed.
 * - **Hover** (mouse and pen): the bar under the pointer is `hoveredBarId` (its overlay shapes
 *   show), its tooltip opens (`tooltip.hover`); off the bars, `tooltip.unhover()`. The row under
 *   the pointer (core `rowIndexAtY`) is `hoveredRowId` (the row tint of both panes,
 *   `layers/hover.ts`). The cursor is a `data-cursor` attribute styled by the stylesheet
 *   (`styles/gestures.css.ts`): `ew-resize` on the handles and the progress grip, `grab` on the
 *   body of a bar that can be dragged, `crosshair` on the connectors and while a link is being
 *   made, `pointer` on a deletable arrow (core `arrowAt`, `ARROW_HIT_TOLERANCE`); `grabbing` /
 *   `ew-resize` / `crosshair` while dragging (the same cursors as Angular). Leaving the canvas, a
 *   drag starting and a scroll of either pane (the content moves under the pointer) clear the
 *   hovered bar, its shapes, the hovered row and the cursor, until the pointer moves again.
 *
 * Handlers may read layout (they run outside the flush). The canvas box is measured once and
 * kept until something can move it — a scroll (of the viewport or the page), a resize, the
 * pointer entering the canvas, a press, or a change of the panes' measured sizes — so a hover
 * does not cost a layout read per `pointermove`. During a press, canvas coordinates are the press
 * point plus the pointer's and the scroll's moves (no layout read).
 */

import {
  ARROW_HIT_TOLERANCE,
  arrowAt,
  computeBarOverlay,
  gestureKind,
  hitTestBar,
  rowIndexAtY,
  type BarHit,
  type BarHitTarget,
  type BarVisual,
  type DragHandle,
  type GanttFlatRow,
  type GestureState,
  type LinkSide,
  type RowGeometry,
} from '@gantryjs/core';
import { setAttr } from '../dom/patch';
import { coarsePointer, overlayState } from '../layers/bars';
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
  /**
   * The press may become a drag: on the body and the resize handles when the row may move
   * (`editRules(row).move`); on the progress grip and the connectors always (they exist only
   * where their rule allows them)
   */
  readonly draggable: boolean;
}

type Cursor = 'grab' | 'grabbing' | 'ew-resize' | 'crosshair' | 'pointer' | null;

/** What a press drags once it moves: the bar (move / resize), its progress, or a new link. */
type Gesture = 'drag' | 'progress' | 'link';

/** The `DragSession` handle of a hit part: the body moves the bar, the resize handles resize it. */
const dragHandle = (part: BarHit): DragHandle | null =>
  part === 'bar' || part === 'left' || part === 'right' ? part : null;

/** The connector side of a hit part (`null`: not a connector). */
const linkSide = (part: BarHit): LinkSide | null =>
  part === 'link-start' ? 'start' : part === 'link-end' ? 'end' : null;

/** The hover cursor of a hit (Angular's `hoverCursor`). */
const hoverCursor = (hit: BarPointerHit): Cursor => {
  switch (hit.part) {
    case 'progress':
      return 'ew-resize';
    case 'link-start':
    case 'link-end':
      return 'crosshair';
    case 'bar':
      return hit.draggable ? 'grab' : null;
    default:
      return hit.draggable ? 'ew-resize' : null;
  }
};

/** The cursor while a press drags `part`. */
const dragCursor = (part: BarHit): Cursor => (part === 'bar' ? 'grabbing' : linkSide(part) ? 'crosshair' : 'ew-resize');

export function bindCanvasPointer(ctx: LayerContext, opts: CanvasPointerOptions): void {
  const { inputs: I, graph: G, dom, drag } = ctx;
  const { tooltip, signal } = opts;
  const canvas = dom.canvasContainer;
  const viewport = dom.viewport;
  const coarse = coarsePointer();
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

  /**
   * A bar's pointer targets as they show (D11): its resize handles and body always; its progress
   * grip and link connectors only while the bar overlay draws them (core `computeBarOverlay` of
   * that row, from the inputs the bars layer paints). Without editing the visual has neither.
   */
  const shownTargets = (geo: RowGeometry, v: BarVisual): BarHitTarget => {
    if (!v.progressGrip && !v.connectors) return v;
    const shapes = computeBarOverlay({ ...overlayState(I, coarse, true), rows: [{ id: geo.row.task.id, visual: v }] });
    const shows = (cls: string): boolean => shapes.some(shape => shape.className.startsWith(cls));
    return {
      handles: v.handles,
      hitBox: v.hitBox,
      progressGrip: shows('gantt-progress-grip') ? v.progressGrip : null,
      connectors: shows('gantt-link-connector') ? v.connectors : null,
    };
  };

  /** The bar of `geo` at canvas `x` / `y` and the part hit (core `hitTestBar`), `null` off it. */
  const hitOf = (geo: RowGeometry | undefined, x: number, y: number): BarPointerHit | null => {
    if (!geo) return null;
    const part = hitTestBar(shownTargets(geo, G.barVisual.peek()(geo)), x, y);
    if (!part) return null;
    return { geo, part, draggable: !dragHandle(part) || G.editRules.peek()(geo.row).move };
  };

  /** `editing.dependencies.delete`: a click selects a link (`false` while the options are invalid) */
  const linksDeletable = (): boolean => {
    try {
      return G.config.peek().editing.dependencies.delete;
    } catch {
      return false;
    }
  };
  /** Whether a dependency arrow passes within `ARROW_HIT_TOLERANCE` of canvas `x` / `y` (core `arrowAt`) */
  const onArrow = (x: number, y: number): boolean =>
    arrowAt(G.arrowIndex.peek().query(y - ARROW_HIT_TOLERANCE, y + ARROW_HIT_TOLERANCE), G.arrowVisual.peek(), x, y) !==
    null;

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
   * Cursor, overlay shapes and row tint for a fine pointer at a client position (geometry: the
   * handles and the edit targets reach past the bar).
   */
  const hoverAt = (clientX: number, clientY: number): void => {
    const { x, y } = point(clientX, clientY);
    const geo = geoAt(y);
    const hit = hitOf(geo, x, y);
    setCursor(
      I.link.peek() ? 'crosshair' : hit ? hoverCursor(hit) : linksDeletable() && onArrow(x, y) ? 'pointer' : null,
    );
    setHovered(hit?.geo.row.task.id ?? null);
    setHoveredRow(geo?.row.task.id ?? null);
  };
  /** Nothing is hovered any more: cursor, overlay shapes and row tint go (the tooltip has its own rules). */
  const unhover = (): void => {
    setCursor(null);
    setHovered(null);
    setHoveredRow(null);
  };

  /** The painted bar of `id` takes keyboard focus, without scrolling (a press on it). */
  const focusBar = (id: string): void => {
    (barById(id) as HTMLElement | SVGElement | null)?.focus({ preventScroll: true });
  };

  // ── Press: drag, resize, progress, link, tap ───────────────
  /** The press in progress, and its auto-scroll once it drags */
  let current: { press: Press; auto: AutoScroll | null } | null = null;
  /** What the press drags (set once it drags) */
  let gesture: Gesture | null = null;
  /** The viewport's scroll offsets when the press started: content x = client x + the scroll since */
  let scroll0 = 0;
  let scrollTop0 = 0;
  /** Where the press started, in canvas and in client coordinates */
  let pressCanvas = { x: 0, y: 0 };
  let pressClient = { x: 0, y: 0 };
  /** The trailing click of the last press belongs to a progress or link gesture: it selects nothing */
  let swallowClick = false;
  const contentX = (clientX: number): number => clientX + viewport.scrollLeft - scroll0;
  /** Canvas coordinates of a client position during the press: the press point plus the pointer's and the scroll's moves */
  const canvasAt = (clientX: number, clientY: number): { x: number; y: number } => ({
    x: pressCanvas.x + contentX(clientX) - pressClient.x,
    y: pressCanvas.y + clientY - pressClient.y + viewport.scrollTop - scrollTop0,
  });
  const maxLeft = (): number => G.timeline.peek().totalWidth - I.canvasW.peek();
  const dragging = (): boolean => drag.state.peek().kind !== 'idle';
  /** A press drags something (a bar, a progress, a link) */
  const busy = (): boolean => dragging() || gesture !== null;
  /** The press's gesture still runs (the keyboard may have ended it) */
  const live = (): boolean =>
    gesture === 'drag'
      ? dragging()
      : gesture === 'progress'
        ? ctx.progress.active()
        : gesture === 'link' && ctx.link.active();

  /** Marks where a press starts (its coordinates for `contentX` / `canvasAt`). */
  const beginPress = (e: PointerEvent, at: { x: number; y: number }): void => {
    scroll0 = viewport.scrollLeft;
    scrollTop0 = viewport.scrollTop;
    pressCanvas = at;
    pressClient = { x: e.clientX, y: e.clientY };
  };
  /** The press is over: its auto-scroll stops; returns what it was dragging. */
  const endPress = (): Gesture | null => {
    const was = gesture;
    current?.auto?.stop();
    current = null;
    gesture = null;
    dragMove = () => {};
    return was;
  };

  /** A press became a drag: the tooltip and the hover step aside, the gesture follows the pointer. */
  const dragStart = (hit: BarPointerHit, g: GestureState): void => {
    if (!current) return;
    const id = hit.geo.row.task.id;
    tooltip.dismiss();
    setHovered(null);
    setHoveredRow(null);
    setCursor(dragCursor(hit.part));
    // A touch or pen drag focuses its bar too (a mouse press already did): Escape cancels it there
    if (g.kind === 'touch') focusBar(id);
    const handle = dragHandle(hit.part);
    const side = linkSide(hit.part);
    let follow: (clientX: number, clientY: number) => void;
    if (handle) {
      gesture = 'drag';
      drag.start(hit.geo, handle, g.startX);
      follow = x => drag.move(contentX(x));
    } else if (side) {
      gesture = 'link';
      ctx.link.start(id, side, 'drag', pressCanvas);
      follow = (x, y) => {
        const p = canvasAt(x, y);
        ctx.link.move(p.x, p.y);
      };
    } else {
      gesture = 'progress';
      ctx.progress.start(hit.geo, g.startX);
      follow = x => ctx.progress.move(contentX(x));
    }
    let last = { x: g.x, y: g.y };
    const auto = createAutoScroll({
      scroller: viewport,
      maxLeft,
      scrollTo: left => scrollToX(viewport, left, 'instant', { inputs: I, maxLeft: maxLeft() }),
      // The viewport scrolled under a still pointer: the gesture moves by as much
      onScroll: () => follow(last.x, last.y),
    });
    current.auto = auto;
    const move = (next: GestureState): void => {
      last = { x: next.x, y: next.y };
      follow(next.x, next.y);
      auto.update(next.x);
    };
    move(g);
    dragMove = move;
  };
  /** Follows the pointer while dragging (set by `dragStart`) */
  let dragMove: (g: GestureState) => void = () => {};

  /** Released while dragging: the gesture ends at the release point. */
  const dropGesture = (was: Gesture | null, g: GestureState): void => {
    if (was === 'drag') drag.drop(contentX(g.x));
    else if (was === 'progress') {
      swallowClick = true;
      ctx.progress.drop(contentX(g.x));
    } else if (was === 'link') {
      swallowClick = true;
      const p = canvasAt(g.x, g.y);
      ctx.link.move(p.x, p.y);
      ctx.link.finish();
    }
  };
  /** The press was cancelled (Escape, `pointercancel`, a second finger, the keyboard): so is its gesture. */
  const cancelGesture = (was: Gesture | null): void => {
    drag.cancel();
    if (was === 'progress') ctx.progress.cancel();
    else if (was === 'link') ctx.link.cancel(true);
    // The release that follows (a mouse button still down) is not a click
    if (was === 'progress' || was === 'link') swallowClick = true;
  };

  /** A click-mode link ends at canvas `p`: on a bar it links to that bar, elsewhere it is cancelled. */
  const settleLink = (p: { x: number; y: number }): void => {
    if (hitOf(geoAt(p.y), p.x, p.y)) {
      ctx.link.move(p.x, p.y);
      ctx.link.finish();
    } else ctx.link.cancel();
  };
  /**
   * A press while a click-mode link is armed belongs to it: a mouse settles it at once; a touch or
   * pen on release (a tap), and a touch that pans keeps it armed.
   */
  const pressArmed = (e: PointerEvent, at: { x: number; y: number }): void => {
    tooltip.dismiss();
    if (gestureKind(e.pointerType) === 'mouse') {
      e.preventDefault();
      swallowClick = true;
      settleLink(at);
      return;
    }
    beginPress(e, at);
    const press = trackPress(e, {
      target: canvas,
      keyTarget: view ?? ctx.host,
      draggable: false,
      signal,
      onDragStart: () => {},
      onDragMove: () => {},
      onEnd: (result, g) => {
        endPress();
        if (result === 'none') return;
        swallowClick = true;
        settleLink(canvasAt(g.x, g.y));
        setCursor(null);
      },
      onCancel: () => {
        endPress();
        ctx.link.cancel();
        setCursor(null);
      },
    });
    current = { press, auto: null };
  };

  on('pointerdown', e => {
    // The previous press's trailing click has been dispatched by now (or never comes: a touch drag)
    drag.lastDragMoved = false;
    swallowClick = false;
    // A press deselects the selected link, except a press on that link: its click selects it
    // again, so it never flickers off for a frame (presses outside the canvas: `keyboard.ts`)
    const selectedLink = I.selectedLinkKey.peek();
    if (selectedLink !== null) {
      invalidate();
      const p = point(e.clientX, e.clientY);
      if (ctx.link.keyAt(p.x, p.y) !== selectedLink) ctx.link.deselect();
    }
    if (current) {
      // A second pointer (a pinch, another finger): an undecided press gives way; a drag goes on
      if (current.press.pointerId !== e.pointerId && !busy()) current.press.cancel();
      return;
    }
    if (e.button !== 0) return;
    invalidate();
    const at = point(e.clientX, e.clientY);
    // A link armed by a click takes the press (a keyboard link already ended: `keyboard.ts`)
    if (I.link.peek()?.mode === 'click') {
      pressArmed(e, at);
      return;
    }
    const hit = hitOf(geoAt(at.y), at.x, at.y);
    if (!hit) return;
    const id = hit.geo.row.task.id;
    const mouse = gestureKind(e.pointerType) === 'mouse';
    if (mouse) {
      // No text selection or native focus: the pressed bar takes keyboard focus itself, without
      // scrolling (Escape cancels its drag); the modality stays the pointer's (no focus ring)
      e.preventDefault();
      focusBar(id);
      // A bar that can't be dragged: the press is a plain click (touch and pen may still tap)
      if (!hit.draggable) return;
    }
    beginPress(e, at);
    const target = e.target;
    const press = trackPress(e, {
      target: canvas,
      // Escape cancels the press wherever focus is (the pressed bar has it), before anything else
      keyTarget: view ?? ctx.host,
      draggable: hit.draggable,
      signal,
      onDragStart: g => dragStart(hit, g),
      onDragMove: g => {
        // The keyboard shortcuts ended the gesture (Escape): the press is over too
        if (!live()) current?.press.cancel();
        else dragMove(g);
      },
      onEnd: (result, g) => {
        const was = endPress();
        const side = linkSide(hit.part);
        if (result === 'drop') dropGesture(was, g);
        else if ((result === 'click' || result === 'tap') && side) {
          // A click or tap on a connector arms a click-mode link (WCAG 2.5.7): the next press ends it
          swallowClick = true;
          tooltip.dismiss();
          ctx.link.start(id, side, 'click', at);
        } else if (result === 'tap' && I.tooltipEnabled.peek() && opts.hasRendered()) {
          const bar = barAt(target) ?? barById(id);
          if (bar) tooltip.tap(hit.geo.row, bar);
        }
        // A mouse or pen hovers again where it was released (the bar may have moved under it)
        if (e.pointerType !== 'touch') hoverAt(g.x, g.y);
        else setCursor(null);
      },
      onCancel: () => {
        cancelGesture(endPress());
        setCursor(null);
      },
    });
    current = { press, auto: null };
  });

  // A second finger anywhere on the timeline starts a pinch: an undecided press gives way
  viewport.addEventListener(
    'touchstart',
    e => {
      if (current && e.touches.length > 1 && !busy()) current.press.cancel();
    },
    { passive: true, signal },
  );
  // While a touch drags a bar, its progress or a link the browser must not pan
  bindTouchGuard(canvas, busy, signal);
  bindZoomGestures(ctx, signal);

  // ── Click, double-click ────────────────────────────────────
  on('click', e => {
    if (drag.lastDragMoved || swallowClick) {
      drag.lastDragMoved = false;
      swallowClick = false;
      return;
    }
    const { x, y } = point(e.clientX, e.clientY);
    // A dependency arrow (D13): a click on it selects it, not the row (bars win)
    if (linksDeletable() && ctx.link.selectAt(x, y)) return;
    const row = geoAt(y)?.row;
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
      // A link armed by a click follows the pointer (and finds its target), with no tooltip
      if (I.link.peek()?.mode === 'click') {
        const { x, y } = point(e.clientX, e.clientY);
        ctx.link.move(x, y);
        hoverAt(e.clientX, e.clientY);
        tooltip.unhover();
        return;
      }
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
