// The engine graph (Gantry 2 phase 6, step 1.2): which parts of the render model a change
// recomputes, read from the per-node run counters (`getEngine(el).runs`).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LightTheme, ViewMode, type GanttOptions, type GanttTask } from '@gantry/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { structuralEqual } from '../engine/inputs';
import '../index';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

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

async function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options'>>): Promise<GantryElement> {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  await frame();
  return el;
}

/** Zeroes every counter, returning a reader that treats a node that never ran as 0. */
function resetRuns(el: GantryElement): (name: string) => number {
  const runs = getEngine(el).runs;
  for (const k of Object.keys(runs)) runs[k] = 0;
  return name => runs[name] ?? 0;
}

/** Runs of the task-list region from now on (the task list re-paints the rows it mounts). */
function tasklistRuns(el: GantryElement): () => number {
  const runs = getEngine(el).regionRuns;
  const start = runs['tasklist'] ?? 0;
  return () => (runs['tasklist'] ?? 0) - start;
}

const totalRuns = (el: GantryElement) => Object.values(getEngine(el).runs).reduce((a, b) => a + b, 0);
const firstRowId = (el: GantryElement) => el.shadowRoot!.querySelector<HTMLElement>('.gantt-tl-row')?.dataset['taskId'];

describe('engine graph', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  it('setTheme({ barColor }) recomputes no config, timeline or geometry', async () => {
    el = await mount({ tasks: plan(20), options: { viewMode: ViewMode.Day, criticalPath: true } });
    const runs = resetRuns(el);
    el.setTheme({ barColor: '#FDE68A' });
    await frame();
    expect(runs('config')).toBe(0);
    expect(runs('timeline')).toBe(0);
    expect(runs('geometries')).toBe(0);
    expect(runs('barVisual')).toBe(0);
    // The colour still changed: the theme sheet was rewritten
    expect(runs('themeCss')).toBe(1);
    expect(getEngine(el).graph.theme().barColor).toBe('#FDE68A');
  });

  it('a font-size change rebuilds the bar visuals, not the config or the timeline', async () => {
    el = await mount({ tasks: plan(5) });
    const runs = resetRuns(el);
    el.setTheme({ fontSize: '15px' });
    await frame();
    expect(runs('config')).toBe(0);
    expect(runs('timeline')).toBe(0);
    expect(runs('barVisual')).toBe(1);
    expect(getEngine(el).graph.metrics().fontPx).toBe(14);
  });

  it('scrolling recomputes the window only: no rows, no timeline', async () => {
    el = await mount({ tasks: plan(300), options: { initialScroll: false } });
    const render = tasklistRuns(el);
    const runs = resetRuns(el);
    const viewport = el.shadowRoot!.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
    viewport.scrollTop = 36 * 100;
    viewport.dispatchEvent(new Event('scroll'));
    await frame();
    await frame();
    expect(runs('allRows')).toBe(0);
    expect(runs('visibleRows')).toBe(0);
    expect(runs('timeline')).toBe(0);
    expect(runs('geometries')).toBe(0);
    expect(runs('arrowIndex')).toBe(0);
    expect(runs('vWindow')).toBeGreaterThan(0);
    // …and the rows of the new window were painted
    expect(render()).toBeGreaterThan(0);
    const { graph } = getEngine(el);
    expect(graph.vWindow().first).toBe(100 - 4);
    expect(firstRowId(el)).toBe(graph.visibleRows()[100 - 4].task.id);
  });

  it('scrolling inside the overscan does not re-render', async () => {
    el = await mount({ tasks: plan(300), options: { initialScroll: false } });
    const render = tasklistRuns(el);
    const viewport = el.shadowRoot!.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
    viewport.scrollTop = 10; // same first/last rows
    viewport.dispatchEvent(new Event('scroll'));
    await frame();
    expect(render()).toBe(0);
  });

  it('a clock tick within the same day keeps the timeline and moves only the today line', async () => {
    el = await mount({ tasks: plan(10), options: { viewMode: ViewMode.Day } });
    const { inputs, graph } = getEngine(el);
    inputs.nowTick.set(new Date(2026, 2, 10, 10, 0));
    await frame();
    const timeline = graph.timeline();
    const runs = resetRuns(el);
    inputs.nowTick.set(new Date(2026, 2, 10, 10, 1));
    await frame();
    expect(runs('timeline')).toBe(0);
    expect(runs('config')).toBe(0);
    expect(runs('nowDay')).toBe(1); // recomputed, equal by time: cut off
    expect(runs('todayX')).toBe(1);
    expect(graph.timeline()).toBe(timeline);

    // The next day does rebuild it
    inputs.nowTick.set(new Date(2026, 2, 11, 0, 1));
    await frame();
    expect(runs('timeline')).toBe(1);
  });

  it('places the today line for the exact tick on a timeline built from the quantised day', async () => {
    el = await mount({ tasks: plan(10), options: { viewMode: ViewMode.Day } });
    const { inputs, graph } = getEngine(el);
    inputs.nowTick.set(new Date(2026, 2, 10, 12, 0));
    await frame();
    const tl = graph.timeline();
    expect(graph.todayX()).toBe(tl.toX(new Date(2026, 2, 10)) + Math.round(tl.pxPerDay / 2));
    const line = el.shadowRoot!.querySelector('.gantt-today');
    expect(Number(line?.getAttribute('x1'))).toBe(graph.todayX());
  });

  it('re-assigning structurally equal options recomputes nothing and does not re-render', async () => {
    const opts: GanttOptions = {
      viewMode: ViewMode.Week,
      rowHeight: 40,
      criticalPath: true,
      baseline: true,
      darkMode: false,
      nonWorkingTime: { weekends: true, holidays: [{ start: new Date(2026, 2, 4), color: '#FCE7F3' }] },
      labels: { colName: 'Activity' },
      theme: { barColor: '#2563EB' },
      panel: { columns: ['name', 'start'] },
    };
    el = await mount({ tasks: plan(20), options: opts });
    const render = tasklistRuns(el);
    resetRuns(el);
    el.options = structuredClone(opts);
    await frame();
    expect(totalRuns(el)).toBe(0);
    expect(render()).toBe(0);
  });

  it('treats the same options object as changed (it may have been mutated in place)', async () => {
    const opts: GanttOptions = { rowHeight: 30 };
    el = await mount({ tasks: plan(3), options: opts });
    opts.rowHeight = 50;
    el.options = opts;
    await frame();
    expect(getEngine(el).graph.config().rowHeight).toBe(50);
    expect(el.shadowRoot!.querySelector<HTMLElement>('.gantt-tl-row')?.style.height).toBe('50px');
  });

  it('keeps the config across a drag end and a selection', async () => {
    el = await mount({ tasks: plan(3), options: { viewMode: ViewMode.Day, initialScroll: false } });
    const { graph } = getEngine(el);
    const config = graph.config();
    const bar = el.shadowRoot!.querySelector('.gantt-bars-layer [data-task-id="t0"]')!;
    const canvas = el.shadowRoot!.querySelector('.gantry-canvas-container')!;
    const px = graph.timeline().pxPerDay;
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 + 2 * px, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + 2 * px, pointerId: 1 }));
    el.setSelectedTasks(['t1']);
    await frame();
    expect(el.tasks[0].start).toEqual(new Date(2026, 2, 4));
    expect(graph.config()).toBe(config);
  });

  it('builds the arrow index once per geometry and queries the window', async () => {
    el = await mount({ tasks: plan(300), options: { initialScroll: false } });
    const index = getEngine(el).graph.arrowIndex();
    expect(index.size).toBe(299);
    // Only the links crossing the mounted rows are painted
    const painted = el.shadowRoot!.querySelectorAll('.gantt-arrows > *').length;
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(40);
  });

  it('writes theme colours into the sheet without re-rendering when no custom renderer reads them', async () => {
    el = await mount({ tasks: plan(3) });
    const render = tasklistRuns(el);
    el.patchTheme({ todayColor: '#FF0000' });
    await frame();
    expect(render()).toBe(0);
    const sheet = el.shadowRoot!.adoptedStyleSheets.at(-1)!.cssRules[0] as CSSStyleRule;
    expect(sheet.style.getPropertyValue('--gantt-today')).toBe('#FF0000');
    expect(sheet.style.getPropertyValue('--gantt-bar')).toBe(LightTheme.barColor);
  });
});

describe('structuralEqual', () => {
  it('compares plain data deeply, dates by time, functions and other objects by identity', () => {
    const fn = () => 1;
    const map = new Map();
    expect(structuralEqual({ a: [1, { b: 'x' }], d: new Date(5) }, { a: [1, { b: 'x' }], d: new Date(5) })).toBe(true);
    expect(structuralEqual({ d: new Date(5) }, { d: new Date(6) })).toBe(false);
    expect(structuralEqual({ f: fn }, { f: fn })).toBe(true);
    expect(structuralEqual({ f: fn }, { f: () => 1 })).toBe(false);
    expect(structuralEqual({ m: map }, { m: map })).toBe(true);
    expect(structuralEqual({ m: map }, { m: new Map() })).toBe(false);
    expect(structuralEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(structuralEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(structuralEqual([1], { 0: 1 })).toBe(false);
    expect(structuralEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});
