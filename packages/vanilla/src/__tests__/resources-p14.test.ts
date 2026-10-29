// The resource view in <gantry-element> (Gantry 2 phase 14, step 2.3, plan §3c): `resources` (a property) and
// `options.rows: 'resources'` (or the toolbar's rows toggle) swap the rows for one per resource — its daily
// load against its capacity, drawn by core's `computeLoadVisuals` into `g.gantt-load` — and the bars,
// arrows, critical path and rollups step aside. The nodes `utilization` and `viewTasks` depend on the tasks,
// the resources, the date reading and `resourceView.unassigned` only. Without `rows: 'resources'` nothing
// changes (D18). Week of Mon 12 Oct 2026: Ana (100 %) is double-booked Wed 14 – Thu 15, Bo (50 %) is over
// Mon 19 – Wed 21, the Eng team has no load, one task has nobody.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STATE_SAVE_DELAY,
  ViewMode,
  calendarDays,
  type GanttOptions,
  type GanttResource,
  type GanttState,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { captureExport } from '../engine/export-capture';
import { buildExportSource } from '../export/source';
import { TOOLTIP_HIDE_DELAY, TOOLTIP_SHOW_DELAY } from '../layers/tooltip';
import { FORCED_COLORS_CSS } from '../styles/forced-colors.css';
import '../index';

/** October 2026: the 12th is a Monday. */
const d = (day: number) => new Date(2026, 9, day);

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
];
const TASKS: GanttTask[] = [
  { id: 'design', name: 'Design', start: d(12), end: d(16), resources: ['ana'] },
  {
    id: 'build',
    name: 'Build',
    start: d(14),
    end: d(21),
    resources: [{ resourceId: 'ana' }, { resourceId: 'bo', units: 50 }],
  },
  { id: 'test', name: 'Test', start: d(19), end: d(22), resources: [{ resourceId: 'bo', units: 100 }] },
  { id: 'docs', name: 'Docs', start: d(13), end: d(15) },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, rows: 'resources' };

let el: GantryElement;

function mount(
  options: GanttOptions = {},
  props: Partial<GantryElement> = { tasks: TASKS, resources: RESOURCES },
): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { ...props, options: { ...BASE, ...options } });
  document.body.appendChild(el);
  getEngine(el).flushSync();
  return el;
}

const engine = () => getEngine(el);
const flush = () => engine().flushSync();
const $ = <T extends Element = HTMLElement>(sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string) => [...el.shadowRoot!.querySelectorAll<T>(sel)];
const canvas = () => engine().dom.canvasContainer;
const loadRows = () => $$<SVGGElement>('.gantt-load > .gantt-load-row');
const rowIds = () => loadRows().map(r => r.getAttribute('data-row-id'));
const rowOf = (id: string) => $<SVGGElement>(`.gantt-load-row[data-row-id="${id}"]`)!;
const has = (id: string, cls: string) => rowOf(id).querySelector(`.${cls}`) !== null;

const moveTo = (type: string, x: number, y: number, kind: 'mouse' | 'touch' = 'mouse'): void => {
  canvas().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: kind,
      clientX: x,
      clientY: y,
    }),
  );
};
/** Client position (canvas = viewport here: the layout is all zeros) at the middle of `day` on `rowKey`. */
const cellAt = (rowKey: string, day: Date): { x: number; y: number; epoch: number } => {
  const g = engine().graph;
  const geo = g.geoById.peek().get(rowKey)!;
  const tl = g.timeline.peek();
  return { x: tl.toX(day) + tl.pxPerDay / 2, y: geo.y + geo.height / 2, epoch: calendarDays(day, false) };
};
const tooltipRows = (): Record<string, string> =>
  Object.fromEntries(
    $$('.gantt-tooltip .gantt-tooltip-row').map(r => [
      r.querySelector('dt')!.textContent,
      r.querySelector('dd')!.textContent,
    ]),
  );

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  el?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tasks mode is what it was (D18)', () => {
  it('has no load layer by default, and `resources` alone changes no painted node', () => {
    mount({ rows: undefined }, { tasks: TASKS });
    expect($('.gantt-load')).toBeNull();
    const plain = engine().dom.svg.innerHTML;
    const ids = (html: string) => html.replace(/gantt-[a-z-]+-\d+/g, 'gantt-id');
    el.remove();
    mount({ rows: 'tasks' }, { tasks: TASKS, resources: RESOURCES });
    expect($('.gantt-load')).toBeNull();
    expect(ids(engine().dom.svg.innerHTML)).toBe(ids(plain));
    expect(engine().graph.utilization.peek()).toBeNull();
    // The rows are the tasks themselves (the same array), the bars are there
    expect(engine().graph.viewTasks.peek()).toBe(engine().graph.tasks.peek());
    expect($$('.gantt-bars-layer > [data-task-id]')).toHaveLength(TASKS.length);
    expect(el.getState().rows).toBe('tasks');
  });
});

describe('the resource view', () => {
  it('shows one row per resource, its team and Unassigned, with no bar and no arrow', () => {
    mount({ criticalPath: true, rollup: true });
    flush();
    expect($$('.gantt-tl-row').map(r => r.getAttribute('data-task-id'))).toEqual([
      'res:ana',
      'res:bo',
      'team:Eng',
      'res:cy',
      'res:di',
      'unassigned',
    ]);
    expect(rowIds()).toEqual(['res:ana', 'res:bo', 'team:Eng', 'res:cy', 'res:di', 'unassigned']);
    expect($$('.gantt-bars-layer > *')).toHaveLength(0);
    expect($$('.gantt-arrows > *')).toHaveLength(0);
    // The group sits right before the bars layer, aria-hidden
    expect($('.gantt-load')!.nextElementSibling).toBe($('.gantt-bars-layer'));
    expect($('.gantt-load')!.getAttribute('aria-hidden')).toBe('true');
    // No critical path, no rollups; the row height is the resource view's (1.5 × 36)
    expect(engine().graph.critical.peek()).toBeNull();
    expect(el.criticalIds.size).toBe(0);
    expect(engine().graph.rollups.peek().size).toBe(0);
    expect(engine().graph.config.peek().rowHeight).toBe(54);
    expect($<HTMLElement>('.gantt-tl-row')!.style.height).toBe('54px');
    // No bar: the viewport is the tab stop
    expect($('.gantry-canvas-viewport')!.getAttribute('tabindex')).toBe('0');
  });

  it('draws the load paths: the bars of every row, the over part and its hatch only where a row is over its capacity', () => {
    mount();
    for (const id of ['res:ana', 'res:bo', 'res:cy', 'unassigned']) expect(has(id, 'gantt-load-bars'), id).toBe(true);
    expect(has('res:ana', 'gantt-load-over')).toBe(true);
    expect(has('res:ana', 'gantt-load-hatch')).toBe(true);
    expect(has('res:bo', 'gantt-load-over')).toBe(true);
    expect(has('res:cy', 'gantt-load-over')).toBe(false);
    expect(has('res:cy', 'gantt-load-hatch')).toBe(false);
    // The capacity line on every row but Unassigned
    expect(has('res:ana', 'gantt-load-cap')).toBe(true);
    expect(has('team:Eng', 'gantt-load-cap')).toBe(true);
    expect(has('unassigned', 'gantt-load-cap')).toBe(false);
    // `d` comes from core; the colours through the CSSOM
    const over = rowOf('res:ana').querySelector<SVGPathElement>('.gantt-load-over')!;
    expect(over.getAttribute('d')).toMatch(/^M/);
    expect(over.style.getPropertyValue('fill')).toBe('var(--gantt-overallocated)');
    expect(over.hasAttribute('style')).toBe(true);
    const bars = rowOf('res:ana').querySelector<SVGPathElement>('.gantt-load-bars')!;
    expect(bars.style.getPropertyValue('fill')).toBe('var(--gantt-bar)');
    // The hatch fills with the over-capacity pattern, which sits first in the group
    const { overHatchId } = engine().dom;
    expect(rowOf('res:ana').querySelector('.gantt-load-hatch')!.getAttribute('fill')).toBe(`url(#${overHatchId})`);
    const defs = $('.gantt-load')!.firstElementChild!;
    expect(defs.tagName.toLowerCase()).toBe('defs');
    expect(defs.querySelector('pattern')!.id).toBe(overHatchId);
  });

  it('draws no over part and no pattern with resourceView.overallocation off; a resource colour fills its bars', () => {
    mount(
      { resourceView: { overallocation: false } },
      { tasks: TASKS, resources: RESOURCES.map(r => (r.id === 'ana' ? { ...r, color: '#0a7' } : r)) },
    );
    expect($$('.gantt-load-over, .gantt-load-hatch')).toHaveLength(0);
    expect($('.gantt-load defs')).toBeNull();
    expect(rowOf('res:ana').querySelector<SVGPathElement>('.gantt-load-bars')!.style.getPropertyValue('fill')).toBe(
      '#0a7',
    );
  });

  it('leaves Unassigned out with resourceView.unassigned off', () => {
    mount({ resourceView: { unassigned: false } });
    expect(rowIds()).not.toContain('unassigned');
  });

  it('collapses a team: its members and their paths go, collapseAll() reaches the team', () => {
    mount();
    el.collapseAll();
    flush();
    expect(el.getState().collapsedIds).toEqual(['team:Eng']);
    expect(rowIds()).toEqual(['res:ana', 'res:bo', 'team:Eng', 'unassigned']);
    el.expandAll();
    flush();
    expect(rowIds()).toHaveLength(6);
  });

  it('names the rows in the task list with the resource description; task rows have no name of their own', () => {
    mount();
    const row = (id: string) => $(`.gantt-tl-row[data-task-id="${id}"]`)!;
    expect(row('res:ana').getAttribute('aria-label')).toBe('Ana, capacity 100%, peak load 200%, 2 days over capacity');
    expect(row('res:cy').getAttribute('aria-label')).toBe('Cy, capacity 100%, peak load 0%, never over capacity');
    expect(row('unassigned').getAttribute('aria-label')).toMatch(/^Unassigned, Load 100%$/);
    el.options = { ...BASE, rows: 'tasks' };
    flush();
    expect($$('.gantt-tl-row').every(r => !r.hasAttribute('aria-label'))).toBe(true);
  });

  it('shows name, capacity and peak load by default; an explicit panel.columns wins; the context carries the index', () => {
    mount();
    const heads = () => $$('.gantt-tl-col-headers [data-focus-key]').map(h => h.getAttribute('data-focus-key'));
    expect(heads()).toEqual(['head:name', 'head:capacity', 'head:load']);
    expect($('[data-focus-key="cell:res:bo:capacity"]')!.textContent.trim()).toBe('50%');
    expect($('[data-focus-key="cell:res:ana:load"]')!.textContent.trim()).toBe('200%');
    const ctx = engine().graph.columnCtx.peek();
    expect(ctx.rows).toBe('resources');
    expect(ctx.resources?.list.map(r => r.id)).toEqual(['ana', 'bo', 'cy', 'di']);
    el.options = { ...BASE, panel: { columns: ['name', 'start'] } };
    flush();
    expect(heads()).toEqual(['head:name', 'head:start']);
  });

  it('gives the cell context the index in tasks mode too (the Resources cell), without `rows`', () => {
    mount({ rows: undefined });
    const ctx = engine().graph.columnCtx.peek();
    expect(ctx.resources?.list).toHaveLength(4);
    expect(ctx.rows).toBeUndefined();
  });

  it('draws the calendar: a weekend carries no load', () => {
    mount();
    const before = rowOf('res:ana').querySelector('.gantt-load-bars')!.getAttribute('d');
    el.options = { ...BASE, calendar: true };
    flush();
    expect(rowOf('res:ana').querySelector('.gantt-load-bars')!.getAttribute('d')).not.toBe(before);
    const ana = engine().graph.utilization.peek()!.rows.get('res:ana')!;
    // Sat 17 and Sun 18
    expect(ana.loads[calendarDays(d(17), false) - ana.firstDay]).toBe(0);
    expect(ana.loads[calendarDays(d(16), false) - ana.firstDay]).toBeGreaterThan(0);
  });
});

describe('rows: options, toggle and state', () => {
  const toggle = () => $<HTMLButtonElement>('.gantt-tb-rows');

  it('adds the rows toggle only with toolbar.rowsToggle and some resources', () => {
    mount({ rows: undefined });
    expect(toggle()).toBeNull();
    el.options = { ...BASE, rows: undefined, toolbar: { rowsToggle: true } };
    flush();
    expect(toggle()).not.toBeNull();
    el.resources = [];
    flush();
    expect(toggle()).toBeNull();
  });

  it('flips the rows with the toggle (aria-pressed), saves the state, and the options win when they change', () => {
    mount({ rows: undefined, toolbar: { rowsToggle: true } });
    const states: GanttState[] = [];
    el.addEventListener('state-change', e => states.push(e.detail));
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false');
    expect($('.gantt-load')).toBeNull();

    toggle()!.click();
    flush();
    expect(toggle()!.getAttribute('aria-pressed')).toBe('true');
    expect(rowIds()).toHaveLength(6);
    expect(el.getState().rows).toBe('resources');
    vi.advanceTimersByTime(STATE_SAVE_DELAY);
    expect(states.at(-1)?.rows).toBe('resources');

    toggle()!.click();
    flush();
    expect($('.gantt-load')).toBeNull();
    expect($$('.gantt-bars-layer > [data-task-id]')).toHaveLength(TASKS.length);
    vi.advanceTimersByTime(STATE_SAVE_DELAY);
    expect(states.at(-1)?.rows).toBe('tasks');

    // `options.rows` changed: it wins over the toggle, once; equal options change nothing
    toggle()!.click();
    el.options = { rows: 'tasks', toolbar: { rowsToggle: true }, viewMode: ViewMode.Day, initialScroll: false };
    flush();
    expect(el.getState().rows).toBe('tasks');
    el.options = { rows: 'resources', toolbar: { rowsToggle: true }, viewMode: ViewMode.Day, initialScroll: false };
    flush();
    expect(el.getState().rows).toBe('resources');
  });

  it('restores `rows` with setState and reports it in getState', () => {
    mount({ rows: undefined });
    expect(el.getState().rows).toBe('tasks');
    el.setState({ rows: 'resources' }, false);
    flush();
    expect(rowIds()).toHaveLength(6);
    el.setState({ rows: 'tasks' }, false);
    flush();
    expect($('.gantt-load')).toBeNull();
  });
});

describe('the graph', () => {
  it('recomputes utilization and viewTasks for the tasks, the resources and the calendar, not for a zoom or a label', () => {
    mount();
    const { runs } = engine();
    const count = () => [runs['utilization'], runs['viewTasks'], runs['resourceIndex']];
    const base = count();
    expect(base.every(n => n === 1)).toBe(true);

    el.setViewMode(ViewMode.Week);
    el.darkMode = true;
    flush();
    expect(count()).toEqual(base);

    // Equal resources in a new array: nothing; a change in one resource: the three
    el.resources = RESOURCES.map(r => ({ ...r }));
    flush();
    expect(count()).toEqual(base);
    el.resources = RESOURCES.map(r => (r.id === 'bo' ? { ...r, capacity: 100 } : r));
    flush();
    expect(count()).toEqual([2, 2, 2]);

    el.tasks = [...TASKS, { id: 'extra', name: 'Extra', start: d(12), end: d(14), resources: ['di'] }];
    flush();
    expect(runs['utilization']).toBe(3);
    expect(runs['viewTasks']).toBe(3);
    expect(runs['resourceIndex']).toBe(2);

    el.options = { ...BASE, calendar: true };
    flush();
    expect(runs['utilization']).toBe(4);
  });

  it('does not run them at all in tasks mode', () => {
    mount({ rows: undefined });
    el.resources = [...RESOURCES];
    el.setViewMode(ViewMode.Week);
    flush();
    expect(engine().runs['utilization'] ?? 0).toBeLessThanOrEqual(1);
    expect(engine().graph.loadVisuals.peek()).toHaveLength(0);
  });
});

describe('the resource tooltip', () => {
  /** Hovers `day` of `rowKey` with the mouse and lets the show delay pass. */
  const hover = (rowKey: string, day: Date): void => {
    const { x, y } = cellAt(rowKey, day);
    moveTo('pointermove', x, y);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
  };

  it('opens over a load cell with the day, the load against the capacity and the tasks that make it', () => {
    mount();
    hover('res:bo', d(19));
    const tooltip = engine().layers.tooltip;
    expect(tooltip.visibleLoad()).toEqual({ rowKey: 'res:bo', day: calendarDays(d(19), false) });
    expect($('.gantt-tooltip-title')!.textContent).toBe('Bo');
    expect(tooltipRows()).toMatchObject({
      Load: '150%',
      Capacity: '50%',
      'Over capacity': '100%',
      Build: '50%',
      Test: '100%',
    });
    expect($<HTMLElement>('.gantt-tooltip')!.hidden).toBe(false);
    // The pointer leaves: it closes after the hide delay
    moveTo('pointerleave', 0, 0);
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY);
    expect(tooltip.visibleLoad()).toBeNull();
    expect($<HTMLElement>('.gantt-tooltip')!.hidden).toBe(true);
  });

  it('opens none for a touch pointer, and not in tasks mode', () => {
    mount();
    const { x, y } = cellAt('res:bo', d(19));
    moveTo('pointermove', x, y, 'touch');
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(engine().layers.tooltip.visibleLoad()).toBeNull();
    el.options = { ...BASE, rows: 'tasks' };
    flush();
    moveTo('pointermove', x, y);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(engine().layers.tooltip.visibleLoad()).toBeNull();
  });

  it('moves with the pointer to another day, and Escape closes it', () => {
    mount();
    hover('res:bo', d(19));
    hover('res:bo', d(20));
    expect(engine().layers.tooltip.visibleLoad()?.day).toBe(calendarDays(d(20), false));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    expect(engine().layers.tooltip.visibleLoad()).toBeNull();
  });

  it('is rewritten in place when the resources change under it, and goes when its row does', () => {
    mount();
    hover('res:bo', d(19));
    expect(tooltipRows()).toMatchObject({ Capacity: '50%', 'Over capacity': '100%' });
    const refresh = vi.spyOn(engine().layers.tooltip, 'refreshLoad');
    // Bo is full-time now: still open, 50 % over, capacity 100 %
    el.resources = RESOURCES.map(r => (r.id === 'bo' ? { ...r, capacity: 100 } : r));
    flush();
    expect(refresh).toHaveBeenCalled();
    expect(engine().layers.tooltip.visibleLoad()?.rowKey).toBe('res:bo');
    expect(tooltipRows()).toMatchObject({ Capacity: '100%', 'Over capacity': '50%' });
    expect($<HTMLElement>('.gantt-tooltip')!.hidden).toBe(false);
    // Bo is not a resource any more: the row is gone, the tooltip with it
    el.resources = RESOURCES.filter(r => r.id !== 'bo');
    flush();
    expect(engine().layers.tooltip.visibleLoad()).toBeNull();
  });

  it('closes when the rows switch back to the tasks', () => {
    mount({ toolbar: { rowsToggle: true } });
    hover('res:ana', d(14));
    expect(engine().layers.tooltip.visibleLoad()).not.toBeNull();
    $<HTMLButtonElement>('.gantt-tb-rows')!.click();
    flush();
    expect(engine().layers.tooltip.visibleLoad()).toBeNull();
  });
});

describe('export', () => {
  it('captures the projected rows and the very utilization they came from; tasks mode captures none', () => {
    mount();
    const g = engine().graph;
    const snap = captureExport(engine());
    expect(snap.utilization).not.toBeNull();
    expect(snap.utilization).toBe(g.utilization.peek());
    expect(snap.rows.map(r => r.task.id)).toEqual(['res:ana', 'res:bo', 'team:Eng', 'res:cy', 'res:di', 'unassigned']);
    expect(snap.tasks.map(t => t.id)).toEqual(snap.rows.map(r => r.task.id));
    expect(snap.critical).toBeNull();
    expect(snap.rollups.size).toBe(0);
    const source = buildExportSource(engine(), snap, 'builtin');
    expect(source.utilization).toBe(g.utilization.peek());
    expect(source.config.rows).toBe('resources');
    expect(source.columnCtx.rows).toBe('resources');
    expect(source.columnCtx.resources?.list).toHaveLength(4);
    expect(source.critical.size).toBe(0);

    el.options = { ...BASE, rows: 'tasks' };
    flush();
    const tasksSource = buildExportSource(engine(), captureExport(engine()), 'builtin');
    expect(tasksSource.utilization).toBeNull();
    expect(tasksSource.tasks.map(t => t.id)).toEqual(TASKS.map(t => t.id));
    expect(tasksSource.columnCtx.rows).toBeUndefined();
  });

  it('draws the load in the SVG, and only in the resource view', async () => {
    mount();
    const svg = await el.exportSvg();
    expect(svg).toContain('gantt-load-bars');
    expect(svg).toContain('gantt-load-over');
    expect(svg).toContain('over-hatch');
    el.options = { ...BASE, rows: 'tasks' };
    flush();
    expect(await el.exportSvg()).not.toContain('gantt-load');
  });
});

describe('forced colors', () => {
  it('draws the load with system colours: CanvasText bars, Highlight over part, CanvasText hatch, GrayText capacity line', () => {
    const css = FORCED_COLORS_CSS;
    expect(css).toMatch(/\.gantt-load-bars \{ fill: CanvasText !important/);
    expect(css).toMatch(/\.gantt-load-over \{ fill: Highlight !important/);
    expect(css).toMatch(/\.gantt-load pattern line \{ stroke: CanvasText !important/);
    expect(css).toMatch(/\.gantt-load-cap \{ stroke: GrayText !important/);
  });
});

describe('wave 5: tasks mode stays what it was, and the resource view has no bars to hit', () => {
  it('reports `rows` in the state only with resources or in the resource view', () => {
    mount({ rows: undefined }, { tasks: TASKS });
    expect('rows' in el.getState()).toBe(false);
    el.resources = RESOURCES;
    flush();
    expect(el.getState().rows).toBe('tasks');
    el.options = { ...BASE, rows: 'resources' };
    el.resources = [];
    flush();
    expect(el.getState().rows).toBe('resources');
  });

  it('keeps no listbox on the svg in the resource view; tasks mode is unchanged', () => {
    mount({ rows: undefined });
    const svg = engine().dom.svg;
    expect(svg.getAttribute('role')).toBe('listbox');
    expect(svg.getAttribute('aria-label')).toBe('Task bars');
    el.options = { ...BASE };
    flush();
    expect(svg.getAttribute('role')).toBe('presentation');
    expect(svg.hasAttribute('aria-label')).toBe(false);
    expect(svg.hasAttribute('aria-orientation')).toBe(false);
    el.options = { ...BASE, rows: 'tasks' };
    flush();
    expect(svg.getAttribute('role')).toBe('listbox');
    expect(svg.getAttribute('aria-label')).toBe('Task bars');
  });

  it('does not take a press or a hover in a resource row for a bar, and a press closes the resource tooltip', () => {
    mount();
    const { x, y } = cellAt('res:ana', d(14));
    moveTo('pointermove', x, y);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(engine().inputs.hoveredBarId.peek()).toBeNull();
    expect(engine().layers.tooltip.visibleLoad()).not.toBeNull();
    const press = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: x,
      clientY: y,
    });
    canvas().dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
    expect(engine().layers.tooltip.visibleLoad()).toBeNull();
  });

  it('selects and focuses the synthetic rows', () => {
    mount();
    el.setSelectedTasks(['res:ana']);
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['res:ana']);
    expect(el.focusTask('res:ana')).toBe(true);
    expect(el.focusTask('nobody')).toBe(false);
  });

  it('lists no critical path in the legend of the resource view', () => {
    mount({ criticalPath: true, rows: undefined }, { tasks: TASKS, resources: RESOURCES, showLegend: true });
    expect($('.gantt-legend')?.textContent).toMatch(/critical/i);
    el.options = { ...BASE, criticalPath: true };
    flush();
    expect($('.gantt-legend')?.textContent ?? '').not.toMatch(/critical/i);
  });

  it('fills the plan to the viewport border box, so a classic scrollbar coming or going changes nothing', () => {
    mount({ rows: undefined, fitToWidth: true });
    const I = engine().inputs;
    const total = (canvasW: number, scrollbar: number): number => {
      I.canvasW.set(canvasW);
      I.scrollbarY.set(scrollbar);
      return engine().graph.timeline.peek().totalWidth;
    };
    // The first width whose plan is longer: the border box decides, not the content box
    let edge = 2000;
    while (total(edge, 0) === total(edge - 1, 0) && edge < 4000) edge++;
    expect(total(edge - 1, 0)).toBeLessThan(total(edge, 0));
    expect(total(edge - 7, 7)).toBe(total(edge, 0));
    expect(total(edge - 7, 7)).toBeGreaterThan(total(edge - 7, 0));
    // Overlay scrollbars (thickness 0): the content width, as before
    expect(total(edge - 1, 0)).toBe(total(edge - 1, 0));
  });
});
