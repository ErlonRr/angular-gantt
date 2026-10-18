// Zoom gestures (Phase 9 step 4.2, D16): Ctrl/⌘ + wheel (and the trackpad pinch that arrives as
// one) through core `wheelZoom`, the two-finger touch pinch through `pinchZoomSteps`, Safari's
// gesture events; the zoom keeps the date under the pointer (`zoomAnchor` → the scroll-commands
// region → core `anchoredScrollLeft`), the API / toolbar zooms keep the centre.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  anchoredScrollLeft,
  DRAG_THRESHOLD_PX,
  PINCH_ZOOM_RATIO,
  ViewMode,
  WHEEL_LINE_DELTA,
  WHEEL_ZOOM_DELTA,
  type DragPreview,
  type GanttTask,
  type TimelineModel,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2025, 0, 6), end: new Date(2025, 0, 20) },
  { id: 'b', name: 'B', start: new Date(2025, 5, 2), end: new Date(2025, 5, 20) },
  { id: 'c', name: 'C', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12) },
];
const WIDTH = 800;

let el: GantryElement;

function mount(viewMode: string = ViewMode.Week): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS, options: { viewMode, initialScroll: false } });
  Object.defineProperty(getEngine(el).dom.viewport, 'clientWidth', { configurable: true, get: () => WIDTH });
  document.body.appendChild(el);
  flush();
  return el;
}

afterEach(() => {
  el?.remove();
  vi.useRealTimers();
});

const flush = () => getEngine(el).flushSync();
const viewport = () => getEngine(el).dom.viewport;
const inputs = () => getEngine(el).inputs;
const timeline = (): TimelineModel => getEngine(el).graph.timeline.peek();
/** Scrolls the viewport to `left` (and lets the engine see it) */
const scrollTo = (left: number) => {
  viewport().scrollLeft = left;
  viewport().dispatchEvent(new Event('scroll'));
  flush();
};

interface WheelInit {
  ctrl?: boolean;
  meta?: boolean;
  mode?: number;
  clientX?: number;
}
/** A wheel over the timeline (happy-dom's WheelEvent has no modifier keys or position) */
function wheel(deltaY: number, { ctrl = true, meta = false, mode = 0, clientX = 300 }: WheelInit = {}): WheelEvent {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaMode: mode });
  Object.defineProperties(e, { ctrlKey: { value: ctrl }, metaKey: { value: meta }, clientX: { value: clientX } });
  viewport().dispatchEvent(e);
  return e;
}

const touch = (id: number, x: number, y = 40) =>
  new Touch({ identifier: id, target: viewport(), clientX: x, clientY: y });
function touches(type: string, list: Touch[], cancelable = true): TouchEvent {
  const e = new TouchEvent(type, { bubbles: true, cancelable, touches: list });
  viewport().dispatchEvent(e);
  return e;
}

function gesture(type: string, scale: number, clientX = 200): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, { scale: { value: scale }, clientX: { value: clientX } });
  viewport().dispatchEvent(e);
  return e;
}

describe('Ctrl/⌘ + wheel', () => {
  it('zooms one level per 100 px, keeping the date under the pointer', async () => {
    mount();
    scrollTo(1000);
    const prev = timeline();
    const first = wheel(-WHEEL_ZOOM_DELTA * 0.6);
    // The page doesn't zoom; not a whole level yet
    expect(first.defaultPrevented).toBe(true);
    expect(el.viewMode).toBe(ViewMode.Week);
    wheel(-WHEEL_ZOOM_DELTA * 0.4, { clientX: 300 });
    expect(el.viewMode).toBe(ViewMode.Day);
    expect(inputs().zoomAnchor.peek()).toBe(300);

    flush();
    const next = timeline();
    expect(next.pxPerDay).toBeGreaterThan(prev.pxPerDay);
    const expected = anchoredScrollLeft(prev, next, 1000, WIDTH, 300)!;
    expect(viewport().scrollLeft).toBe(expected);
    // The windowed regions saw the jump in the same flush
    expect(inputs().scrollLeft.peek()).toBe(expected);
    // The date under the pointer stayed there
    expect(Math.abs(next.toX(prev.toDate(1300)) - (expected + 300))).toBeLessThanOrEqual(1);
    // The anchor served this timeline: cleared once the flush is over
    await Promise.resolve();
    expect(inputs().zoomAnchor.peek()).toBeNull();
  });

  it('zooms out with a positive delta, ⌘ works like Ctrl, and the plain wheel keeps scrolling', () => {
    mount();
    const plain = wheel(-300, { ctrl: false });
    expect(plain.defaultPrevented).toBe(false);
    expect(el.viewMode).toBe(ViewMode.Week);
    wheel(WHEEL_ZOOM_DELTA, { ctrl: false, meta: true });
    expect(el.viewMode).toBe(ViewMode.Month);
    // Two levels at once
    wheel(-2 * WHEEL_ZOOM_DELTA);
    expect(el.viewMode).toBe(ViewMode.Day);
  });

  it('counts lines and pages (deltaMode 1 / 2)', () => {
    mount();
    // Three lines: 120 px, one level and a 20 px rest
    wheel(-3, { mode: 1 });
    expect(el.viewMode).toBe(ViewMode.Day);
    const rest = 3 * WHEEL_LINE_DELTA - WHEEL_ZOOM_DELTA;
    wheel(-(WHEEL_ZOOM_DELTA - rest - 1));
    expect(el.viewMode).toBe(ViewMode.Day);
    wheel(-1);
    expect(el.viewMode).toBe(ViewMode.Hour);
    // A page is a level
    wheel(1, { mode: 2 });
    expect(el.viewMode).toBe(ViewMode.Day);
  });

  it('starts counting again after a zoom from elsewhere', () => {
    mount();
    wheel(-60);
    el.zoomOut();
    expect(el.viewMode).toBe(ViewMode.Month);
    wheel(-60);
    expect(el.viewMode).toBe(ViewMode.Month);
    wheel(-40);
    expect(el.viewMode).toBe(ViewMode.Week);
  });

  it('at the finest level nothing changes and no anchor is left behind', () => {
    mount(ViewMode.Hour);
    const e = wheel(-500);
    expect(e.defaultPrevented).toBe(true);
    expect(el.viewMode).toBe(ViewMode.Hour);
    expect(inputs().zoomAnchor.peek()).toBeNull();
  });

  it('emits view-mode-change like any zoom', () => {
    mount();
    const onChange = vi.fn<(e: CustomEvent<{ viewMode: string }>) => void>();
    el.addEventListener('view-mode-change', onChange);
    wheel(-WHEEL_ZOOM_DELTA);
    flush();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].detail.viewMode).toBe(ViewMode.Day);
  });

  it('does not zoom while a bar is dragged', () => {
    mount(ViewMode.Day);
    // Bars are hit by geometry (the canvas box is at 0,0 in happy-dom)
    const v = el.getBarVisual('c')!;
    const box = { x: v.x + v.width / 2, y: v.cy };
    const canvas = getEngine(el).dom.canvasContainer;
    const send = (type: string, x: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: box.y,
        }),
      );
    send('pointerdown', box.x);
    send('pointermove', box.x + DRAG_THRESHOLD_PX + 10);
    expect(getEngine(el).drag.state.peek().kind).toBe('dragging');
    expect(wheel(-WHEEL_ZOOM_DELTA).defaultPrevented).toBe(true);
    expect(el.viewMode).toBe(ViewMode.Day);
    send('pointerup', box.x + DRAG_THRESHOLD_PX + 10);
  });
});

describe('while a bar is moved', () => {
  it('does not zoom in keyboard move mode either (it shows the drag preview)', () => {
    mount();
    inputs().dragPreview.set({ taskId: 'a', x: 0, width: 10 } as unknown as DragPreview);
    expect(wheel(-WHEEL_ZOOM_DELTA).defaultPrevented).toBe(true);
    touches('touchstart', [touch(1, 100), touch(2, 200)]);
    touches('touchmove', [touch(1, 100), touch(2, 300)]);
    expect(el.viewMode).toBe(ViewMode.Week);
    inputs().dragPreview.set(null);
    wheel(-WHEEL_ZOOM_DELTA);
    expect(el.viewMode).toBe(ViewMode.Day);
  });
});

describe('anchoring', () => {
  it('API, toolbar and option zooms keep the date at the viewport centre', async () => {
    mount();
    scrollTo(1200);
    let prev = timeline();
    el.zoomIn();
    flush();
    expect(viewport().scrollLeft).toBe(anchoredScrollLeft(prev, timeline(), 1200, WIDTH, null));

    // A gesture's anchor serves its own zoom only: a later zoom from the options keeps the centre
    wheel(WHEEL_ZOOM_DELTA, { clientX: 40 });
    flush();
    await Promise.resolve();
    const left = viewport().scrollLeft;
    prev = timeline();
    el.options = { viewMode: ViewMode.Month, initialScroll: false };
    flush();
    expect(viewport().scrollLeft).toBe(anchoredScrollLeft(prev, timeline(), left, WIDTH, null));
  });
});

describe('touch pinch', () => {
  it('zooms one level per ×1.25 of spread at the fingers’ midpoint, holding the page still', () => {
    mount();
    scrollTo(900);
    const prev = timeline();
    touches('touchstart', [touch(1, 100), touch(2, 200)]);
    const move = touches('touchmove', [touch(1, 100), touch(2, 100 + 100 * PINCH_ZOOM_RATIO)]);
    expect(move.defaultPrevented).toBe(true);
    expect(el.viewMode).toBe(ViewMode.Day);
    expect(inputs().zoomAnchor.peek()).toBe((100 + 100 + 100 * PINCH_ZOOM_RATIO) / 2);
    flush();
    expect(viewport().scrollLeft).toBe(anchoredScrollLeft(prev, timeline(), 900, WIDTH, 162.5));

    // Back to the starting spread: one level out again; a smaller spread stays put meanwhile
    touches('touchmove', [touch(1, 100), touch(2, 210)]);
    expect(el.viewMode).toBe(ViewMode.Day);
    touches('touchmove', [touch(1, 100), touch(2, 200)]);
    expect(el.viewMode).toBe(ViewMode.Week);
    touches('touchend', [touch(1, 100)]);
    // One finger: no pinch
    expect(touches('touchmove', [touch(1, 300)]).defaultPrevented).toBe(false);
  });

  it('leaves a touch the browser already pans alone', () => {
    mount();
    touches('touchstart', [touch(1, 100), touch(2, 200)]);
    const move = touches('touchmove', [touch(1, 100), touch(2, 300)], false);
    expect(move.defaultPrevented).toBe(false);
    expect(el.viewMode).toBe(ViewMode.Week);
  });
});

describe('Safari gesture events', () => {
  it('zoom from the gesture scale and keep the page from zooming', () => {
    mount();
    expect(gesture('gesturestart', 1).defaultPrevented).toBe(true);
    expect(gesture('gesturechange', 1.1).defaultPrevented).toBe(true);
    expect(el.viewMode).toBe(ViewMode.Week);
    gesture('gesturechange', PINCH_ZOOM_RATIO, 250);
    expect(el.viewMode).toBe(ViewMode.Day);
    expect(inputs().zoomAnchor.peek()).toBe(250);
    gesture('gesturechange', 0.75);
    expect(el.viewMode).toBe(ViewMode.Month);
    expect(gesture('gestureend', 0.75).defaultPrevented).toBe(true);
  });

  it('step aside while a touch pinch zooms (iOS sends both)', () => {
    mount();
    touches('touchstart', [touch(1, 100), touch(2, 200)]);
    gesture('gesturestart', 1);
    gesture('gesturechange', 2);
    expect(el.viewMode).toBe(ViewMode.Week);
  });
});
