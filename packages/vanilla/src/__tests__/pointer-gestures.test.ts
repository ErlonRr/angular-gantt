// Pointer gestures on the timeline (Phase 9 step 4.2, D13): a mouse press drags after 3 px, a
// touch / pen press after a 350 ms long press (moving earlier pans), a non-passive touchmove is
// prevented only while dragging, pointercancel / Escape cancel, the drag follows the pointer in
// content coordinates; the hover writes `hoveredBarId`, the cursor and the tooltip calls; a tap
// toggles the tooltip. Bars are hit by geometry (the canvas box is at 0,0 in happy-dom).
// Phase 10 step 4.1: a mouse press on a bar focuses that bar (a touch or pen drag too), with the
// pointer's modality (no focus ring); Escape belongs to the press while it lasts; a scroll of
// either pane clears the hover (the row hover itself is in hover.test.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  TOUCH_SLOP_PX,
  ViewMode,
  type GanttTask,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12) },
  { id: 'b', name: 'B', start: new Date(2026, 2, 4), end: new Date(2026, 2, 14) },
  { id: 'locked', name: 'Locked', start: new Date(2026, 2, 3), end: new Date(2026, 2, 13), draggable: false },
];

let el: GantryElement;

function mount(extra: Partial<GantryElement> = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS, options: { viewMode: ViewMode.Day, initialScroll: false } }, extra);
  document.body.appendChild(el);
  getEngine(el).flushSync();
  return el;
}

const engine = () => getEngine(el);
const canvas = () => engine().dom.canvasContainer;
const viewport = () => engine().dom.viewport;
const barEl = (id: string) => el.shadowRoot!.querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${id}"]`)!;
const dragKind = () => engine().drag.state.peek().kind;
const px = () => engine().graph.timeline.peek().pxPerDay;

type Kind = 'mouse' | 'touch' | 'pen';
const pointer = (type: string, x: number, y: number, kind: Kind = 'mouse', id = 1) =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: id,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
/** Dispatches on the bar of `id` when given (the event target is then the bar), else on the canvas. */
const send = (type: string, x: number, y: number, kind: Kind = 'mouse', on?: Element, id = 1): PointerEvent => {
  const e = pointer(type, x, y, kind, id);
  (on ?? canvas()).dispatchEvent(e);
  return e;
};
const touchmove = (x: number, y: number, target: EventTarget = canvas()): TouchEvent => {
  const e = new TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [new Touch({ identifier: 1, target, clientX: x, clientY: y })],
  });
  canvas().dispatchEvent(e);
  return e;
};
/** Middle of a bar's body */
const centre = (id: string) => {
  const v = el.getBarVisual(id)!;
  return { x: v.x + v.width / 2, y: v.cy, v };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  el?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mouse press', () => {
  it('drags only once the pointer has moved 3 px, from where it was pressed', () => {
    mount();
    const onDragged = vi.fn<(e: CustomEvent<TaskDragEvent>) => void>();
    el.addEventListener('task-dragged', onDragged);
    const capture = vi.spyOn(canvas(), 'setPointerCapture');
    const { x, y } = centre('a');

    const down = send('pointerdown', x, y, 'mouse', barEl('a'));
    // No text selection or native focus: the pressed bar takes keyboard focus, the pointer is captured
    expect(down.defaultPrevented).toBe(true);
    expect(el.shadowRoot!.activeElement).toBe(barEl('a'));
    expect(engine().inputs.focusVisibleBarId.peek()).toBeNull();
    expect(capture).toHaveBeenCalledWith(1);
    expect(dragKind()).toBe('idle');

    send('pointermove', x + DRAG_THRESHOLD_PX - 1, y);
    expect(dragKind()).toBe('idle');
    expect(engine().inputs.dragPreview.peek()).toBeNull();

    send('pointermove', x + DRAG_THRESHOLD_PX, y);
    expect(dragKind()).toBe('dragging');
    expect(engine().inputs.dragPreview.peek()).not.toBeNull();

    send('pointermove', x + 2 * px(), y);
    send('pointerup', x + 2 * px(), y);
    expect(dragKind()).toBe('idle');
    expect(onDragged).toHaveBeenCalledOnce();
    expect(onDragged.mock.calls[0][0].detail).toMatchObject({ taskId: 'a', daysMoved: 2 });
  });

  it('a press that does not move is a click: it selects the row; the click that ends a drag does not', () => {
    mount();
    const { x, y } = centre('a');
    const click = () => canvas().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));

    send('pointerdown', x, y, 'mouse', barEl('a'));
    send('pointermove', x + 1, y);
    send('pointerup', x + 1, y);
    expect(dragKind()).toBe('idle');
    click();
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['a']);

    el.clearSelection();
    send('pointerdown', x, y, 'mouse', barEl('a'));
    send('pointermove', x + 2 * px(), y);
    send('pointerup', x + 2 * px(), y);
    click();
    expect(el.getSelectedTasks()).toEqual([]);
  });

  it('resizes from a handle, with the resize cursor while resizing', () => {
    mount();
    const onResized = vi.fn<(e: CustomEvent<TaskResizeEvent>) => void>();
    el.addEventListener('task-resized', onResized);
    const v = el.getBarVisual('a')!;
    const x = v.x + v.width - 2;
    send('pointerdown', x, v.cy);
    send('pointermove', x + px(), v.cy);
    expect(dragKind()).toBe('resizing-right');
    expect(canvas().getAttribute('data-cursor')).toBe('ew-resize');
    send('pointerup', x + px(), v.cy);
    expect(onResized).toHaveBeenCalledOnce();
    expect(onResized.mock.calls[0][0].detail).toMatchObject({ taskId: 'a', handle: 'right', daysDelta: 1 });
  });

  it('leaves a bar that cannot be dragged to the plain click (no capture), focusing that bar', () => {
    mount();
    const capture = vi.spyOn(canvas(), 'setPointerCapture');
    const { x, y } = centre('locked');
    const down = send('pointerdown', x, y, 'mouse', barEl('locked'));
    // The bar takes focus itself (no native focus elsewhere, no text selection)
    expect(down.defaultPrevented).toBe(true);
    expect(el.shadowRoot!.activeElement).toBe(barEl('locked'));
    send('pointermove', x + 3 * px(), y);
    expect(dragKind()).toBe('idle');
    send('pointerup', x + 3 * px(), y);
    expect(capture).not.toHaveBeenCalled();
    // Drag off: no press on any bar, but a press still focuses the bar it hits
    el.enableDrag = false;
    getEngine(el).flushSync();
    const { x: ax, y: ay } = centre('a');
    // In a handle's reach outside the bar's shapes: still that bar (hit by geometry)
    send('pointerdown', ax, ay);
    expect(el.shadowRoot!.activeElement).toBe(barEl('a'));
    send('pointermove', ax + 3 * px(), ay);
    expect(dragKind()).toBe('idle');
    send('pointerup', ax + 3 * px(), ay);
    // Off the bars: nothing is prevented, focus stays where it was
    const off = send('pointerdown', 5, 5);
    expect(off.defaultPrevented).toBe(false);
    expect(el.shadowRoot!.activeElement).toBe(barEl('a'));
  });

  it('a pressed bar keeps the pointer modality: no focus ring and no focus tooltip, until a key is pressed', () => {
    mount();
    const focusTip = vi.spyOn(engine().layers.tooltip, 'focus');
    const { x, y } = centre('b');
    // A keyboard user's last input was a key: the press makes the pointer the modality
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    send('pointerdown', x, y, 'mouse', barEl('b'));
    send('pointerup', x, y, 'mouse', barEl('b'));
    expect(el.shadowRoot!.activeElement).toBe(barEl('b'));
    expect(engine().inputs.focusedRowId.peek()).toBe('b');
    expect(engine().inputs.focusVisibleBarId.peek()).toBeNull();
    expect(focusTip).not.toHaveBeenCalled();
    // The pressed bar is the timeline's tab stop now
    getEngine(el).flushSync();
    expect(barEl('b').getAttribute('tabindex')).toBe('0');
  });

  it('ignores other buttons', () => {
    mount();
    const { x, y } = centre('a');
    canvas().dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 2,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
      }),
    );
    send('pointermove', x + 3 * px(), y);
    expect(dragKind()).toBe('idle');
  });
});

describe('cancelling', () => {
  it('pointercancel ends a drag without emitting; later moves change nothing', () => {
    mount();
    const onDragged = vi.fn();
    el.addEventListener('task-dragged', onDragged);
    const { x, y } = centre('a');
    send('pointerdown', x, y);
    send('pointermove', x + px(), y);
    expect(dragKind()).toBe('dragging');
    send('pointercancel', x + px(), y);
    expect(dragKind()).toBe('idle');
    expect(engine().inputs.dragPreview.peek()).toBeNull();
    send('pointermove', x + 3 * px(), y);
    send('pointerup', x + 3 * px(), y);
    expect(onDragged).not.toHaveBeenCalled();
  });

  it('Escape cancels a drag, and the click that ends it selects nothing', () => {
    mount();
    const onDragged = vi.fn();
    el.addEventListener('task-dragged', onDragged);
    const { x, y } = centre('a');
    send('pointerdown', x, y);
    send('pointermove', x + 2 * px(), y);
    expect(dragKind()).toBe('dragging');
    viewport().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(dragKind()).toBe('idle');
    send('pointermove', x + 3 * px(), y);
    expect(dragKind()).toBe('idle');
    send('pointerup', x + 3 * px(), y);
    canvas().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    expect(onDragged).not.toHaveBeenCalled();
    expect(el.getSelectedTasks()).toEqual([]);
  });

  it('Escape ends an undecided press: moving afterwards does not drag', () => {
    mount();
    const { x, y } = centre('a');
    send('pointerdown', x, y);
    viewport().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    send('pointermove', x + 3 * px(), y);
    expect(dragKind()).toBe('idle');
  });

  it("Escape is the press's while it lasts: consumed before the chart and the page hear it, then theirs again", () => {
    mount();
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    el.setSelectedTasks(['b']);
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'mouse', barEl('a'));
    send('pointermove', x + 2 * px(), y);
    expect(dragKind()).toBe('dragging');
    // On the pressed bar, which holds focus
    const esc = () => {
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
      barEl('a').dispatchEvent(e);
      return e;
    };
    expect(esc().defaultPrevented).toBe(true);
    expect(dragKind()).toBe('idle');
    expect(engine().inputs.dragPreview.peek()).toBeNull();
    // Not a keyboard focus (no ring, no focus tooltip), the selection stays, the page saw nothing
    expect(engine().inputs.focusVisibleBarId.peek()).toBeNull();
    expect(engine().layers.tooltip.visibleId()).toBeNull();
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
    expect(onKey).not.toHaveBeenCalled();
    send('pointerup', x + 2 * px(), y);
    // The press is over: the next Escape is the chart's (a key shows the focused bar's ring; with
    // no tooltip to close first it clears the selection) and the page's
    el.tooltipEnabled = false;
    esc();
    expect(engine().inputs.focusVisibleBarId.peek()).toBe('a');
    expect(el.getSelectedTasks()).toEqual([]);
    expect(onKey).toHaveBeenCalledOnce();
    document.removeEventListener('keydown', onKey);
  });
});

describe('touch and pen press', () => {
  it('drags after a 350 ms long press; the touchmove is prevented only while dragging', () => {
    mount();
    const onDragged = vi.fn<(e: CustomEvent<TaskDragEvent>) => void>();
    el.addEventListener('task-dragged', onDragged);
    const { x, y } = centre('a');

    const down = send('pointerdown', x, y, 'touch', barEl('a'));
    // The browser may still pan: nothing is prevented, focus stays where it was
    expect(down.defaultPrevented).toBe(false);
    expect(el.shadowRoot!.activeElement).toBeNull();
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(dragKind()).toBe('idle');
    expect(touchmove(x, y).defaultPrevented).toBe(false);

    vi.advanceTimersByTime(1);
    expect(dragKind()).toBe('dragging');
    // The dragged bar takes focus once the drag starts, with no focus ring
    expect(el.shadowRoot!.activeElement).toBe(barEl('a'));
    expect(engine().inputs.focusVisibleBarId.peek()).toBeNull();
    expect(touchmove(x + px(), y).defaultPrevented).toBe(true);

    send('pointermove', x + 2 * px(), y, 'touch');
    send('pointerup', x + 2 * px(), y, 'touch');
    expect(onDragged.mock.calls[0][0].detail).toMatchObject({ taskId: 'a', daysMoved: 2 });
    expect(touchmove(x, y).defaultPrevented).toBe(false);
  });

  it('a pen drags after a long press too', () => {
    mount();
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'pen');
    send('pointermove', x + DRAG_THRESHOLD_PX + 1, y, 'pen');
    expect(dragKind()).toBe('idle');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dragKind()).toBe('dragging');
    send('pointerup', x + DRAG_THRESHOLD_PX + 1, y, 'pen');
    expect(dragKind()).toBe('idle');
  });

  it('a touch that moves before the long press pans: no drag, no tap', () => {
    mount();
    const tap = vi.spyOn(engine().layers.tooltip, 'tap');
    const onDragged = vi.fn();
    el.addEventListener('task-dragged', onDragged);
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'touch', barEl('a'));
    send('pointermove', x + TOUCH_SLOP_PX + 1, y, 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(dragKind()).toBe('idle');
    expect(touchmove(x + 40, y).defaultPrevented).toBe(false);
    send('pointerup', x + 40, y, 'touch');
    expect(onDragged).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });

  it('a tap toggles the tooltip of the bar (also one that cannot be dragged); a touch never hovers', () => {
    mount();
    const { tooltip } = engine().layers;
    const tap = vi.spyOn(tooltip, 'tap');
    const hover = vi.spyOn(tooltip, 'hover');
    const unhover = vi.spyOn(tooltip, 'unhover');
    const { x, y } = centre('a');

    send('pointermove', x, y, 'touch', barEl('a'));
    expect(hover).not.toHaveBeenCalled();
    expect(engine().inputs.hoveredBarId.peek()).toBeNull();

    send('pointerdown', x, y, 'touch', barEl('a'));
    vi.advanceTimersByTime(100);
    send('pointerup', x, y, 'touch', barEl('a'));
    expect(tap).toHaveBeenCalledOnce();
    expect(tap.mock.calls[0][0].task.id).toBe('a');
    expect(tap.mock.calls[0][1]).toBe(barEl('a'));
    // The finger lifting is not the pointer leaving: a tapped tooltip stays
    canvas().dispatchEvent(pointer('pointerleave', x, y, 'touch'));
    expect(unhover).not.toHaveBeenCalled();

    const locked = centre('locked');
    send('pointerdown', locked.x, locked.y, 'touch', barEl('locked'));
    send('pointerup', locked.x, locked.y, 'touch', barEl('locked'));
    expect(tap).toHaveBeenCalledTimes(2);
    expect(tap.mock.calls[1][0].task.id).toBe('locked');
  });

  it('no tap with the tooltip off', () => {
    mount({ tooltipEnabled: false });
    const tap = vi.spyOn(engine().layers.tooltip, 'tap');
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'touch', barEl('a'));
    send('pointerup', x, y, 'touch', barEl('a'));
    expect(tap).not.toHaveBeenCalled();
  });

  it('a second finger (a pinch) ends an undecided press, on the canvas or anywhere on the timeline', () => {
    mount();
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'touch', undefined, 1);
    send('pointerdown', x + 60, y, 'touch', undefined, 2);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dragKind()).toBe('idle');

    send('pointerdown', x, y, 'touch', undefined, 3);
    const touch = (id: number, cx: number) =>
      new Touch({ identifier: id, target: viewport(), clientX: cx, clientY: 5 });
    viewport().dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(3, x), touch(4, x + 80)] }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dragKind()).toBe('idle');
  });

  it('a disconnect ends an undecided press: the long press never starts a drag', () => {
    mount();
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'touch');
    el.remove();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dragKind()).toBe('idle');
    document.body.appendChild(el);
    engine().flushSync();
    send('pointerdown', x, y);
    send('pointermove', x + px(), y);
    expect(dragKind()).toBe('dragging');
    send('pointerup', x + px(), y);
  });

  it('the next press is clicked normally after a touch drag (which has no trailing click)', () => {
    mount();
    const { x, y } = centre('a');
    send('pointerdown', x, y, 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    send('pointermove', x + 2 * px(), y, 'touch');
    send('pointerup', x + 2 * px(), y, 'touch');
    expect(engine().drag.lastDragMoved).toBe(true);

    const b = centre('b');
    send('pointerdown', b.x, b.y);
    send('pointerup', b.x, b.y);
    canvas().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.x, clientY: b.y }));
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
  });
});

describe('drag in content coordinates', () => {
  it('a scroll under a still pointer moves the bar by as much', () => {
    mount();
    const onDragged = vi.fn<(e: CustomEvent<TaskDragEvent>) => void>();
    el.addEventListener('task-dragged', onDragged);
    const { x, y } = centre('a');
    send('pointerdown', x, y);
    send('pointermove', x + DRAG_THRESHOLD_PX, y);
    const before = engine().inputs.dragPreview.peek()!.x;
    viewport().scrollLeft = 3 * px();
    send('pointermove', x + DRAG_THRESHOLD_PX, y);
    expect(engine().inputs.dragPreview.peek()!.x).toBe(before + 3 * px());
    send('pointerup', x + DRAG_THRESHOLD_PX, y);
    expect(onDragged.mock.calls[0][0].detail).toMatchObject({ taskId: 'a', daysMoved: 3 });
  });
});

describe('hover', () => {
  it('writes hoveredBarId from geometry for a mouse or pen, and clears it when the pointer leaves', () => {
    mount();
    const { hoveredBarId } = engine().inputs;
    const v = el.getBarVisual('a')!;
    // Inside the right handle's reach but outside the bar's own shapes
    send('pointermove', v.x + v.width + 8, v.cy);
    expect(hoveredBarId.peek()).toBe('a');
    expect(canvas().getAttribute('data-cursor')).toBe('ew-resize');
    send('pointermove', v.x + v.width / 2, v.cy);
    expect(canvas().getAttribute('data-cursor')).toBe('grab');
    send('pointermove', v.x - 60, v.cy);
    expect(hoveredBarId.peek()).toBeNull();
    expect(canvas().hasAttribute('data-cursor')).toBe(false);

    send('pointermove', v.x + v.width / 2, v.cy, 'pen');
    expect(hoveredBarId.peek()).toBe('a');
    canvas().dispatchEvent(pointer('pointerleave', 0, 0, 'pen'));
    expect(hoveredBarId.peek()).toBeNull();
    expect(canvas().hasAttribute('data-cursor')).toBe(false);
  });

  it('a bar that cannot be dragged is hovered, with no cursor of ours', () => {
    mount();
    const { x, y } = centre('locked');
    send('pointermove', x, y);
    expect(engine().inputs.hoveredBarId.peek()).toBe('locked');
    expect(canvas().hasAttribute('data-cursor')).toBe(false);
  });

  it('opens the tooltip of the painted bar under the pointer (anchored to it), unhovers elsewhere', () => {
    mount();
    const { tooltip } = engine().layers;
    const hover = vi.spyOn(tooltip, 'hover');
    const unhover = vi.spyOn(tooltip, 'unhover');
    const { x, y } = centre('a');
    send('pointermove', x, y, 'mouse', barEl('a').firstElementChild!);
    expect(hover).toHaveBeenCalledOnce();
    expect(hover.mock.calls[0][0].task.id).toBe('a');
    expect(hover.mock.calls[0][1]).toBe(barEl('a'));
    expect(hover.mock.calls[0][2]).toBe(x);
    send('pointermove', 5, 5);
    expect(unhover).toHaveBeenCalledOnce();
    canvas().dispatchEvent(pointer('pointerleave', 0, 0));
    expect(unhover).toHaveBeenCalledTimes(2);
  });

  it('a drag dismisses the tooltip and hides the grips; the release hovers again', () => {
    mount();
    const { tooltip } = engine().layers;
    const dismiss = vi.spyOn(tooltip, 'dismiss');
    const hover = vi.spyOn(tooltip, 'hover');
    const { x, y } = centre('a');
    send('pointermove', x, y, 'mouse', barEl('a'));
    expect(engine().inputs.hoveredBarId.peek()).toBe('a');
    send('pointerdown', x, y, 'mouse', barEl('a'));
    expect(dismiss).not.toHaveBeenCalled();
    send('pointermove', x + px(), y);
    expect(dismiss).toHaveBeenCalled();
    expect(engine().inputs.hoveredBarId.peek()).toBeNull();
    expect(canvas().getAttribute('data-cursor')).toBe('grabbing');
    // Moves while dragging don't hover
    send('pointermove', x + 2 * px(), y, 'mouse', barEl('b'));
    expect(hover).toHaveBeenCalledOnce();
    send('pointerup', x + px(), y);
    // The bar moved with the pointer: it is under it again
    expect(engine().inputs.hoveredBarId.peek()).toBe('a');
    expect(canvas().getAttribute('data-cursor')).toBe('grab');
  });

  it('a scroll of either pane clears the hovered bar, its grips, the row and the cursor; a drag keeps its cursor', () => {
    mount();
    const { inputs: I, dom } = engine();
    const { x, y } = centre('a');
    for (const pane of [viewport(), dom.panel]) {
      send('pointermove', x, y, 'mouse', barEl('a'));
      expect(I.hoveredBarId.peek()).toBe('a');
      expect(I.hoveredRowId.peek()).toBe('a');
      expect(canvas().getAttribute('data-cursor')).toBe('grab');
      pane.dispatchEvent(new Event('scroll'));
      expect(I.hoveredBarId.peek()).toBeNull();
      expect(I.hoveredRowId.peek()).toBeNull();
      expect(canvas().hasAttribute('data-cursor')).toBe(false);
    }
    // The next move hovers again
    send('pointermove', x, y);
    expect(I.hoveredBarId.peek()).toBe('a');
    // While a bar is dragged (the viewport auto-scrolls) the cursor stays
    send('pointerdown', x, y);
    send('pointermove', x + 2 * px(), y);
    expect(canvas().getAttribute('data-cursor')).toBe('grabbing');
    viewport().dispatchEvent(new Event('scroll'));
    expect(canvas().getAttribute('data-cursor')).toBe('grabbing');
    send('pointerup', x + 2 * px(), y);
  });

  it('measures the canvas box once per hover, again after a scroll, a resize of the panes or re-entering', () => {
    mount();
    const measure = vi.spyOn(canvas(), 'getBoundingClientRect');
    const { x, y } = centre('a');
    send('pointermove', x, y);
    send('pointermove', x + 1, y);
    send('pointermove', x + 2, y);
    expect(measure).toHaveBeenCalledTimes(1);
    viewport().dispatchEvent(new Event('scroll'));
    send('pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(2);
    engine().inputs.canvasW.set(engine().inputs.canvasW.peek() + 10);
    send('pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new Event('resize'));
    send('pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(4);
    canvas().dispatchEvent(pointer('pointerenter', x, y));
    send('pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(5);
    send('pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(5);
  });
});
