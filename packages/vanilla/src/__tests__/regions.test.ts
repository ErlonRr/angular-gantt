// Region effects (Gantry 2 phase 6, step 1.3): one effect per region, flushed in a fixed order,
// each re-running only for what it paints (counted in `getEngine(el).regionRuns`); persistent SVG
// layers; the focused task-list row pinned in the virtual window; the first frame measured by
// the ResizeObserver.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialScrollLeft, ViewMode, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { REGIONS, type Region } from '../engine/render';
import '../index';

/** Runs the element's queued frame work now. */
const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks in March 2026, each depending on the previous one. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: (i * 7) % 100,
    ...(i > 0 ? { dependency: `t${i - 1}` } : {}),
  }));
}

function create(props: Partial<Pick<GantryElement, 'tasks' | 'options'>>): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  return el;
}

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options'>>): GantryElement {
  const el = create(props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

/** Zeroes the region and graph-node counters; the readers treat "never ran" as 0. */
function counters(el: GantryElement) {
  const { runs, regionRuns } = getEngine(el);
  for (const k of Object.keys(runs)) runs[k] = 0;
  for (const k of Object.keys(regionRuns)) regionRuns[k] = 0;
  return {
    region: (name: Region) => regionRuns[name] ?? 0,
    node: (name: string) => runs[name] ?? 0,
  };
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)];

function scrollTo(el: GantryElement, top: number, left = 0): void {
  const viewport = $(el, '.gantry-canvas-viewport')!;
  viewport.scrollTop = top;
  viewport.scrollLeft = left;
  viewport.dispatchEvent(new Event('scroll'));
  flush(el);
}

describe('region effects', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs every region once on the first frame, in flush order', () => {
    el = create({ tasks: plan(30) });
    const order: Region[] = [];
    const { layers } = getEngine(el);
    for (const region of REGIONS) {
      const layer = layers[region] as { paint: () => void };
      const paint = layer.paint;
      layer.paint = () => {
        order.push(region);
        paint();
      };
    }
    document.body.appendChild(el);
    flush(el);
    expect(order).toEqual([...REGIONS]);
    expect($$(el, '.gantt-bars-layer [data-task-id]').length).toBeGreaterThan(0);
  });

  it('a vertical scroll re-runs the windowed regions only: no toolbar, legend, header, static or config', () => {
    el = mount({ tasks: plan(300), options: { initialScroll: false } });
    const runs = counters(el);
    scrollTo(el, 36 * 100);
    for (const region of ['host', 'toolbar', 'legend', 'header', 'static'] as const)
      expect(runs.region(region)).toBe(0);
    expect(runs.node('config')).toBe(0);
    expect(runs.node('timeline')).toBe(0);
    for (const region of ['rows', 'bars', 'arrows', 'tasklist'] as const) expect(runs.region(region)).toBe(1);
    expect($(el, '.gantt-tl-row')?.dataset['taskId']).toBe(getEngine(el).graph.visibleRows()[100 - 4]?.task.id);
  });

  it('a horizontal scroll inside the horizontal window re-runs no region', () => {
    el = mount({ tasks: plan(30), options: { initialScroll: false } });
    const runs = counters(el);
    scrollTo(el, 0, 120);
    for (const region of REGIONS) expect(runs.region(region), region).toBe(0);
    expect(runs.node('config')).toBe(0);
  });

  it('a selection change re-runs rows, bars and the task list, not the toolbar or the header', () => {
    el = mount({ tasks: plan(30), options: { initialScroll: false } });
    const runs = counters(el);
    el.setSelectedTasks(['t1']);
    flush(el);
    expect(runs.region('toolbar')).toBe(0);
    expect(runs.region('header')).toBe(0);
    expect(runs.region('legend')).toBe(0);
    expect(runs.region('static')).toBe(0);
    expect(runs.region('rows')).toBe(1);
    expect(runs.region('bars')).toBe(1);
    expect(runs.region('tasklist')).toBe(1);
    expect($(el, '.gantt-tl-row--selected')?.dataset['taskId']).toBe('t1');
    expect($(el, '.gantt-bars-layer [data-task-id="t1"] .gantt-bar-body')?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('a theme colour change or equal options re-run no region', () => {
    el = mount({ tasks: plan(10), options: { viewMode: ViewMode.Week, initialScroll: false } });
    const runs = counters(el);
    el.setTheme({ barColor: '#FDE68A' });
    el.options = { viewMode: ViewMode.Week, initialScroll: false };
    flush(el);
    for (const region of REGIONS) expect(runs.region(region), region).toBe(0);
  });

  it('a zoom re-runs the timeline regions and keeps the persistent SVG layers in place', () => {
    el = mount({ tasks: plan(30), options: { viewMode: ViewMode.Week, initialScroll: false } });
    const svg = $(el, '.gantry-canvas-container > svg');
    const groups = ['.gantt-rows', '.gantt-grid', '.gantt-arrows', '.gantt-bars-layer'].map(sel => $(el, sel));
    const runs = counters(el);
    el.zoomIn();
    flush(el);
    for (const region of ['toolbar', 'header', 'static', 'rows', 'bars'] as const) expect(runs.region(region)).toBe(1);
    expect($(el, '.gantry-canvas-container > svg')).toBe(svg);
    expect(['.gantt-rows', '.gantt-grid', '.gantt-arrows', '.gantt-bars-layer'].map(sel => $(el, sel))).toEqual(groups);
    // Layer order inside the SVG
    expect([...svg!.children].map(c => c.getAttribute('class'))).toEqual([
      'gantt-rows',
      'gantt-bands',
      'gantt-grid',
      'gantt-annotations',
      'gantt-today',
      'gantt-arrows',
      'gantt-bars-layer',
      'gantt-annotation-labels',
    ]);
  });

  it('keeps the row separators between the minor and the major grid lines across a static rebuild', () => {
    el = mount({
      tasks: plan(30),
      options: { viewMode: ViewMode.Day, initialScroll: false, gridLines: { horizontal: { width: 1 } } },
    });
    const kinds = () =>
      $$(el, '.gantt-grid > line')
        .map(l => l.getAttribute('class'))
        .filter((c, i, all) => c !== all[i - 1]);
    expect(kinds()).toEqual(['gantt-grid-minor', 'gantt-grid-row', 'gantt-grid-major']);
    const rows = $$(el, '.gantt-grid-row').length;
    expect(rows).toBe($$(el, '.gantt-rows rect').length);
    el.setViewMode(ViewMode.Week);
    flush(el);
    expect(kinds().filter(k => k !== 'gantt-grid-minor')).toEqual(['gantt-grid-row', 'gantt-grid-major']);
    expect($$(el, '.gantt-grid-row').length).toBe(rows);
  });

  it('attaches the drag ghost only while dragging, and reuses the same node', () => {
    el = mount({ tasks: plan(3), options: { viewMode: ViewMode.Day, initialScroll: false } });
    const bar = $(el, '.gantt-bars-layer [data-task-id="t0"]')!;
    const canvas = $(el, '.gantry-canvas-container')!;
    const px = getEngine(el).graph.timeline().pxPerDay;
    expect($(el, '.gantt-drag-preview')).toBeNull();
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 + 2 * px, pointerId: 1 }));
    flush(el);
    const ghost = $(el, '.gantt-drag-preview');
    expect(ghost).not.toBeNull();
    expect(ghost!.parentElement?.lastElementChild).toBe(ghost);
    expect(Number(ghost!.getAttribute('x'))).toBeGreaterThan(0);
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + 2 * px, pointerId: 1 }));
    flush(el);
    expect($(el, '.gantt-drag-preview')).toBeNull();
    expect(ghost!.isConnected).toBe(false);
  });

  it('keeps a focused row mounted (pinned) when it is scrolled 50 rows away', () => {
    el = mount({ tasks: plan(300), options: { initialScroll: false } });
    const { graph, inputs } = getEngine(el);
    const id = graph.visibleRows()[2].task.id;
    const sel = `.gantt-tl-row[data-task-id="${id}"]`;
    $(el, sel)!.focus();
    expect(inputs.focusedRowId()).toBe(id);
    scrollTo(el, 36 * 50);

    const pinned = $(el, sel);
    expect(pinned?.isConnected).toBe(true);
    expect(pinned?.classList.contains('gantt-tl-row--pinned')).toBe(true);
    expect(pinned?.style.getPropertyValue('top')).toBe(`${2 * 36}px`);
    // Focus followed the rebuilt row
    expect((el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['taskId']).toBe(id);
    // The canvas keeps its row and bar too, at the row's own offset
    expect($(el, `.gantt-bars-layer [data-task-id="${id}"]`)).not.toBeNull();
    expect($$(el, '.gantt-rows rect').some(r => r.getAttribute('y') === String(2 * 36))).toBe(true);
    // The window's own rows follow the scroll
    expect(graph.vWindow().pinnedBefore).toEqual([2]);
    expect($$(el, '.gantt-tl-row:not(.gantt-tl-row--pinned)')[0]?.getAttribute('data-task-id')).toBe(
      graph.visibleRows()[graph.vWindow().first]?.task.id,
    );

    // Focus moves to the toolbar: the row is no longer pinned
    ($(el, '[data-focus-key="zoom-in"]') as HTMLButtonElement).focus();
    expect(inputs.focusedRowId()).toBeNull();
    flush(el);
    expect($(el, sel)).toBeNull();
  });

  it('measures the panes when connected (panel width applied first) and on resize, never in the flush', () => {
    let observe: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observe = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const tasks = [
      { id: 'a', name: 'A', start: new Date(2020, 2, 2), end: new Date(2020, 2, 20) },
      { id: 'b', name: 'B', start: new Date(2020, 3, 1), end: new Date(2020, 3, 30) },
    ];
    const centre = new Date(2020, 2, 25);
    el = create({ tasks, options: { initialScroll: centre } });
    const { dom, inputs, graph } = getEngine(el);
    let viewportWidth = 800;
    let panelAtMeasure: string | undefined;
    Object.defineProperty(dom.main, 'clientWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(dom.viewport, 'clientWidth', {
      configurable: true,
      get: () => {
        panelAtMeasure ??= dom.panel.style.width;
        return viewportWidth;
      },
    });
    document.body.appendChild(el);
    expect(inputs.mainW()).toBe(1200);
    expect(inputs.canvasW()).toBe(800);
    // The viewport was measured beside the panel the first render shows
    expect(panelAtMeasure).toBe(`${graph.panelPx()}px`);

    flush(el);
    const tl = graph.timeline();
    expect(dom.viewport.scrollLeft).toBe(
      initialScrollLeft({ timeline: tl, initialScroll: centre, viewportWidth: 800, now: new Date() }),
    );

    // A resize writes the inputs; the regions wait for the frame
    viewportWidth = 600;
    const runs = counters(el);
    observe!();
    expect(inputs.canvasW()).toBe(600);
    for (const region of REGIONS) expect(runs.region(region), region).toBe(0);
    flush(el);
    expect(runs.region('scroll-commands')).toBeLessThanOrEqual(1);
  });
});
