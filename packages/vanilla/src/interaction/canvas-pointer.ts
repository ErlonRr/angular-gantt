/**
 * @file canvas-pointer.ts
 * Pointer interaction on the timeline canvas: drag / resize a bar (the resize handles come from
 * the bar's visual), click and double-click a row, the resize cursor and the tooltip. Pointer
 * handlers may read layout (the canvas box for hit-testing): they run outside the flush.
 */

import type { GanttFlatRow } from '@gantryjs/core';
import { setAttr } from '../dom/patch';
import type { LayerContext } from '../layers/context';
import type { TooltipLayer } from '../layers/tooltip';

export interface CanvasPointerOptions {
  readonly tooltip: TooltipLayer;
  /** Whether a model was painted (no tooltip before the first render) */
  readonly hasRendered: () => boolean;
  /** Aborted when the element disconnects: removes the listeners */
  readonly signal: AbortSignal;
}

export function bindCanvasPointer(ctx: LayerContext, opts: CanvasPointerOptions): void {
  const { inputs: I, graph: G, dom, drag } = ctx;
  const { tooltip, signal } = opts;
  const canvas = dom.canvasContainer;
  const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (e: HTMLElementEventMap[K]) => void): void =>
    canvas.addEventListener(type, listener, { signal });

  /** Bar group (`[data-task-id]`) under an event target inside the canvas. */
  const barAt = (target: EventTarget | null): SVGElement | null =>
    (target as Element | null)?.closest?.<SVGElement>('[data-task-id]') ?? null;

  /** Visible row under a canvas-relative pointer position. */
  const rowAtPointer = (e: MouseEvent): GanttFlatRow | undefined => {
    const top = canvas.getBoundingClientRect().top;
    const index = Math.floor((e.clientY - top) / G.config.peek().rowHeight);
    return G.visibleRows.peek()[index];
  };

  const resizeHandleAt = (bar: SVGElement, clientX: number): 'left' | 'right' | null => {
    if (!I.enableResize.peek()) return null;
    const geo = G.geoById.peek().get(bar.getAttribute('data-task-id')!);
    const handles = geo && G.barVisual.peek()(geo).handles;
    if (!handles) return null;
    const x = clientX - canvas.getBoundingClientRect().left;
    if (x >= handles.left[0] && x <= handles.left[1]) return 'left';
    if (x >= handles.right[0] && x <= handles.right[1]) return 'right';
    return null;
  };

  on('pointerdown', e => {
    if (e.button !== 0) return;
    const bar = barAt(e.target);
    if (!bar || !I.enableDrag.peek() || !bar.classList.contains('gantt-bar-draggable')) return;
    const geo = G.geoById.peek().get(bar.getAttribute('data-task-id')!);
    if (!geo) return;
    // Keyboard focus goes to the timeline (Escape cancels the drag); the drag prevents the click's own focus
    dom.viewport.focus({ preventScroll: true });
    tooltip.hide();
    drag.start(e, geo, resizeHandleAt(bar, e.clientX) ?? 'bar', canvas);
  });

  on('click', e => {
    if (drag.lastDragMoved) {
      drag.lastDragMoved = false;
      return;
    }
    const row = rowAtPointer(e);
    if (row) ctx.rowClick(row, e);
  });

  on('dblclick', e => {
    const row = rowAtPointer(e);
    if (row) ctx.emit('row-dblclick', row);
  });

  on('pointermove', e => {
    if (drag.state.peek().kind !== 'idle') return;
    const bar = barAt(e.target);
    // The resize cursor comes from the stylesheet (no inline style)
    const resizable = !!bar && bar.classList.contains('gantt-bar-draggable') && !!resizeHandleAt(bar, e.clientX);
    setAttr(canvas, 'data-cursor', resizable ? 'ew-resize' : null);
    if (!I.tooltipEnabled.peek()) return;
    const row = bar && G.geoById.peek().get(bar.getAttribute('data-task-id')!)?.row;
    if (row && opts.hasRendered()) {
      tooltip.enter(row, e);
      tooltip.move(e);
    } else {
      tooltip.leave();
    }
  });

  on('pointerleave', () => tooltip.leave());
}
