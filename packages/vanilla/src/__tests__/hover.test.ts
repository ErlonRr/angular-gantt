// Row hover (Gantry 2 phase 10, step 4.1, D4, §3c of its plan): the row under a mouse or pen
// pointer, in either pane, is `hoveredRowId`. The timeline shows it as one `rect.gantt-row-hover`
// right after `g.gantt-rows` (x 0, the row's y and height, the timeline width, its fill the
// stylesheet's `var(--gantt-row-hover-bg)`), attached only while a mounted row is hovered and the
// view is not `table`; the task list as `.gantt-tl-row--hover` (a background-image tint). The
// task list hears it by delegation (`pointerover` / `pointerleave`), the timeline by geometry
// (core `rowIndexAtY`); leaving, a scroll of either pane and a drag starting clear it; a touch
// never hovers. Forced colours hide both.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { CANVAS_CSS } from '../styles/canvas.css';
import { TASKLIST_CSS } from '../styles/tasklist.css';
import { FORCED_COLORS_CSS } from '../styles/forced-colors.css';
import '../index';

const RH = 36;
const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: (i * 7) % 100,
  }));
}

let el: GantryElement;

function mount(n = 6, extra: Partial<GantryElement> = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: plan(n), options: { viewMode: ViewMode.Day, initialScroll: false } }, extra);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const engine = () => getEngine(el);
const $ = <T extends Element = HTMLElement>(sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string) => [...el.shadowRoot!.querySelectorAll<T>(sel)];
const hoverRect = () => $<SVGRectElement>('.gantt-row-hover');
const tlRow = (id: string) => $(`.gantt-tl-row[data-task-id="${id}"]`)!;
const hoveredRows = () => $$('.gantt-tl-row--hover').map(r => r.dataset['taskId']);
const hovered = () => engine().inputs.hoveredRowId.peek();
/** Id of the task shown at visible row `i` (the rows go by start date: ids repeat their order every 20) */
const idAt = (i: number) => engine().graph.visibleRows.peek()[i].task.id;
const canvas = () => engine().dom.canvasContainer;

type Kind = 'mouse' | 'pen' | 'touch';
const pointer = (type: string, x: number, y: number, kind: Kind = 'mouse', bubbles = true) =>
  new PointerEvent(type, {
    bubbles,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
/** A move over the timeline at canvas y (the canvas box is at 0,0 in happy-dom) */
const moveOnTimeline = (y: number, kind: Kind = 'mouse', x = 2) =>
  canvas().dispatchEvent(pointer('pointermove', x, y, kind));
/** The pointer entering a task-list row (on one of its cells) */
const overRow = (id: string, kind: Kind = 'mouse') =>
  (tlRow(id).querySelector('.gantt-tl-cell') ?? tlRow(id)).dispatchEvent(pointer('pointerover', 0, 0, kind));
const rows = () => $('.gantt-tl-rows')!;

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  el?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('row hover: the timeline', () => {
  it('a mouse over a timeline row hovers it: the rect sits right after g.gantt-rows over that row', () => {
    mount();
    expect(hoverRect()).toBeNull();
    moveOnTimeline(2 * RH + 5);
    expect(hovered()).toBe('t2');
    flush(el);
    const rect = hoverRect()!;
    expect(rect).toBe(engine().dom.rowHover);
    expect(rect.previousElementSibling?.getAttribute('class')).toBe('gantt-rows');
    expect(rect.nextElementSibling?.getAttribute('class')).toBe('gantt-bands');
    const geo = engine().graph.geoById.peek().get('t2')!;
    expect(Number(rect.getAttribute('x'))).toBe(0);
    expect(Number(rect.getAttribute('y'))).toBe(geo.y);
    expect(Number(rect.getAttribute('height'))).toBe(geo.height);
    expect(Number(rect.getAttribute('width'))).toBe(engine().graph.timeline.peek().totalWidth);
    expect(rect.getAttribute('aria-hidden')).toBe('true');
    expect(rect.getAttribute('pointer-events')).toBe('none');
    // The fill is the stylesheet's (the theme variable), never a CSSOM paint or an attribute
    expect(rect.style.getPropertyValue('fill')).toBe('');
    expect(rect.hasAttribute('fill')).toBe(false);
    // The task list's row shows it too
    expect(hoveredRows()).toEqual(['t2']);

    // Another row: the same rect moves
    moveOnTimeline(4 * RH + 1);
    flush(el);
    expect(hoverRect()).toBe(rect);
    expect(Number(rect.getAttribute('y'))).toBe(4 * RH);
    expect(hoveredRows()).toEqual(['t4']);
  });

  it('below the last row nothing is hovered; a pen hovers like a mouse, a touch never', () => {
    mount(3);
    moveOnTimeline(3 * RH + 5);
    expect(hovered()).toBeNull();
    moveOnTimeline(RH + 5, 'pen');
    expect(hovered()).toBe('t1');
    canvas().dispatchEvent(pointer('pointerleave', 0, 0, 'pen', false));
    expect(hovered()).toBeNull();
    moveOnTimeline(RH + 5, 'touch');
    expect(hovered()).toBeNull();
    flush(el);
    expect(hoverRect()).toBeNull();
  });

  it('leaving the canvas clears it; a finger lifting does not count as leaving', () => {
    mount();
    moveOnTimeline(RH + 5);
    flush(el);
    expect(hoverRect()).not.toBeNull();
    canvas().dispatchEvent(pointer('pointerleave', 0, 0, 'touch', false));
    expect(hovered()).toBe('t1');
    canvas().dispatchEvent(pointer('pointerleave', 0, 0, 'mouse', false));
    expect(hovered()).toBeNull();
    flush(el);
    expect(hoverRect()).toBeNull();
    expect(hoveredRows()).toEqual([]);
  });

  it('a drag starting clears it, the moves while dragging hover nothing, the release hovers again', () => {
    mount();
    const v = el.getBarVisual('t1')!;
    const x = v.x + v.width / 2;
    moveOnTimeline(v.cy, 'mouse', x);
    expect(hovered()).toBe('t1');
    canvas().dispatchEvent(pointer('pointerdown', x, v.cy));
    canvas().dispatchEvent(pointer('pointermove', x + 10, v.cy));
    expect(engine().drag.state.peek().kind).toBe('dragging');
    expect(hovered()).toBeNull();
    canvas().dispatchEvent(pointer('pointermove', x + 20, 3 * RH + 5));
    expect(hovered()).toBeNull();
    // The task list does not hover while a bar is dragged
    overRow('t3');
    expect(hovered()).toBeNull();
    flush(el);
    expect(hoverRect()).toBeNull();
    canvas().dispatchEvent(pointer('pointerup', x + 20, v.cy));
    expect(hovered()).toBe('t1');
  });

  it('a scroll of either pane clears it until the pointer moves again', () => {
    mount(40);
    for (const pane of [engine().dom.viewport, engine().dom.panel]) {
      moveOnTimeline(RH + 5);
      expect(hovered()).toBe(idAt(1));
      pane.dispatchEvent(new Event('scroll'));
      expect(hovered()).toBeNull();
    }
    flush(el);
    expect(hoverRect()).toBeNull();
  });

  it('a disconnect clears it: a chart moved in the page shows no stale hover', () => {
    mount();
    moveOnTimeline(RH + 5);
    flush(el);
    expect(hoverRect()).not.toBeNull();
    el.remove();
    expect(hovered()).toBeNull();
    document.body.appendChild(el);
    flush(el);
    expect(hoverRect()).toBeNull();
    expect(hoveredRows()).toEqual([]);
  });

  it('is hidden in the table view and while the hovered row is not mounted', () => {
    mount(300);
    const { inputs: I } = engine();
    const third = idAt(3);
    I.hoveredRowId.set(third);
    flush(el);
    expect(hoverRect()).not.toBeNull();

    el.setView('table');
    flush(el);
    expect(hoverRect()).toBeNull();
    el.setView('split');
    flush(el);
    expect(hoverRect()).not.toBeNull();

    // A row far below the virtual window
    I.hoveredRowId.set(idAt(250));
    flush(el);
    expect(hoverRect()).toBeNull();
    expect(hoveredRows()).toEqual([]);
    // Removed: gone too
    I.hoveredRowId.set(third);
    flush(el);
    expect(hoverRect()).not.toBeNull();
    el.tasks = plan(300).filter(t => t.id !== third);
    flush(el);
    expect(hoverRect()).toBeNull();
  });
});

describe('row hover: the task list', () => {
  it('pointerover a row (any cell) hovers it in both panes; leaving the rows clears it', () => {
    mount();
    overRow('t3');
    expect(hovered()).toBe('t3');
    flush(el);
    expect(hoveredRows()).toEqual(['t3']);
    expect(tlRow('t3').classList.contains('gantt-tl-row--hover')).toBe(true);
    const geo = engine().graph.geoById.peek().get('t3')!;
    expect(Number(hoverRect()!.getAttribute('y'))).toBe(geo.y);

    overRow('t0', 'pen');
    flush(el);
    expect(hoveredRows()).toEqual(['t0']);

    rows().dispatchEvent(pointer('pointerleave', 0, 0, 'mouse', false));
    expect(hovered()).toBeNull();
    flush(el);
    expect(hoveredRows()).toEqual([]);
    expect(hoverRect()).toBeNull();
  });

  it('a touch never hovers, and a finger lifting does not clear a hover', () => {
    mount();
    overRow('t1', 'touch');
    expect(hovered()).toBeNull();
    overRow('t1');
    rows().dispatchEvent(pointer('pointerleave', 0, 0, 'touch', false));
    expect(hovered()).toBe('t1');
  });

  it('a recycled row element never keeps the class: it follows the row id', () => {
    mount(300);
    const id = idAt(2);
    overRow(id);
    flush(el);
    const node = tlRow(id);
    expect(node.classList.contains('gantt-tl-row--hover')).toBe(true);
    // Scroll the window by hand (no scroll event: the hover stays) so the row's node is recycled
    engine().inputs.scrollTop.set(RH * 100);
    flush(el);
    expect(hoveredRows()).toEqual([]);
    expect(node.isConnected && node.dataset['taskId'] !== id && node.classList.contains('gantt-tl-row--hover')).toBe(
      false,
    );
    engine().inputs.scrollTop.set(0);
    flush(el);
    expect(hoveredRows()).toEqual([id]);
  });

  it('a hover change repaints the hover and task-list regions only (O(1) canvas DOM per move)', () => {
    mount(40);
    const { regionRuns: runs } = engine();
    const before = { ...runs };
    overRow('t1');
    flush(el);
    overRow('t2');
    flush(el);
    const ran = Object.keys(runs).filter(r => runs[r] !== before[r]);
    // The task list owns its rows' class; focus restore runs only after a task-list capture
    expect(ran).toEqual(expect.arrayContaining(['hover', 'tasklist']));
    for (const r of ran) expect(['hover', 'tasklist', 'focus-restore']).toContain(r);
  });

  it('nothing hovered: a vertical scroll does not run the hover region', () => {
    mount(300);
    const { regionRuns: runs } = engine();
    const before = runs['hover'];
    engine().inputs.scrollTop.set(RH * 50);
    flush(el);
    expect(runs['hover']).toBe(before);
  });
});

describe('row hover: styles', () => {
  it('the timeline rect takes var(--gantt-row-hover-bg) from the stylesheet', () => {
    expect(CANVAS_CSS).toContain('.gantt-row-hover { fill: var(--gantt-row-hover-bg); }');
  });

  it('the task-list row gets the tint as a background image; the old :hover filter is gone', () => {
    expect(TASKLIST_CSS).toContain(
      '.gantt-tl-row--hover { background-image: linear-gradient(var(--gantt-row-hover-bg), var(--gantt-row-hover-bg)); }',
    );
    expect(TASKLIST_CSS).not.toContain('.gantt-tl-row:hover');
    expect(TASKLIST_CSS).not.toContain('brightness');
  });

  it('forced colours hide both (the row backgrounds stay plain)', () => {
    expect(FORCED_COLORS_CSS).toContain('.gantt-row-hover { display: none; }');
    expect(FORCED_COLORS_CSS).toContain('.gantt-tl-row--hover { background-image: none; }');
  });

  it('the theme variable is on the host sheet (rowHoverBg)', () => {
    mount();
    const sheets = [...el.shadowRoot!.adoptedStyleSheets].reverse();
    const host = sheets.map(s => s.cssRules[0] as CSSStyleRule | undefined).find(r => r?.selectorText === ':host');
    expect(host?.style.getPropertyValue('--gantt-row-hover-bg').trim()).toBe('rgba(15, 23, 42, 0.04)');
  });
});
