// Bars are hit by geometry, like Angular (Phase 9, D14 / D15): the row under the pointer's y, then
// core `hitTestBar` on that row's visual — resize handles first (up to `bar.handles.hitSize`
// wide, reaching past the bar's edges), then the bar's hit box. The canvas box is at 0,0 in
// happy-dom, so client coordinates are canvas coordinates.
import { describe, it, expect, afterEach } from 'vitest';
import { TaskType, ViewMode, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12) },
  { id: 'b', name: 'Beta', start: new Date(2026, 2, 4), end: new Date(2026, 2, 14), draggable: false },
  { id: 'm', name: 'Gate', start: new Date(2026, 2, 16), end: new Date(2026, 2, 16), type: TaskType.Milestone },
];

let el: GantryElement;

function mount(extra: Partial<GantryElement> = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS, options: { viewMode: ViewMode.Day, initialScroll: false } }, extra);
  document.body.appendChild(el);
  flush(el);
  return el;
}

afterEach(() => el?.remove());

const canvas = () => el.shadowRoot!.querySelector<HTMLElement>('.gantry-canvas-container')!;

/**
 * Presses at canvas `(x, y)` (on the canvas itself: the target element doesn't matter), moves 3 px
 * down (a mouse press drags once it has moved 3 px; the part hit is the pressed one) and reads the
 * drag state.
 */
function pressAt(x: number, y: number): string {
  const at = (type: string, cy: number) =>
    new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: cy, pointerId: 1, pointerType: 'mouse' });
  canvas().dispatchEvent(at('pointerdown', y));
  canvas().dispatchEvent(at('pointermove', y + 3));
  const kind = getEngine(el).drag.state.peek().kind;
  canvas().dispatchEvent(at('pointerup', y + 3));
  flush(el);
  return kind;
}

describe('<gantry-element> bar hit-testing', () => {
  it('resizes from the handles (also just outside the edges) and moves from the body', () => {
    mount();
    const v = el.getBarVisual('a')!;
    const { left, right } = v.handles!;
    expect(left.hit.width).toBe(24);
    expect(pressAt(v.x + v.width / 2, v.cy)).toBe('dragging');
    expect(pressAt(v.x + 2, v.cy)).toBe('resizing-left');
    expect(pressAt(v.x - 8, v.cy)).toBe('resizing-left');
    expect(pressAt(v.x + v.width - 2, v.cy)).toBe('resizing-right');
    expect(pressAt(v.x + v.width + 8, v.cy)).toBe('resizing-right');
    // Past the handles, and above the bar body away from the handles: nothing
    expect(pressAt(left.hit.x - 2, v.cy)).toBe('idle');
    expect(pressAt(right.hit.x + right.hit.width + 2, v.cy)).toBe('idle');
    expect(pressAt(v.x + v.width / 2, v.y - 2)).toBe('idle');
  });

  it('never drags a task with draggable: false', () => {
    mount();
    const v = el.getBarVisual('b')!;
    expect(v.handles).toBeNull();
    expect(pressAt(v.x + v.width / 2, v.cy)).toBe('idle');
  });

  it('moves a milestone from its padded box', () => {
    mount();
    const m = el.getBarVisual('m')!;
    expect(pressAt(m.x - 2, m.cy)).toBe('dragging');
    expect(pressAt(m.x - 5, m.cy)).toBe('idle');
  });

  it('only moves when resize is off, and does nothing when drag is off', () => {
    mount({ enableResize: false });
    const v = el.getBarVisual('a')!;
    expect(v.handles).toBeNull();
    expect(pressAt(v.x + 2, v.cy)).toBe('dragging');
    el.enableDrag = false;
    flush(el);
    expect(pressAt(el.getBarVisual('a')!.x + 2, v.cy)).toBe('idle');
  });

  it('hits custom bars by their visual box', () => {
    mount({
      renderBar: () => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('custom-bar');
        return g;
      },
    });
    const v = el.getBarVisual('a')!;
    expect(el.shadowRoot!.querySelector('.gantt-bars-layer [data-task-id="a"]')?.classList.contains('custom-bar')).toBe(
      true,
    );
    expect(pressAt(v.x + v.width / 2, v.cy)).toBe('dragging');
    expect(pressAt(v.x + v.width, v.cy)).toBe('resizing-right');
  });

  it('shows the resize cursor over the whole resize target', () => {
    mount();
    const v = el.getBarVisual('a')!;
    const move = (x: number, y = v.cy) =>
      canvas().dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
    move(v.x - 10);
    expect(canvas().getAttribute('data-cursor')).toBe('ew-resize');
    // The body of a draggable bar: grab (Angular's hover cursor)
    move(v.x + v.width / 2);
    expect(canvas().getAttribute('data-cursor')).toBe('grab');
    move(v.x + v.width + 10);
    expect(canvas().getAttribute('data-cursor')).toBe('ew-resize');
    // Another row: the row comes from y
    move(v.x - 10, v.cy + 36);
    expect(canvas().hasAttribute('data-cursor')).toBe(false);
  });
});
