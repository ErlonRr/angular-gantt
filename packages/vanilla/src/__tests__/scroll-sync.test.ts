// A programmatic instant jump (scrollToDate / initial scroll / zoom anchor) writes `scrollLeft` with
// the jump, so the horizontally windowed header and grid repaint in the same flush instead of
// staying blank until the viewport's scroll event arrives one frame later. The task list forwards
// its vertical wheel to the timeline, but not a Ctrl/⌘ + wheel (a zoom). The panes mirror each
// other's vertical offset (core `createScrollMirror`): the echo of a mirror write never undoes a
// newer scroll.
import { describe, it, expect, afterEach } from 'vitest';
import { ViewMode, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const tasks: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2024, 0, 1), end: new Date(2024, 0, 10) },
  { id: 'z', name: 'Z', start: new Date(2026, 11, 10), end: new Date(2026, 11, 20) },
];

function mount(width = 1000): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks, options: { viewMode: ViewMode.Day, initialScroll: false } });
  Object.defineProperty(getEngine(el).dom.viewport, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(el);
  flush(el);
  return el;
}

/** Header cells of the finest tier covering `x`. */
function cellsAt(el: GantryElement, x: number): Element[] {
  const tiers = el.shadowRoot!.querySelectorAll('.g-tier');
  const bottom = tiers[tiers.length - 1];
  return [...bottom.querySelectorAll<HTMLElement>('.g-cell')].filter(c => {
    const left = parseFloat(c.style.getPropertyValue('--x'));
    const w = parseFloat(c.style.getPropertyValue('--w'));
    return left <= x && x < left + w;
  });
}

describe('programmatic horizontal jumps', () => {
  let el: GantryElement;
  afterEach(() => el?.remove());

  it('repaints the windowed header at the target in the same flush, without a scroll event', () => {
    el = mount();
    const { graph, inputs } = getEngine(el);
    const target = new Date(2025, 5, 15);
    const x = graph.timeline().toX(target);
    expect(cellsAt(el, x)).toHaveLength(0); // far outside the initial window

    el.scrollToDate(target, 'instant');
    flush(el);

    const expected = Math.min(Math.max(0, x - 500), graph.timeline().totalWidth - inputs.canvasW.peek());
    expect(inputs.scrollLeft.peek()).toBe(expected);
    expect(cellsAt(el, x)).toHaveLength(1);
  });

  it('repaints the windowed header at a gesture zoom’s anchored target in the same flush', () => {
    el = mount();
    const { inputs } = getEngine(el);
    el.scrollToDate(new Date(2025, 5, 15), 'instant');
    flush(el);
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    Object.defineProperties(wheel, { ctrlKey: { value: true }, clientX: { value: 250 } });
    getEngine(el).dom.viewport.dispatchEvent(wheel);
    flush(el);
    expect(el.viewMode).toBe(ViewMode.Week);
    const left = getEngine(el).dom.viewport.scrollLeft;
    expect(inputs.scrollLeft.peek()).toBe(left);
    // The date under the pointer: its header cell is painted without waiting for a scroll event
    expect(cellsAt(el, left + 250)).toHaveLength(1);
  });

  it('leaves Ctrl/⌘ + wheel over the task list to the browser; a plain wheel there scrolls the timeline', () => {
    el = mount();
    const { dom } = getEngine(el);
    const wheel = (ctrl: boolean) => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
      Object.defineProperty(e, 'ctrlKey', { value: ctrl });
      dom.panel.dispatchEvent(e);
      return e;
    };
    expect(wheel(true).defaultPrevented).toBe(false);
    expect(dom.viewport.scrollTop).toBe(0);
    expect(el.viewMode).toBe(ViewMode.Day);
    expect(wheel(false).defaultPrevented).toBe(true);
    expect(dom.viewport.scrollTop).toBe(120);
  });

  it('leaves smooth scrolls to the scroll event', () => {
    el = mount();
    const { graph, inputs } = getEngine(el);
    el.scrollToDate(new Date(2025, 5, 15), 'smooth');
    flush(el);
    expect(inputs.scrollLeft.peek()).toBe(0);
    expect(graph.timeline().totalWidth).toBeGreaterThan(10_000);
  });
});

describe('vertical scroll mirroring (core createScrollMirror)', () => {
  let el: GantryElement;
  afterEach(() => el?.remove());

  const scrolled = (pane: HTMLElement) => pane.dispatchEvent(new Event('scroll'));

  it('mirrors either pane into the other and writes scrollTop', () => {
    el = mount();
    const { dom, inputs } = getEngine(el);
    dom.viewport.scrollTop = 300;
    scrolled(dom.viewport);
    expect(dom.panel.scrollTop).toBe(300);
    expect(inputs.scrollTop.peek()).toBe(300);
    dom.panel.scrollTop = 120;
    scrolled(dom.panel);
    expect(dom.viewport.scrollTop).toBe(120);
    expect(inputs.scrollTop.peek()).toBe(120);
  });

  it('the echo of the previous mirror write never undoes a newer keyboard scroll (key-repeat speed)', () => {
    el = mount();
    const { dom, inputs } = getEngine(el);
    dom.viewport.scrollTop = 1951;
    scrolled(dom.viewport);
    expect(dom.panel.scrollTop).toBe(1951);
    // The next ↑ scrolls the timeline before the panel's own (echo) event arrives; the browser
    // dispatches the echo first
    dom.viewport.scrollTop = 1915;
    scrolled(dom.panel);
    expect(dom.viewport.scrollTop).toBe(1915);
    scrolled(dom.viewport);
    expect(dom.panel.scrollTop).toBe(1915);
    expect(inputs.scrollTop.peek()).toBe(1915);
  });
});
