// A programmatic instant jump (scrollToDate / initial scroll / zoom anchor) writes `scrollLeft` with
// the jump, so the horizontally windowed header and grid repaint in the same flush instead of
// staying blank until the viewport's scroll event arrives one frame later.
import { describe, it, expect, afterEach } from 'vitest';
import { ViewMode, type GanttTask } from '@gantry/core';
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

  it('leaves smooth scrolls to the scroll event', () => {
    el = mount();
    const { graph, inputs } = getEngine(el);
    el.scrollToDate(new Date(2025, 5, 15), 'smooth');
    flush(el);
    expect(inputs.scrollLeft.peek()).toBe(0);
    expect(graph.timeline().totalWidth).toBeGreaterThan(10_000);
  });
});
