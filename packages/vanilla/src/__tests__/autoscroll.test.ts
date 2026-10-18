// Auto-scroll while dragging (Phase 9 step 4.2, D13): one core `autoScrollDelta` step per
// animation frame while the pointer is within `AUTO_SCROLL_EDGE` px of the viewport's left or
// right edge (or past it), stopping in the middle, at the end of the scroll range and when the
// drag ends; the dragged bar follows the scroll (content coordinates).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AUTO_SCROLL_EDGE,
  AUTO_SCROLL_MAX_STEP,
  ViewMode,
  autoScrollDelta,
  type GanttTask,
  type TaskDragEvent,
} from '@gantryjs/core';
import { createAutoScroll } from '../interaction/autoscroll';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A scroller whose visible box spans client x `left`…`left + width` */
function scroller(left: number, width: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  el.getBoundingClientRect = () => new DOMRect(left, 0, width, 300);
  return el;
}

describe('createAutoScroll', () => {
  const LEFT = 100;
  const WIDTH = 400;
  const setup = (start: number, max = 1000) => {
    const sc = scroller(LEFT, WIDTH);
    sc.scrollLeft = start;
    const onScroll = vi.fn();
    const auto = createAutoScroll({
      scroller: sc,
      maxLeft: () => max,
      scrollTo: left => {
        sc.scrollLeft = left;
      },
      onScroll,
    });
    return { sc, auto, onScroll };
  };

  it('steps once per frame near the right edge, faster closer to it', () => {
    const { sc, auto, onScroll } = setup(200);
    const x = LEFT + WIDTH - 4;
    auto.update(x);
    // The first step waits for the next frame
    expect(sc.scrollLeft).toBe(200);
    vi.advanceTimersToNextFrame();
    const step = autoScrollDelta(x, LEFT, LEFT + WIDTH);
    expect(step).toBeGreaterThan(0);
    expect(sc.scrollLeft).toBe(200 + step);
    expect(onScroll).toHaveBeenCalledOnce();
    vi.advanceTimersToNextFrame();
    expect(sc.scrollLeft).toBe(200 + 2 * step);
    // Closer to the edge (and past it): faster, up to the maximum step
    auto.update(LEFT + WIDTH + 50);
    vi.advanceTimersToNextFrame();
    expect(sc.scrollLeft).toBe(200 + 2 * step + AUTO_SCROLL_MAX_STEP);
    auto.stop();
  });

  it('scrolls back near the left edge and stops at the start of the range', () => {
    const { sc, auto } = setup(60);
    auto.update(LEFT + 1);
    vi.advanceTimersToNextFrame();
    const step = autoScrollDelta(LEFT + 1, LEFT, LEFT + WIDTH);
    expect(step).toBeLessThan(0);
    expect(sc.scrollLeft).toBe(60 + step);
    for (let i = 0; i < 10; i++) vi.advanceTimersToNextFrame();
    expect(sc.scrollLeft).toBe(0);
    // Nothing more to scroll: the loop ended
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing in the middle, at the end of the range, and after stop()', () => {
    const middle = setup(200);
    middle.auto.update(LEFT + WIDTH / 2);
    expect(vi.getTimerCount()).toBe(0);
    middle.auto.update(LEFT + AUTO_SCROLL_EDGE / 2);
    vi.advanceTimersToNextFrame();
    expect(middle.sc.scrollLeft).toBeLessThan(200);
    // Back to the middle: the loop ends on its next frame
    middle.auto.update(LEFT + WIDTH / 2);
    const left = middle.sc.scrollLeft;
    vi.advanceTimersToNextFrame();
    expect(middle.sc.scrollLeft).toBe(left);
    expect(vi.getTimerCount()).toBe(0);

    const end = setup(1000, 1000);
    end.auto.update(LEFT + WIDTH - 1);
    vi.advanceTimersToNextFrame();
    expect(end.sc.scrollLeft).toBe(1000);
    expect(end.onScroll).not.toHaveBeenCalled();

    const stopped = setup(200);
    stopped.auto.update(LEFT + WIDTH - 1);
    stopped.auto.stop();
    vi.advanceTimersToNextFrame();
    expect(stopped.sc.scrollLeft).toBe(200);
  });
});

describe('a drag near the viewport edge', () => {
  let el: GantryElement;
  afterEach(() => el?.remove());

  const VIEWPORT = 600;
  const tasks: GanttTask[] = [
    { id: 'a', name: 'A', start: new Date(2026, 0, 5), end: new Date(2026, 0, 9) },
    { id: 'z', name: 'Z', start: new Date(2026, 11, 1), end: new Date(2026, 11, 9) },
  ];

  function mount(): GantryElement {
    el = document.createElement('gantry-element');
    el.style.height = '400px';
    Object.assign(el, { tasks, options: { viewMode: ViewMode.Day, initialScroll: false } });
    const viewport = getEngine(el).dom.viewport;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: () => VIEWPORT });
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, VIEWPORT, 400);
    document.body.appendChild(el);
    getEngine(el).flushSync();
    return el;
  }

  it('scrolls the timeline and the dragged bar follows the scroll', () => {
    mount();
    const { dom, inputs, graph } = getEngine(el);
    const onDragged = vi.fn<(e: CustomEvent<TaskDragEvent>) => void>();
    el.addEventListener('task-dragged', onDragged);
    const send = (type: string, x: number, y: number) =>
      dom.canvasContainer.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: y,
        }),
      );
    const v = el.getBarVisual('a')!;
    const x0 = v.x + v.width / 2;
    expect(x0).toBeLessThan(VIEWPORT - AUTO_SCROLL_EDGE);
    send('pointerdown', x0, v.cy);
    send('pointermove', x0 + 10, v.cy);
    expect(dom.viewport.scrollLeft).toBe(0);

    // Into the right edge zone: the viewport scrolls frame by frame
    const edge = VIEWPORT - 2;
    send('pointermove', edge, v.cy);
    const before = inputs.dragPreview.peek()!.x;
    for (let i = 0; i < 10; i++) vi.advanceTimersToNextFrame();
    const scrolled = dom.viewport.scrollLeft;
    expect(scrolled).toBe(10 * autoScrollDelta(edge, 0, VIEWPORT));
    // The windowed regions see the scroll at once
    expect(inputs.scrollLeft.peek()).toBe(scrolled);
    // The bar moved with the content under the still pointer (snapped to days)
    const px = graph.timeline.peek().pxPerDay;
    expect(inputs.dragPreview.peek()!.x).toBeGreaterThan(before);
    expect(Math.abs(inputs.dragPreview.peek()!.x - (v.x + edge - x0 + scrolled))).toBeLessThanOrEqual(px / 2);

    // Back into the middle: the scrolling stops; the drop counts the scrolled distance
    send('pointermove', VIEWPORT / 2, v.cy);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(dom.viewport.scrollLeft).toBe(scrolled);
    send('pointerup', VIEWPORT / 2, v.cy);
    expect(onDragged.mock.calls[0][0].detail.daysMoved).toBe(Math.round((VIEWPORT / 2 - x0 + scrolled) / px));
  });

  it('stops scrolling when the drag ends or is cancelled', () => {
    mount();
    const { dom } = getEngine(el);
    const send = (type: string, x: number, y: number) =>
      dom.canvasContainer.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: y,
        }),
      );
    const v = el.getBarVisual('a')!;
    const x0 = v.x + v.width / 2;
    send('pointerdown', x0, v.cy);
    send('pointermove', VIEWPORT - 1, v.cy);
    vi.advanceTimersToNextFrame();
    const left = dom.viewport.scrollLeft;
    expect(left).toBeGreaterThan(0);
    send('pointercancel', VIEWPORT - 1, v.cy);
    vi.advanceTimersToNextFrame();
    expect(dom.viewport.scrollLeft).toBe(left);
  });
});
