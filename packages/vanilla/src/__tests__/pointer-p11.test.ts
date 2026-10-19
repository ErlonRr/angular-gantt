// Pointer editing on the timeline (Gantry 2 phase 11, step 4.1, D11 / D12 / D13, plan §3d–§3e):
// the bar overlay paints core `computeBarOverlay` (the progress grip and the link connectors on the
// hovered, keyboard-focused and — coarse pointers — selected bars; with editing off exactly the
// ring and the resize grips); the pointer hits those targets only where they show; a press on the
// progress grip drags the progress (`ProgressSession`, offset from the grip, one
// `task-progress-changed` on release); a press on a connector that drags starts a drag-mode link,
// a click or tap on one arms a click-mode link that the next press on a bar finishes; a click on a
// deletable arrow selects it (no row click); the cursors follow the part under the pointer; the
// draggable state is `editRules(row).move`. The canvas box is at 0,0 in happy-dom.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  ViewMode,
  hitTestBar,
  type BarVisual,
  type GanttOptions,
  type GanttTask,
  type LinkSide,
  type Rect,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS } from '../styles/base';
import type { GantryEventDetailMap } from '../types';
import '../index';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(8), progress: 20 },
  { id: 'b', name: 'Beta', start: day(10), end: day(16), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(4), end: day(10), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

let el: GantryElement;

function mount(options: GanttOptions = { editing: true }, tasks: GanttTask[] = plan()): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks, options: { ...BASE, ...options }, tooltipEnabled: false });
  document.body.appendChild(el);
  flush();
  return el;
}

const engine = () => getEngine(el);
const flush = () => engine().flushSync();
const canvas = () => engine().dom.canvasContainer;
const $ = <T extends Element = HTMLElement>(sel: string) => el.shadowRoot!.querySelector<T>(sel);
const bar = (id: string) => $<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const overlay = () => $<SVGGElement>('.gantt-bar-overlay');
const shapes = () => [...(overlay()?.children ?? [])].map(c => c.getAttribute('class'));
const box = (n: Element | undefined) => n && ['x', 'y', 'width', 'height', 'rx'].map(a => Number(n.getAttribute(a)));
const rect = (r: Rect & { rx: number }) => [r.x, r.y, r.width, r.height, r.rx];
const cursor = () => canvas().getAttribute('data-cursor');
const visual = (id: string): BarVisual => {
  const { graph: G } = engine();
  return G.barVisual.peek()(G.geoById.peek().get(id)!);
};
const raw = (id: string) =>
  engine()
    .inputs.tasksIn.peek()
    .find(t => t.id === id)!;

type Kind = 'mouse' | 'touch' | 'pen';
const send = (type: string, x: number, y: number, kind: Kind = 'mouse', id = 1): PointerEvent => {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: id,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
  canvas().dispatchEvent(e);
  return e;
};
const click = (x: number, y: number) =>
  canvas().dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: x, clientY: y }));
/** A key on the page, as a keyboard user would press one (focus becomes visible). */
const anyKey = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true }));

/** Centre of a rect */
const mid = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** The mouse hovers `id`'s bar (its body's centre). */
const hover = (id: string) => {
  const v = visual(id);
  send('pointermove', v.x + v.width / 2, v.cy);
};
const connectorHit = (id: string, side: LinkSide) => mid(visual(id).connectors![side].hit);

/** Every pipeline event of `types` the element fires, in order. */
function record(types: readonly (keyof GantryEventDetailMap)[]): { type: string; detail: unknown }[] {
  const log: { type: string; detail: unknown }[] = [];
  for (const type of types) el.addEventListener(type, e => log.push({ type, detail: (e as CustomEvent).detail }));
  return log;
}

/** A point on the arrow `from → to` that is off every bar (canvas px) and its key. */
function arrowPoint(from: string, to: string): { key: string; x: number; y: number } {
  const { graph: G } = engine();
  const link = G.arrowIndex.peek().links.find(l => l.from === from && l.to === to)!;
  const pts = G.arrowVisual.peek()(link)!.points;
  const rowHeight = G.config.peek().rowHeight;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const geo = G.geometries.peek()[Math.floor(y / rowHeight)];
      if (!geo || !hitTestBar(G.barVisual.peek()(geo), x, y)) return { key: link.key, x, y };
    }
  }
  throw new Error('no free point on the arrow');
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  el?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the bar overlay (computeBarOverlay)', () => {
  it('editing off: the hovered bar shows its resize grips only, as before', () => {
    mount({});
    hover('a');
    flush();
    expect(engine().inputs.hoveredBarId.peek()).toBe('a');
    expect(shapes()).toEqual(['gantt-bar-grip', 'gantt-bar-grip']);
    expect(visual('a').progressGrip).toBeNull();
    expect(visual('a').connectors).toBeNull();
  });

  it('editing on: the hovered bar adds its progress grip and its connectors, in that order, at their rects', () => {
    mount();
    hover('a');
    flush();
    expect(shapes()).toEqual([
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-progress-grip',
      'gantt-link-connector',
      'gantt-link-connector',
    ]);
    const v = visual('a');
    const [, , grip, start, end] = overlay()!.children;
    expect(box(grip)).toEqual(rect(v.progressGrip!.grip));
    expect(box(start)).toEqual(rect(v.connectors!.start.dot));
    expect(box(end)).toEqual(rect(v.connectors!.end.dot));
  });

  it('the keyboard-focused bar shows its ring first, then the same shapes', () => {
    mount();
    anyKey();
    bar('c').focus();
    flush();
    expect(engine().inputs.focusVisibleBarId.peek()).toBe('c');
    expect(shapes()).toEqual([
      'gantt-bar-focus-ring',
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-progress-grip',
      'gantt-link-connector',
      'gantt-link-connector',
    ]);
  });

  it('a coarse pointer shows them on the selected bars, and a tap there reaches them', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', media: q }));
    mount();
    expect(overlay()).toBeNull();
    el.setSelectedTasks(['a']);
    flush();
    expect(shapes()).toContain('gantt-progress-grip');
    expect(shapes().filter(c => c === 'gantt-link-connector')).toHaveLength(2);
    // A tap on the end connector of the selected bar arms a click-mode link
    const start = vi.spyOn(engine().ctx.link, 'start');
    const at = connectorHit('a', 'end');
    send('pointerdown', at.x, at.y, 'touch');
    send('pointerup', at.x, at.y, 'touch');
    expect(start).toHaveBeenCalledWith('a', 'end', 'click', at);
    // A long press on the progress grip drags the progress
    engine().ctx.link.cancel(true);
    const g = mid(visual('a').progressGrip!.hit);
    send('pointerdown', g.x, g.y, 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(engine().ctx.progress.active()).toBe(true);
    send('pointerup', g.x, g.y, 'touch');
    expect(engine().ctx.progress.active()).toBe(false);
  });

  it('a link session marks the source connector and recolours the target one, with the same keys', () => {
    mount();
    hover('a');
    flush();
    const nodes = [...overlay()!.children];
    engine().inputs.link.set({
      sourceId: 'a',
      side: 'end',
      mode: 'click',
      preview: { d: 'M0 0', valid: true, targetId: 'c', targetSide: 'start', type: 'FS', reason: null },
    });
    flush();
    // a: the grips hide, the connectors stay (the same nodes); c: its connectors, the start one targeted
    expect(shapes()).toEqual([
      'gantt-link-connector',
      'gantt-link-connector gantt-link-connector--source',
      'gantt-link-connector gantt-link-connector--target',
      'gantt-link-connector',
    ]);
    expect(overlay()!.children[1]).toBe(nodes[4]);
  });
});

describe('pointer targets show before they are hit (D11)', () => {
  it('a bar that shows nothing: its grip spot moves the bar, its connector spot is off the bar', () => {
    mount();
    const g = mid(visual('a').progressGrip!.hit);
    send('pointerdown', g.x, g.y);
    send('pointermove', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(engine().drag.state.peek().kind).toBe('dragging');
    expect(engine().ctx.progress.active()).toBe(false);
    send('pointerup', g.x + DRAG_THRESHOLD_PX, g.y);

    const start = vi.spyOn(engine().ctx.link, 'start');
    const c = connectorHit('c', 'end');
    send('pointermove', 0, 0);
    const down = send('pointerdown', c.x, c.y);
    expect(down.defaultPrevented).toBe(false);
    send('pointerup', c.x, c.y);
    expect(start).not.toHaveBeenCalled();
  });

  it('hovered: the cursor is ew-resize on the progress grip, crosshair on a connector, grab on the body', () => {
    mount();
    hover('a');
    expect(cursor()).toBe('grab');
    const g = mid(visual('a').progressGrip!.hit);
    send('pointermove', g.x, g.y);
    expect(cursor()).toBe('ew-resize');
    const c = connectorHit('a', 'end');
    send('pointermove', c.x, c.y);
    expect(cursor()).toBe('crosshair');
    // Still the hovered bar: its shapes stay
    expect(engine().inputs.hoveredBarId.peek()).toBe('a');
    send('pointermove', c.x + 200, c.y + 200);
    expect(cursor()).toBeNull();
  });
});

describe('progress drag', () => {
  it('previews the progress, emits once on release, commits one undo step; the click after it selects nothing', () => {
    mount();
    const log = record(['task-progress-changed', 'task-dragged', 'tasks-change']);
    const rowClick = vi.fn();
    el.addEventListener('row-click', rowClick);
    hover('a');
    const v = visual('a');
    const g = mid(v.progressGrip!.hit);
    send('pointerdown', g.x, g.y);
    send('pointermove', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(engine().ctx.progress.active()).toBe(true);
    expect(cursor()).toBe('ew-resize');
    expect(engine().drag.state.peek().kind).toBe('idle');

    // The pointer moves the edge by as much as it moves (from the grip, not from the press point)
    const to = g.x + (v.x + v.width * 0.6 - v.progressGrip!.x);
    send('pointermove', to, g.y);
    expect(engine().inputs.progressPreview.peek()).toEqual({ taskId: 'a', progress: 60 });
    flush();
    // The bar draws the preview; its grip follows it, though the hover went with the drag
    expect(engine().inputs.hoveredBarId.peek()).toBeNull();
    const drawn = visual('a');
    expect(drawn.progressGrip!.x).toBeCloseTo(v.x + v.width * 0.6);
    expect(box(overlay()!.querySelector('.gantt-progress-grip')!)).toEqual(rect(drawn.progressGrip!.grip));

    send('pointerup', to, g.y);
    click(to, g.y);
    expect(engine().ctx.progress.active()).toBe(false);
    expect(engine().inputs.progressPreview.peek()).toBeNull();
    expect(log.map(e => e.type)).toEqual(['task-progress-changed', 'tasks-change']);
    expect(log[0].detail).toEqual({ taskId: 'a', oldProgress: 20, newProgress: 60 });
    expect(raw('a').progress).toBe(60);
    expect(el.canUndo).toBe(true);
    expect(rowClick).not.toHaveBeenCalled();
    el.undo();
    expect(raw('a').progress).toBe(20);
  });

  it('starts where the grip is: a press beside the edge does not jump', () => {
    mount();
    hover('c');
    const v = visual('c');
    // 0 %: the grip's target sits right of the left handle, away from the edge
    const g = mid(v.progressGrip!.hit);
    expect(g.x - v.progressGrip!.x).toBeGreaterThan(12);
    send('pointerdown', g.x, g.y);
    send('pointermove', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(engine().inputs.progressPreview.peek()).toEqual({ taskId: 'c', progress: 0 });
    send('pointerup', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(raw('c').progress).toBe(0);
  });

  it('Escape cancels it: no change, the preview goes, the click after it selects nothing', () => {
    mount();
    const changed = vi.fn();
    const rowClick = vi.fn();
    el.addEventListener('task-progress-changed', changed);
    el.addEventListener('row-click', rowClick);
    hover('a');
    const g = mid(visual('a').progressGrip!.hit);
    send('pointerdown', g.x, g.y);
    send('pointermove', g.x + 40, g.y);
    expect(engine().inputs.progressPreview.peek()).not.toBeNull();
    engine().dom.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(engine().ctx.progress.active()).toBe(false);
    expect(engine().inputs.progressPreview.peek()).toBeNull();
    send('pointerup', g.x + 40, g.y);
    click(g.x + 40, g.y);
    expect(changed).not.toHaveBeenCalled();
    expect(rowClick).not.toHaveBeenCalled();
    expect(raw('a').progress).toBe(20);
  });

  it('a read-only task (`editable: false`) shows no grip and is no drag target', () => {
    mount({ editing: true }, [{ ...plan()[0], editable: false }, plan()[2]]);
    hover('a');
    flush();
    expect(shapes()).toEqual([]);
    expect(bar('a').classList.contains('gantt-bar-draggable')).toBe(false);
    expect(bar('c').classList.contains('gantt-bar-draggable')).toBe(true);
  });
});

describe('links from the pointer (D12)', () => {
  it('a press on a connector that drags starts a drag-mode link; released on a bar it finishes there', () => {
    mount();
    const link = engine().ctx.link;
    const start = vi.spyOn(link, 'start');
    const move = vi.spyOn(link, 'move');
    const finish = vi.spyOn(link, 'finish');
    const created = vi.fn();
    const rowClick = vi.fn();
    el.addEventListener('dependency-created', created);
    el.addEventListener('row-click', rowClick);
    hover('a');
    const at = connectorHit('a', 'end');
    const down = send('pointerdown', at.x, at.y);
    expect(down.defaultPrevented).toBe(true);
    expect(start).not.toHaveBeenCalled();
    send('pointermove', at.x + DRAG_THRESHOLD_PX, at.y);
    expect(start).toHaveBeenCalledWith('a', 'end', 'drag', at);
    expect(engine().inputs.link.peek()?.mode).toBe('drag');
    expect(cursor()).toBe('crosshair');
    expect(move).toHaveBeenLastCalledWith(at.x + DRAG_THRESHOLD_PX, at.y);

    // Onto the left part of c's bar (row 3): its start side, an FS link a → c
    const c = visual('c');
    const to = { x: c.x + 4, y: c.cy };
    send('pointermove', to.x, to.y);
    send('pointerup', to.x, to.y);
    click(to.x, to.y);
    expect(move).toHaveBeenLastCalledWith(to.x, to.y);
    expect(finish).toHaveBeenCalledOnce();
    expect(engine().inputs.link.peek()).toBeNull();
    expect(created).toHaveBeenCalledOnce();
    expect(created.mock.calls[0][0].detail).toMatchObject({ fromId: 'a', toId: 'c', type: 'FS' });
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('Escape during a link drag cancels it quietly', () => {
    mount();
    const cancel = vi.spyOn(engine().ctx.link, 'cancel');
    hover('a');
    const at = connectorHit('a', 'end');
    send('pointerdown', at.x, at.y);
    send('pointermove', at.x + 20, at.y + 20);
    expect(engine().ctx.link.active()).toBe(true);
    engine().dom.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(cancel).toHaveBeenCalledWith(true);
    expect(engine().ctx.link.active()).toBe(false);
  });

  it('a click on a connector arms a click-mode link: the pointer moves its preview, a click on a bar finishes it', () => {
    mount();
    const link = engine().ctx.link;
    const start = vi.spyOn(link, 'start');
    const move = vi.spyOn(link, 'move');
    const finish = vi.spyOn(link, 'finish');
    const created = vi.fn();
    const rowClick = vi.fn();
    el.addEventListener('dependency-created', created);
    el.addEventListener('row-click', rowClick);
    hover('a');
    const at = connectorHit('a', 'end');
    send('pointerdown', at.x, at.y);
    send('pointerup', at.x, at.y);
    click(at.x, at.y);
    expect(start).toHaveBeenCalledWith('a', 'end', 'click', at);
    expect(engine().inputs.link.peek()?.mode).toBe('click');
    // The arming click selects no row
    expect(rowClick).not.toHaveBeenCalled();

    const c = visual('c');
    send('pointermove', c.x + 4, c.cy);
    expect(move).toHaveBeenLastCalledWith(c.x + 4, c.cy);
    expect(cursor()).toBe('crosshair');
    const down = send('pointerdown', c.x + 4, c.cy);
    expect(down.defaultPrevented).toBe(true);
    expect(finish).toHaveBeenCalledOnce();
    send('pointerup', c.x + 4, c.cy);
    click(c.x + 4, c.cy);
    expect(created).toHaveBeenCalledOnce();
    expect(created.mock.calls[0][0].detail).toMatchObject({ fromId: 'a', toId: 'c', type: 'FS' });
    expect(rowClick).not.toHaveBeenCalled();
    expect(engine().inputs.link.peek()).toBeNull();
  });

  it('a press off the bars while armed cancels it (announced); a touch that pans keeps it armed', () => {
    mount();
    const link = engine().ctx.link;
    const cancel = vi.spyOn(link, 'cancel');
    const finish = vi.spyOn(link, 'finish');
    hover('a');
    const at = connectorHit('a', 'end');
    send('pointerdown', at.x, at.y);
    send('pointerup', at.x, at.y);
    expect(link.active()).toBe(true);

    // A touch that pans: still armed
    send('pointerdown', 600, 10, 'touch', 2);
    send('pointermove', 640, 60, 'touch', 2);
    expect(link.active()).toBe(true);

    // A mouse press on nothing: cancelled, not quietly
    send('pointerdown', 900, 5);
    expect(cancel).toHaveBeenCalledWith();
    expect(finish).not.toHaveBeenCalled();
    expect(link.active()).toBe(false);
  });

  it('a tap on a bar finishes a click-mode link (touch acts on release)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', media: q }));
    mount();
    el.setSelectedTasks(['a']);
    flush();
    const created = vi.fn();
    el.addEventListener('dependency-created', created);
    const at = connectorHit('a', 'end');
    send('pointerdown', at.x, at.y, 'touch');
    send('pointerup', at.x, at.y, 'touch');
    expect(engine().ctx.link.active()).toBe(true);
    const c = visual('c');
    send('pointerdown', c.x + 4, c.cy, 'touch');
    expect(created).not.toHaveBeenCalled();
    send('pointerup', c.x + 4, c.cy, 'touch');
    expect(created).toHaveBeenCalledOnce();
  });
});

describe('arrows (D13)', () => {
  it('with deletion on: the cursor is pointer over an arrow, a click selects it and no row', () => {
    mount();
    const rowClick = vi.fn();
    el.addEventListener('row-click', rowClick);
    const selectAt = vi.spyOn(engine().ctx.link, 'selectAt');
    const p = arrowPoint('a', 'b');
    send('pointermove', p.x, p.y);
    expect(cursor()).toBe('pointer');
    send('pointerdown', p.x, p.y);
    send('pointerup', p.x, p.y);
    click(p.x, p.y);
    expect(selectAt).toHaveBeenCalledWith(p.x, p.y);
    expect(engine().inputs.selectedLinkKey.peek()).toBe(p.key);
    expect(rowClick).not.toHaveBeenCalled();
    // A click on a bar selects the row, not a link
    hover('c');
    const c = visual('c');
    send('pointerdown', c.x + c.width / 2, c.cy);
    send('pointerup', c.x + c.width / 2, c.cy);
    click(c.x + c.width / 2, c.cy);
    expect(engine().inputs.selectedLinkKey.peek()).toBeNull();
    expect(rowClick).toHaveBeenCalledOnce();
  });

  it('editing off: no pointer cursor, no link selection, the click selects the row as before', () => {
    mount({});
    const rowClick = vi.fn();
    el.addEventListener('row-click', rowClick);
    const selectAt = vi.spyOn(engine().ctx.link, 'selectAt');
    const p = arrowPoint('a', 'b');
    send('pointermove', p.x, p.y);
    expect(cursor()).toBeNull();
    click(p.x, p.y);
    expect(selectAt).not.toHaveBeenCalled();
    expect(rowClick).toHaveBeenCalledOnce();
  });
});

describe('draggable bars follow editRules(row).move', () => {
  it('a rolled-up parent (rollup.dates) is not draggable; its children are', () => {
    mount({ rollup: true }, [
      { id: 'p', name: 'Parent', start: day(2), end: day(12) },
      { id: 'k', name: 'Kid', parentId: 'p', start: day(3), end: day(9) },
    ]);
    expect(bar('p').classList.contains('gantt-bar-draggable')).toBe(false);
    expect(bar('k').classList.contains('gantt-bar-draggable')).toBe(true);
    const v = visual('p');
    send('pointermove', v.x + v.width / 2, v.cy);
    expect(cursor()).toBeNull();
    send('pointerdown', v.x + v.width / 2, v.cy);
    send('pointermove', v.x + v.width / 2 + 40, v.cy);
    expect(engine().drag.state.peek().kind).toBe('idle');
  });
});

describe('styles', () => {
  it('cursors, connectors, the progress grip and the link preview have their rules', () => {
    expect(BASE_CSS).toMatch(/\.gantry-canvas-container\[data-cursor="crosshair"\][^{]*\{\s*cursor: crosshair;/);
    expect(BASE_CSS).toMatch(/\.gantry-canvas-container\[data-cursor="pointer"\][^{]*\{\s*cursor: pointer;/);
    expect(BASE_CSS).toContain(
      '.gantt-progress-grip { fill: var(--gantt-bg); stroke: var(--gantt-focus-ring); stroke-width: 1.5px; }',
    );
    expect(BASE_CSS).toContain(
      '.gantt-link-connector { fill: var(--gantt-bg); stroke: var(--gantt-focus-ring); stroke-width: 1.5px; }',
    );
    expect(BASE_CSS).toContain('.gantt-link-connector--target { fill: var(--gantt-focus-ring); }');
    expect(BASE_CSS).toContain('.gantt-link-connector--invalid { stroke: var(--gantt-status-overdue); }');
    expect(BASE_CSS).toMatch(/\.gantt-link-preview \{[^}]*stroke-dasharray: 4 3;/);
  });
});
