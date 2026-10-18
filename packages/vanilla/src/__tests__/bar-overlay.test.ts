// The bar overlay (Gantry 2 phase 9, step 4.1, D4): one `g.gantt-bar-overlay` per chart between
// the bars and the annotation labels, attached only while it shows something, holding the focus
// ring of the bar focused from the keyboard (core `BarVisual.focusRect`) and the resize grips
// (`handles.*.grip`) of that bar, of the hovered bar and, on coarse pointers, of the selected
// bars. Keyboard vs pointer focus is tracked from the last input (`focusVisibleBarId`). Built-in
// bars also get `gantt-bar--critical` after their first class (D25).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskType, ViewMode, type GanttTask, type Rect } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { CANVAS_CSS } from '../styles/canvas.css';
import { TASKLIST_CSS } from '../styles/tasklist.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const day = (d: number) => new Date(2026, 2, d);
const tasks = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), progress: 20 },
  { id: 'b', name: 'Beta', start: day(9), end: day(16), progress: 50, dependency: 'a' },
  { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(18), end: day(18), dependency: 'b' },
  { id: 'c', name: 'Side', start: day(3), end: day(5) },
];

function mount(options: GantryElement['options'] = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = tasks();
  el.options = { viewMode: ViewMode.Day, initialScroll: false, ...options };
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const overlay = (el: GantryElement) => $<SVGGElement>(el, '.gantt-bar-overlay');
const shapes = (el: GantryElement) => [...(overlay(el)?.children ?? [])].map(c => c.getAttribute('class'));
const box = (n: Element | undefined) => n && ['x', 'y', 'width', 'height', 'rx'].map(a => Number(n.getAttribute(a)));
const rect = (r: Rect & { rx: number }) => [r.x, r.y, r.width, r.height, r.rx];

/** A key on the page (not one the chart uses), as a keyboard user would press one. */
const anyKey = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true }));
const pointerDown = (target: EventTarget) =>
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerType: 'mouse' }));

describe('<gantry-element> bar overlay', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  it('is detached until it shows something, then sits between the bars and the annotation labels', () => {
    el = mount();
    expect(overlay(el)).toBeNull();
    anyKey();
    bar(el, 'a').focus();
    flush(el);
    const svg = $(el, '.gantry-canvas-container > svg')!;
    const order = [...svg.children].map(c => c.getAttribute('class'));
    expect(order.indexOf('gantt-bar-overlay')).toBe(order.indexOf('gantt-bars-layer') + 1);
    expect(order[order.indexOf('gantt-bar-overlay') + 1]).toBe('gantt-annotation-labels');
    expect(overlay(el)!.getAttribute('aria-hidden')).toBe('true');
    expect(overlay(el)!.getAttribute('pointer-events')).toBe('none');

    bar(el, 'a').blur();
    flush(el);
    expect(overlay(el)).toBeNull();
  });

  it('shows the focus ring (focusRect) and the grips (handles) of the bar focused from the keyboard', () => {
    el = mount();
    anyKey();
    bar(el, 'b').focus();
    expect(getEngine(el).inputs.focusVisibleBarId()).toBe('b');
    flush(el);
    expect(shapes(el)).toEqual(['gantt-bar-focus-ring', 'gantt-bar-grip', 'gantt-bar-grip']);
    const v = el.getBarVisual('b')!;
    const [ring, left, right] = overlay(el)!.children;
    expect(box(ring)).toEqual(rect(v.focusRect));
    expect(box(left)).toEqual(rect(v.handles!.left.grip));
    expect(box(right)).toEqual(rect(v.handles!.right.grip));

    // It follows the focus, and the bar's new visual (a zoom)
    bar(el, 'c').focus();
    flush(el);
    expect(box(overlay(el)!.children[0])).toEqual(rect(el.getBarVisual('c')!.focusRect));
    el.zoomOut();
    flush(el);
    expect(box(overlay(el)!.children[0])).toEqual(rect(el.getBarVisual('c')!.focusRect));
  });

  it('shows no ring for focus from the pointer, until a key is pressed', () => {
    el = mount();
    pointerDown(bar(el, 'a'));
    bar(el, 'a').focus();
    flush(el);
    expect(getEngine(el).inputs.focusVisibleBarId()).toBeNull();
    expect(overlay(el)).toBeNull();
    // The bar still takes the tab stop
    expect(bar(el, 'a').getAttribute('tabindex')).toBe('0');

    anyKey();
    flush(el);
    expect(shapes(el)).toContain('gantt-bar-focus-ring');
    // A pointer press anywhere hides it again
    pointerDown(document.body);
    flush(el);
    expect(overlay(el)).toBeNull();
  });

  it('shows only the ring for bars without handles (milestones, resize off)', () => {
    el = mount();
    anyKey();
    bar(el, 'm').focus();
    flush(el);
    expect(shapes(el)).toEqual(['gantt-bar-focus-ring']);
    el.enableResize = false;
    bar(el, 'a').focus();
    flush(el);
    expect(shapes(el)).toEqual(['gantt-bar-focus-ring']);
  });

  it('shows the grips of the hovered bar (fine pointer), without a ring', () => {
    el = mount();
    getEngine(el).inputs.hoveredBarId.set('a');
    flush(el);
    expect(shapes(el)).toEqual(['gantt-bar-grip', 'gantt-bar-grip']);
    expect(box(overlay(el)!.children[0])).toEqual(rect(el.getBarVisual('a')!.handles!.left.grip));
    // Hover and keyboard focus on two bars: both
    anyKey();
    bar(el, 'c').focus();
    flush(el);
    expect(shapes(el)).toEqual([
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-bar-focus-ring',
      'gantt-bar-grip',
      'gantt-bar-grip',
    ]);
    getEngine(el).inputs.hoveredBarId.set(null);
    bar(el, 'c').blur();
    flush(el);
    expect(overlay(el)).toBeNull();
  });

  it('on a coarse pointer, shows the grips of the selected bars', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', media: q }));
    try {
      el = mount();
      expect(overlay(el)).toBeNull();
      el.setSelectedTasks(['a', 'b']);
      flush(el);
      expect(shapes(el)).toEqual(['gantt-bar-grip', 'gantt-bar-grip', 'gantt-bar-grip', 'gantt-bar-grip']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('paints the ring and grips with --gantt-focus-ring, like every focus ring of the element', () => {
    expect(CANVAS_CSS).toContain(
      '.gantt-bar-focus-ring { fill: none; stroke: var(--gantt-focus-ring); stroke-width: 2px; }',
    );
    expect(CANVAS_CSS).toContain('.gantt-bar-grip { fill: var(--gantt-bg); stroke: var(--gantt-focus-ring);');
    // The bars draw no outline of their own
    expect(CANVAS_CSS).toContain('.gantt-bars-layer > :focus { outline: none; }');
    const rings = TASKLIST_CSS.split('\n').filter(l => l.includes('outline:'));
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.every(l => l.includes('var(--gantt-focus-ring)'))).toBe(true);
  });

  it('adds gantt-bar--critical after the first class of built-in bars on the critical path', () => {
    el = mount({ criticalPath: true });
    const classes = (id: string) => bar(el, id).getAttribute('class')!.split(' ');
    const critical = getEngine(el).graph.critical()!.criticalIds;
    expect(critical.has('a')).toBe(true);
    expect(classes('a')[0]).toBe('gantt-bar');
    expect(classes('a')).toContain('gantt-bar--critical');
    expect(classes('c')).not.toContain('gantt-bar--critical');
    el.options = { viewMode: ViewMode.Day, initialScroll: false };
    flush(el);
    expect(classes('a')).not.toContain('gantt-bar--critical');
  });
});
