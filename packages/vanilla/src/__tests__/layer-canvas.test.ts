// Keyed canvas layers (Gantry 2 phase 6, step 2.2): bars keyed by task id and patched in place
// (`createBar` / `patchBar`), custom bars re-rendered only when their context changes, arrows
// from the interval index keyed by link, row backgrounds and separators keyed by task id,
// annotations keyed by index, and the persistent today line and drag ghost.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeBarVisual,
  PAINTS,
  ViewMode,
  type BarVisual,
  type GanttAnnotation,
  type GanttTask,
} from '@gantryjs/core';
import { arrowLinks, indexArrowLinks, type ArrowIndexProbe } from '../../../core/src/render/arrow-index';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { createBar, patchBar } from '../paint/bars';
import { createArrow, patchArrow } from '../paint/arrows';
import '../index';

const RH = 36;
const DAY = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

/** Runs the element's queued frame work now. */
const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks around today, each depending on the previous one. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: DAY(-10 + (i % 20)),
    end: DAY(-3 + (i % 20)),
    progress: (i * 7) % 100,
    ...(i > 0 ? { dependency: `t${i - 1}` } : {}),
  }));
}

type Props = Partial<Pick<GantryElement, 'tasks' | 'options' | 'annotations'>>;

function mount(props: Props): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = SVGElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll<SVGElement>(sel)];
const bar = (el: GantryElement, id: string) => $(el, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const barIds = (el: GantryElement) => $$(el, '.gantt-bars-layer > [data-task-id]').map(b => b.dataset['taskId']);

function scrollTo(el: GantryElement, top: number): void {
  const viewport = $<HTMLElement>(el, '.gantry-canvas-viewport')!;
  viewport.scrollTop = top;
  viewport.dispatchEvent(new Event('scroll'));
  flush(el);
}

/** Pointer-drags the bar of `id` by `days` (the drop only when `drop`). */
function drag(el: GantryElement, id: string, days: number, drop = true): void {
  const canvas = $(el, '.gantry-canvas-container')!;
  const px = getEngine(el).graph.timeline().pxPerDay;
  bar(el, id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 + days * px, pointerId: 1 }));
  flush(el);
  if (!drop) return;
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + days * px, pointerId: 1 }));
  flush(el);
}

/** The same nodes, in any order. */
const sameNodes = (a: readonly Element[], b: readonly Element[]) =>
  a.length === b.length && a.every(n => b.includes(n));

/** Children of `parent` added and removed between two snapshots. */
function diff(before: readonly Element[], after: readonly Element[]) {
  return {
    added: after.filter(n => !before.includes(n)).length,
    removed: before.filter(n => !after.includes(n)).length,
  };
}

describe('canvas layers', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  describe('bars', () => {
    it('scrolling one row swaps one bar at each end of the window and writes nothing to the others', () => {
      el = mount({ tasks: plan(300), options: { initialScroll: false } });
      scrollTo(el, RH * 20);
      const layer = $(el, '.gantt-bars-layer')!;
      const before = [...layer.children];
      const observer = new MutationObserver(() => {});
      observer.observe(layer, { childList: true, attributes: true, subtree: true });

      scrollTo(el, RH * 21);
      const records = observer.takeRecords();
      observer.disconnect();
      const after = [...layer.children];
      expect(diff(before, after)).toEqual({ added: 1, removed: 1 });
      // The new bar is built before it is attached: the kept bars see no attribute write at all
      expect(records.filter(r => r.type === 'attributes')).toEqual([]);
      expect(after.slice(0, -1)).toEqual(before.slice(1));
      // Rows follow the same rule
      expect($$(el, '.gantt-rows rect')).toHaveLength(after.length);
    });

    it('keeps bar nodes across a selection, a drag and its drop, and dims the dragged bar through the CSSOM', () => {
      el = mount({ tasks: plan(10), options: { viewMode: ViewMode.Day, initialScroll: false } });
      const nodes = $$(el, '.gantt-bars-layer > [data-task-id]');
      const t1 = bar(el, 't1');
      const body = t1.querySelector<SVGPathElement>('.gantt-bar-body')!;

      el.setSelectedTasks(['t1']);
      flush(el);
      expect(bar(el, 't1')).toBe(t1);
      expect(t1.querySelector('.gantt-bar-body')).toBe(body);
      expect(body.getAttribute('stroke-width')).toBe('1.5');
      expect(body.style.getPropertyValue('stroke')).toBe(PAINTS.selectionStroke);

      drag(el, 't1', 2, false);
      expect(bar(el, 't1')).toBe(t1);
      expect(t1.style.getPropertyValue('opacity')).toBe('0.35');
      expect(t1.hasAttribute('opacity')).toBe(false);
      expect(bar(el, 't2').style.getPropertyValue('opacity')).toBe('');

      const canvas = $(el, '.gantry-canvas-container')!;
      const px = getEngine(el).graph.timeline().pxPerDay;
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + 2 * px, pointerId: 1 }));
      flush(el);
      // The task moved (after t2 now, rows go by start date): its bar is patched in place and
      // moved to its row's place; every bar is the same node
      expect(sameNodes($$(el, '.gantt-bars-layer > [data-task-id]'), nodes)).toBe(true);
      expect(barIds(el)).toEqual(
        getEngine(el)
          .graph.visibleRows()
          .map(r => r.task.id),
      );
      expect(barIds(el).slice(0, 3)).toEqual(['t0', 't2', 't1']);
      expect(t1.style.getPropertyValue('opacity')).toBe('');
      expect(t1.querySelector('.gantt-bar-body')).toBe(body);
      expect(el.getBarVisual('t1')?.path).toBe(body.getAttribute('d'));

      // A selection cleared and a zoom patch the same nodes too
      el.clearSelection();
      el.zoomOut();
      flush(el);
      expect(sameNodes($$(el, '.gantt-bars-layer > [data-task-id]'), nodes)).toBe(true);
      expect(body.hasAttribute('stroke-width')).toBe(false);
      expect(body.getAttribute('d')).toBe(el.getBarVisual('t1')?.path);
    });

    it('getBarVisual works for a row outside the virtual window (same memo as the painted bars)', () => {
      el = mount({ tasks: plan(300), options: { initialScroll: false } });
      expect($(el, '.gantt-bars-layer > [data-task-id="t250"]')).toBeNull();
      const { graph: G, inputs: I } = getEngine(el);
      const geo = G.geoById().get('t250')!;
      const { fontPx, barTextColor } = G.metrics();
      const expected = computeBarVisual({
        geo,
        cfg: G.config(),
        toX: G.timeline().toX,
        fontPx,
        barTextColor,
        isCritical: false,
        resizable: I.enableDrag() && I.enableResize(),
      });
      const v = el.getBarVisual('t250');
      expect(v).toEqual(expected);
      expect(el.getBarVisual('t250')).toBe(v);
      expect(el.getBarVisual('nope')).toBeUndefined();
    });

    it('calls a custom renderBar only when its row context changes, and swaps the keyed slot', () => {
      el = mount({ tasks: plan(10), options: { viewMode: ViewMode.Day, initialScroll: false } });
      const calls: string[] = [];
      el.renderBar = (ctx, renderDefault) => {
        calls.push(ctx.row.task.id);
        const g = renderDefault();
        g.classList.add('custom-bar');
        return g;
      };
      flush(el);
      const mounted = barIds(el);
      expect(calls).toEqual(mounted);
      expect($$(el, '.gantt-bars-layer > .custom-bar')).toHaveLength(mounted.length);

      // Selection: only that row
      calls.length = 0;
      const old = bar(el, 't2');
      const neighbour = bar(el, 't3');
      el.setSelectedTasks(['t2']);
      flush(el);
      expect(calls).toEqual(['t2']);
      expect(old.isConnected).toBe(false);
      expect(bar(el, 't2')).not.toBe(old);
      expect(bar(el, 't2').getAttribute('role')).toBe('listitem');
      expect(bar(el, 't2').getAttribute('aria-label')).toContain('Task 2');
      expect(bar(el, 't3')).toBe(neighbour);
      expect(barIds(el)).toEqual(mounted);

      // Drag moves: nothing re-rendered, the node is dimmed
      calls.length = 0;
      drag(el, 't3', 1, false);
      expect(calls).toEqual([]);
      expect(neighbour.style.getPropertyValue('opacity')).toBe('0.35');
      // The drop changes that task only (the timeline keeps its range)
      const tl = getEngine(el).graph.timeline();
      const canvas = $(el, '.gantry-canvas-container')!;
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + tl.pxPerDay, pointerId: 1 }));
      flush(el);
      expect(getEngine(el).graph.timeline().start.getTime()).toBe(tl.start.getTime());
      expect(calls).toEqual(['t3']);

      // The theme is part of the context
      calls.length = 0;
      el.patchTheme({ barColor: '#0F766E' });
      flush(el);
      expect(calls.sort()).toEqual([...mounted].sort());

      // A renderer returning null falls back to the built-in bar; removing it restores built-ins
      el.renderBar = () => null;
      flush(el);
      expect($$(el, '.gantt-bars-layer > .custom-bar')).toHaveLength(0);
      expect(bar(el, 't0').querySelector('.gantt-bar-body')).not.toBeNull();
      el.renderBar = undefined;
      flush(el);
      expect(barIds(el)).toEqual(mounted);
      expect(bar(el, 't0').classList.contains('gantt-bar-draggable')).toBe(true);
    });

    it('calls a custom renderBar for the newly mounted row only when scrolling one row', () => {
      el = mount({ tasks: plan(300), options: { initialScroll: false } });
      scrollTo(el, RH * 20);
      const calls: string[] = [];
      el.renderBar = (ctx, renderDefault) => {
        calls.push(ctx.row.task.id);
        return renderDefault();
      };
      flush(el);
      const before = barIds(el);
      calls.length = 0;
      scrollTo(el, RH * 21);
      const after = barIds(el);
      expect(after.slice(0, -1)).toEqual(before.slice(1));
      expect(calls).toEqual([after.at(-1)]);
    });

    it('renders repeated task ids without a render error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const [a] = plan(1);
      el = mount({ tasks: [a, { ...a, name: 'Copy' }], options: { initialScroll: false } });
      expect(error).not.toHaveBeenCalled();
      expect(barIds(el)).toEqual(['t0', 't0']);
      expect($$(el, '.gantt-rows rect')).toHaveLength(2);
    });
  });

  describe('createBar / patchBar', () => {
    const visual = (over: Partial<BarVisual> = {}): BarVisual => ({
      kind: 'task',
      x: 10,
      y: 5,
      width: 100,
      height: 20,
      cy: 15,
      rx: 4,
      path: 'M10,5H110V25H10Z',
      tone: 'default',
      paint: { body: 'var(--gantt-bar)', progress: 'var(--gantt-progress)', label: 'var(--gantt-bar-text-on-bar)' },
      progress: { path: 'M10,5H60V25H10Z', opacity: 0.35 },
      label: { text: 'Build', x: 60, y: 15, anchor: 'middle', inside: true },
      baseline: null,
      caps: null,
      handles: null,
      ...over,
    });
    const parts = (g: Element) => [...g.children].map(c => c.getAttribute('class'));

    it('adds and removes the optional parts in painting order, keeping the others in place', () => {
      const g = createBar(visual(), { fontPx: 12, selected: false, className: 'mine', draggable: true });
      expect(g.getAttribute('class')).toBe('gantt-bar gantt-bar--task mine gantt-bar-draggable');
      expect(parts(g)).toEqual(['gantt-bar-body', 'gantt-bar-progress', 'gantt-bar-label']);
      const [body, , label] = [...g.children] as SVGElement[];

      patchBar(
        g,
        visual({
          kind: 'group',
          progress: null,
          caps: 'M0,0',
          baseline: { x: 10, width: 80, y: 30 },
          label: { text: 'Build', x: 120, y: 15, anchor: 'start', inside: false },
        }),
        { fontPx: 12, selected: true },
      );
      expect(g.getAttribute('class')).toBe('gantt-bar gantt-bar--group');
      expect(parts(g)).toEqual([
        'gantt-bar-body',
        'gantt-bar-caps',
        'gantt-bar-baseline',
        'gantt-bar-label gantt-bar-label--outside',
      ]);
      expect(g.firstElementChild).toBe(body);
      expect(g.lastElementChild).toBe(label);
      expect(body.getAttribute('stroke-width')).toBe('1.5');
      expect(g.querySelector('.gantt-bar-baseline')!.getAttribute('x2')).toBe('90');

      patchBar(g, visual({ label: null }), { fontPx: 12, selected: false });
      expect(parts(g)).toEqual(['gantt-bar-body', 'gantt-bar-progress']);
      expect(body.hasAttribute('stroke-width')).toBe(false);
      expect(body.style.getPropertyValue('stroke')).toBe('');
    });

    it('skips a patch with the same visual and options, and writes only what changed otherwise', () => {
      const v = visual();
      const g = createBar(v, { fontPx: 12, selected: false });
      const observer = new MutationObserver(() => {});
      observer.observe(g, { childList: true, attributes: true, characterData: true, subtree: true });
      patchBar(g, v, { fontPx: 12, selected: false });
      // An equal visual (a new object) writes nothing either: every write is cached
      patchBar(g, visual(), { fontPx: 12, selected: false });
      expect(observer.takeRecords()).toEqual([]);
      patchBar(g, visual({ path: 'M0,0' }), { fontPx: 12, selected: false });
      const records = observer.takeRecords();
      observer.disconnect();
      expect(records.map(r => `${r.type}:${r.attributeName}`)).toEqual(['attributes:d']);
    });

    it('patches an arrow in place, adding and removing its lag label', () => {
      const a = {
        d: 'M0,0H10',
        head: '10,0 6,-3 6,3',
        paint: 'var(--gantt-arrow)',
        width: 1.5,
        dashed: false,
        critical: false,
        lagLabel: null,
      };
      const g = createArrow(a, 13);
      expect(g.getAttribute('class')).toBe('gantt-arrow');
      expect(g.children).toHaveLength(2);
      const path = g.firstElementChild!;
      patchArrow(g, { ...a, critical: true, dashed: true, lagLabel: { text: '+2d', x: 5, y: 5 } }, 13);
      expect(g.getAttribute('class')).toBe('gantt-arrow gantt-arrow--critical');
      expect(g.firstElementChild).toBe(path);
      expect(path.getAttribute('stroke-dasharray')).toBe('5 3');
      expect(g.lastElementChild!.textContent).toBe('+2d');
      expect(g.lastElementChild!.getAttribute('font-size')).toBe('11');
      patchArrow(g, a, 13);
      expect(g.children).toHaveLength(2);
      expect(path.hasAttribute('stroke-dasharray')).toBe(false);
    });
  });

  describe('arrows', () => {
    it('queries the interval index in O(log n + k): 10k rows and 5k links visit at most 50 + k nodes', () => {
      // Seeded PRNG: links to a recent row, and every 250th link across thousands of rows
      let seed = 42;
      const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
      const tasks: GanttTask[] = Array.from({ length: 10_000 }, (_, i) => {
        // Root rows go by start date: 50 rows per day keeps the row order the task order
        const day = Math.floor(i / 50);
        const t: GanttTask = { id: `t${i}`, name: `T${i}`, start: DAY(day), end: DAY(day + 5) };
        if (i % 2 === 1) {
          const from = i % 500 === 1 ? Math.floor(rand() * i) : i - 1 - Math.floor(rand() * Math.min(i - 1, 60));
          t.dependency = `t${from}`;
        }
        return t;
      });
      el = mount({ tasks, options: { initialScroll: false } });
      scrollTo(el, RH * 5000);

      const { graph: G } = getEngine(el);
      const { top, bottom } = G.windowSpan();
      expect(G.arrowIndex().size).toBe(5000);
      const probe: ArrowIndexProbe = { visits: 0 };
      const index = indexArrowLinks(arrowLinks(G.tasks(), G.geoById()), probe);
      const hits = index.query(top, bottom);
      const k = hits.length;
      expect(k).toBeGreaterThan(0);
      expect(probe.visits).toBeLessThanOrEqual(50 + k);
      // The layer paints exactly the links of that query, in drawing order
      expect(
        G.arrowIndex()
          .query(top, bottom)
          .map(l => l.key),
      ).toEqual(hits.map(l => l.key));
      expect($$(el, '.gantt-arrows > g')).toHaveLength(k);
    });

    it('keys arrows by link: a scroll keeps the links still in the window and reuses their visuals', () => {
      el = mount({ tasks: plan(300), options: { initialScroll: false } });
      scrollTo(el, RH * 50);
      const { graph: G, runs } = getEngine(el);
      const arrowOf = G.arrowVisual();
      const before = $$(el, '.gantt-arrows > g');
      const links = G.arrowIndex().query(G.windowSpan().top, G.windowSpan().bottom);
      const visuals = links.map(arrowOf);

      const recomputed = runs['arrowVisual'];
      scrollTo(el, RH * 51);
      expect(runs['arrowVisual']).toBe(recomputed);
      expect(G.arrowVisual()).toBe(arrowOf);
      const after = $$(el, '.gantt-arrows > g');
      expect(diff(before, after)).toEqual({ added: 1, removed: 1 });
      expect(links.slice(1).map(arrowOf)).toEqual(visuals.slice(1));
      expect(links.slice(1).every((l, i) => arrowOf(l) === visuals[i + 1])).toBe(true);
    });
  });

  describe('rows', () => {
    it('keys row backgrounds and separators by task id; separators stay between the grid markers', () => {
      el = mount({ tasks: plan(300), options: { initialScroll: false } });
      scrollTo(el, RH * 20);
      const rects = $$(el, '.gantt-rows rect');
      const lines = $$(el, '.gantt-grid-row');
      expect(lines).toHaveLength(rects.length);

      scrollTo(el, RH * 21);
      expect(diff(rects, $$(el, '.gantt-rows rect'))).toEqual({ added: 1, removed: 1 });
      expect(diff(lines, $$(el, '.gantt-grid-row'))).toEqual({ added: 1, removed: 1 });

      // Separators sit, in row order, between the two comment markers of the grid
      const grid = $(el, '.gantt-grid')!;
      const nodes = [...grid.childNodes];
      const rowsMarker = nodes.findIndex(n => n.nodeType === Node.COMMENT_NODE && n.textContent === 'rows');
      const majorMarker = nodes.findIndex(n => n.nodeType === Node.COMMENT_NODE && n.textContent === 'major');
      const between = nodes.slice(rowsMarker + 1, majorMarker) as Element[];
      expect(between).toEqual($$(el, '.gantt-grid-row'));
      const ys = between.map(l => Number(l.getAttribute('y1')));
      expect(ys).toEqual([...ys].sort((a, b) => a - b));

      // Selection repaints the row's rect in place
      const id = getEngine(el).graph.mountedGeometries()[3].row.task.id;
      const index = getEngine(el).graph.mountedGeometries()[3].row.visibleIndex;
      const rect = $$(el, '.gantt-rows rect').find(r => r.getAttribute('y') === String(index * RH))!;
      el.setSelectedTasks([id]);
      flush(el);
      expect(rect.isConnected).toBe(true);
      expect(rect.style.getPropertyValue('fill')).toBe(PAINTS.rowSelected);

      // No horizontal grid lines: the separators go, the markers stay
      el.options = { initialScroll: false, gridLines: { horizontal: false } };
      flush(el);
      expect($$(el, '.gantt-grid-row')).toHaveLength(0);
      expect([...grid.childNodes].filter(n => n.nodeType === Node.COMMENT_NODE)).toHaveLength(2);
    });
  });

  describe('overlay', () => {
    const annotations = (): GanttAnnotation[] => [
      { x1: DAY(-2), x2: DAY(1), color: '#8B5CF6', label: { text: 'Freeze' } },
      { x1: DAY(3) },
    ];

    it('keys annotations by index and patches them when the window moves', () => {
      el = mount({ tasks: plan(60), annotations: annotations(), options: { initialScroll: false } });
      const marks = $$(el, '.gantt-annotations > *');
      expect(marks.map(m => m.tagName.toLowerCase())).toEqual(['rect', 'line', 'line']);
      const label = $(el, '.gantt-annotation-labels > text')!;
      expect(label.textContent).toBe('Freeze');
      expect(marks[0].style.getPropertyValue('fill')).toBe('#8B5CF6');

      scrollTo(el, RH * 30);
      const { top, bottom } = getEngine(el).graph.windowSpan();
      expect($$(el, '.gantt-annotations > *')).toEqual(marks);
      expect($(el, '.gantt-annotation-labels > text')).toBe(label);
      expect(marks[1].getAttribute('y1')).toBe(String(top));
      expect(marks[1].getAttribute('y2')).toBe(String(bottom));
      expect(label.getAttribute('y')).toBe(String(top + 14));

      // The first annotation removed: index 0 keeps its line node, the rest goes
      el.annotations = [{ x1: DAY(3) }];
      flush(el);
      expect($$(el, '.gantt-annotations > *')).toEqual([marks[1]]);
      expect($$(el, '.gantt-annotation-labels > *')).toHaveLength(0);
    });

    it('patches the persistent today line and shows the core ghost (with its movement label) only while dragging', () => {
      el = mount({ tasks: plan(10), options: { viewMode: ViewMode.Day, initialScroll: false } });
      const { dom, graph: G } = getEngine(el);
      const today = $(el, '.gantt-today');
      expect(today).toBe(dom.today);
      expect(today!.nextElementSibling).toBe(dom.arrows);
      expect(today!.getAttribute('x1')).toBe(String(G.todayX()));

      drag(el, 't1', 2, false);
      const ghost = $(el, '.gantt-drag-preview')!;
      expect(ghost).toBe(dom.ghost);
      expect(dom.svg.lastElementChild).toBe(ghost);
      const v = G.ghostVisual()!;
      expect(ghost.getAttribute('x')).toBe(String(v.x));
      expect(ghost.getAttribute('height')).toBe(String(v.height));
      expect(ghost.getAttribute('opacity')).toBe('0.35');
      expect(ghost.getAttribute('stroke-dasharray')).toBe('4 2');
      expect(ghost.hasAttribute('fill-opacity')).toBe(false);
      expect(ghost.style.getPropertyValue('fill')).toBe(PAINTS.ghost);
      expect(ghost.style.getPropertyValue('stroke')).toBe(PAINTS.ghost);
      const label = ghost.previousElementSibling!;
      expect(label.getAttribute('class')).toBe('gantt-drag-preview-label');
      expect(label.textContent).toBe('+2d');
      expect(label.getAttribute('text-anchor')).toBe('middle');

      // A further move patches the same two nodes
      const canvas = $(el, '.gantry-canvas-container')!;
      const px = G.timeline().pxPerDay;
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 + 3 * px, pointerId: 1 }));
      flush(el);
      expect($(el, '.gantt-drag-preview')).toBe(ghost);
      expect(ghost.previousElementSibling).toBe(label);
      expect(label.textContent).toBe('+3d');

      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + 3 * px, pointerId: 1 }));
      flush(el);
      expect($$(el, '.gantt-drag-preview')).toHaveLength(0);
      expect(label.isConnected).toBe(false);
      expect($(el, '.gantt-today')).toBe(today);
    });
  });
});
