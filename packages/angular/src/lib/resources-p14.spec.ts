// The resource view in Angular (Gantry 2 phase 14, step 2.4, plan §3c / §3d / D4 / D5 / D11 / D12 / D21), the
// Web Component's `resources-p14.test.ts`: the binding only paints what core computed —
// - `rows: 'tasks'` (the default) draws nothing new, with or without `resources`: the canvas is the same markup;
// - `rows: 'resources'` projects the resources into rows (teams, members, Unassigned), draws core's histogram
//   paths in `g.gantt-load` before the bars layer (no bars, no arrows), the over-capacity hatch pattern only
//   while a row is over capacity, and makes the viewport a tab stop;
// - the toolbar's rows toggle, `setState({ rows })` and `getState()` carry the mode, and `stateChange` reports it;
// - a zoom recomputes neither the utilization nor the projected rows; a changed `resources` list does, an equal one not;
// - the working calendar leaves weekends without load;
// - the tooltip over a load cell shows the day's load and its tasks, and follows a `resources` change while open.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DEFAULT_LABELS,
  STATE_SAVE_DELAY,
  ViewMode,
  calendarDays,
  createExportSource,
  exportChartCsv,
  exportChartSvg,
  type GanttOptions,
  type GanttResource,
  type GanttState,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttTooltipState } from './tooltip/tooltip-state';

const NOW = new Date(2026, 9, 14, 9, 30);

/** October 2026: Mon 12, Fri 16, Mon 19, Wed 21, Fri 23, Mon 26. */
const oct = (d: number) => new Date(2026, 9, d);

const RESOURCES = (): GanttResource[] => [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
];

/**
 * Ana is over capacity on 14–15 Oct (Design and Build); Bo (half-time) on 19–22 (Test, 100 %); Cy and Di share
 * API; Review has nobody (Unassigned).
 */
const PLAN = (): GanttTask[] => [
  { id: 't1', name: 'Design', start: oct(12), end: oct(16), resources: ['ana'] },
  { id: 't2', name: 'Build', start: oct(14), end: oct(22), resources: ['ana', { resourceId: 'bo', units: 50 }] },
  { id: 't3', name: 'Test', start: oct(19), end: oct(23), resources: [{ resourceId: 'bo', units: 100 }] },
  { id: 't4', name: 'API', start: oct(13), end: oct(21), resources: ['cy', 'di'] },
  { id: 't5', name: 'Review', start: oct(26), end: oct(28) },
];

const BASE: GanttOptions = {
  viewMode: ViewMode.Day,
  initialScroll: false,
  panel: { columns: ['name', 'capacity', 'load'] },
};
const VIEW: GanttOptions = { ...BASE, rows: 'resources' };

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 480px"
    [series]="tasks()"
    [resources]="resources()"
    [options]="options()"
    (stateChange)="states.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(PLAN());
  readonly resources = signal<GanttResource[]>(RESOURCES());
  readonly options = signal<GanttOptions>(BASE);
  readonly states: GanttState[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  layout: GanttLayoutService;
}

/** Creates a chart in the configured test module (one `configureTestingModule` per test) */
function create(options: GanttOptions, resources: GanttResource[] = RESOURCES()): Chart {
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set(options);
  f.componentInstance.resources.set(resources);
  const debug = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    h: f.componentInstance,
    host: debug.nativeElement as HTMLElement,
    layout: debug.injector.get(GanttLayoutService),
  };
}

async function mount(options: GanttOptions = BASE, resources?: GanttResource[]): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const c = create(options, resources);
  await c.f.whenStable();
  return c;
}

afterEach(() => {
  vi.useRealTimers();
});

const $ = <T extends Element = HTMLElement>(c: Chart, sel: string) => c.host.querySelector<T>(sel);
const $$ = (c: Chart, sel: string) => [...c.host.querySelectorAll<HTMLElement>(sel)];
const svg = (c: Chart) => $<SVGSVGElement>(c, 'gantt-canvas svg')!;
/** `data-task-id` of the task-list rows in display order */
const rowIds = (c: Chart) => $$(c, '.gantt-tl-row').map(r => r.getAttribute('data-task-id') ?? '');
const cellText = (c: Chart, id: string, key: string) =>
  $(c, `[data-focus-key="cell:${id}:${key}"]`)?.textContent?.trim();
const loadRow = (c: Chart, id: string) => $(c, `.gantt-load-row[data-row-id="${id}"]`);
const pathOf = (c: Chart, id: string, kind: 'bars' | 'over' | 'hatch' | 'cap') =>
  loadRow(c, id)?.querySelector(`path.gantt-load-${kind}`) ?? null;

describe('rows: tasks (the default)', () => {
  it('draws no load layer and no toolbar toggle, with resources or without', async () => {
    const c = await mount();
    expect($(c, '.gantt-load')).toBeNull();
    expect($(c, '.gantt-tb-rows')).toBeNull();
    expect(c.layout.utilization()).toBeNull();
    expect(c.layout.resourceMode()).toBe(false);
    expect(rowIds(c)).toEqual(['t1', 't4', 't2', 't3', 't5']);
  });

  it('paints the same canvas with `resources` as without (D18)', async () => {
    const without = await mount(BASE, []);
    const withIt = create(BASE);
    await withIt.f.whenStable();
    expect(svg(withIt).outerHTML).toBe(svg(without).outerHTML);
    // The state reports the rows shown only where there is a choice (resources), as the Web Component's
    expect('rows' in without.h.gantt().getState()).toBe(false);
    expect(withIt.h.gantt().getState().rows).toBe('tasks');
  });
});

describe('rows: resources', () => {
  it('shows one row per resource, its team and Unassigned, with no bars or arrows', async () => {
    const c = await mount(VIEW);
    expect(rowIds(c)).toEqual(['res:ana', 'res:bo', 'team:Eng', 'res:cy', 'res:di', 'unassigned']);
    expect(c.layout.resourceMode()).toBe(true);
    // The rows are taller (D2: 1.5 × the base row)
    expect(c.layout.rowHeight()).toBe(54);
    expect($$(c, '.gantt-bars-layer > *')).toHaveLength(0);
    expect($$(c, '.gantt-arrows > *')).toHaveLength(0);
    // The default columns of the view: name, capacity, peak load
    expect(rowIds(c).map(id => $(c, `[data-focus-key="cell:${id}:load"]`)?.textContent?.trim())).toEqual([
      '200%',
      '150%',
      '200%',
      '100%',
      '100%',
      '100%',
    ]);
  });

  it('draws g.gantt-load right before the bars layer, one group per mounted row, with core’s paths', async () => {
    const c = await mount(VIEW);
    const layer = $(c, 'g.gantt-load')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.nextElementSibling?.getAttribute('class')).toBe('gantt-bars-layer');
    // The over-capacity hatch (defs) comes first, then one group per row
    expect(layer.firstElementChild?.tagName.toLowerCase()).toBe('defs');
    expect([...layer.querySelectorAll(':scope > .gantt-load-row')].map(g => g.getAttribute('data-row-id'))).toEqual(
      rowIds(c),
    );
    // Every row has its histogram; the capacity line is on all but Unassigned
    for (const id of rowIds(c)) expect(pathOf(c, id, 'bars'), id).not.toBeNull();
    expect(pathOf(c, 'unassigned', 'cap')).toBeNull();
    for (const id of rowIds(c).filter(id => id !== 'unassigned')) {
      const cap = pathOf(c, id, 'cap')!;
      expect(cap.getAttribute('stroke-dasharray'), id).toBe('4 3');
      expect(cap.getAttribute('d'), id).toBeTruthy();
    }
    // The d strings are the core model's, not recomputed
    const bars = c.layout.loadVisuals().find(v => v.rowKey === 'res:ana')!;
    expect(pathOf(c, 'res:ana', 'bars')!.getAttribute('d')).toBe(bars.bars);
    expect(pathOf(c, 'res:ana', 'over')!.getAttribute('d')).toBe(bars.over);
  });

  it('marks the load above the capacity (over path + hatch) on the rows that are over it only', async () => {
    const c = await mount(VIEW);
    for (const id of ['res:ana', 'res:bo']) {
      expect(pathOf(c, id, 'over'), id).not.toBeNull();
      expect(pathOf(c, id, 'hatch'), id).not.toBeNull();
    }
    for (const id of ['res:cy', 'res:di', 'team:Eng', 'unassigned']) expect(pathOf(c, id, 'over'), id).toBeNull();
    // The hatch fills with the canvas' over-capacity pattern, unique per chart
    const pattern = $(c, '.gantt-load defs pattern[id$="-over-hatch"]')!;
    expect(pattern.id).toMatch(/^gantry-\d+-over-hatch$/);
    expect(pathOf(c, 'res:ana', 'hatch')!.getAttribute('fill')).toBe(`url(#${pattern.id})`);
    // Over-allocation only for the rows that have a capacity
    expect(c.layout.utilization()!.rows.get('res:ana')!.overDays).toBe(2);
    expect(c.layout.utilization()!.rows.get('res:bo')!.overDays).toBe(4);
  });

  it('draws plain load, no pattern, with resourceView.overallocation off', async () => {
    const c = await mount({ ...VIEW, resourceView: { overallocation: false } });
    expect($(c, '.gantt-load-over')).toBeNull();
    expect($(c, '.gantt-load-hatch')).toBeNull();
    expect($(c, '.gantt-load defs pattern[id$="-over-hatch"]')).toBeNull();
    // The data still says it (the column and the row name)
    expect(c.layout.utilization()!.rows.get('res:ana')!.overDays).toBe(2);
  });

  it('drops the Unassigned row with resourceView.unassigned off', async () => {
    const c = await mount({ ...VIEW, resourceView: { unassigned: false } });
    expect(rowIds(c)).not.toContain('unassigned');
    expect(loadRow(c, 'unassigned')).toBeNull();
  });

  it('makes the viewport a tab stop (no bar is)', async () => {
    const tasks = await mount();
    expect($(tasks, '.gantry-canvas-viewport')!.getAttribute('tabindex')).toBe('-1');
    TestBed.resetTestingModule();
    const c = await mount(VIEW);
    expect($(c, '.gantry-canvas-viewport')!.getAttribute('tabindex')).toBe('0');
  });

  it('leaves weekends without load when the working calendar is on', async () => {
    const day = (d: number) => calendarDays(oct(d), false);
    const off = await mount(VIEW);
    const offAna = off.layout.utilization()!.rows.get('res:ana')!;
    const offD = pathOf(off, 'res:ana', 'bars')!.getAttribute('d');
    // Build covers Sat 17 and Sun 18 October; with no calendar they weigh on Ana
    expect(offAna.loads[day(17) - offAna.firstDay]).toBe(100);
    expect(offAna.loads[day(18) - offAna.firstDay]).toBe(100);
    TestBed.resetTestingModule();
    const c = await mount({ ...VIEW, calendar: true });
    const ana = c.layout.utilization()!.rows.get('res:ana')!;
    expect(ana.loads[day(17) - ana.firstDay]).toBe(0);
    expect(ana.loads[day(18) - ana.firstDay]).toBe(0);
    expect(ana.loads[day(19) - ana.firstDay]).toBe(100);
    // The path is drawn from the calendar's loads
    expect(pathOf(c, 'res:ana', 'bars')!.getAttribute('d')).not.toBe(offD);
  });
});

describe('the rows toggle and the state', () => {
  it('shows the toggle only with `toolbar.rowsToggle` and resources; pressing it flips the rows and reports the state', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const c = create({ ...BASE, toolbar: { rowsToggle: true } });
    TestBed.tick();
    const button = $<HTMLButtonElement>(c, '.gantt-tb-rows')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('data-focus-key')).toBe('rows');
    expect($(c, '.gantt-load')).toBeNull();

    button.click();
    TestBed.tick();
    expect($(c, '.gantt-tb-rows')!.getAttribute('aria-pressed')).toBe('true');
    expect(c.layout.rows()).toBe('resources');
    expect($(c, 'g.gantt-load')).not.toBeNull();
    expect(c.h.gantt().getState().rows).toBe('resources');
    vi.advanceTimersByTime(STATE_SAVE_DELAY);
    expect(c.h.states.at(-1)?.rows).toBe('resources');

    $<HTMLButtonElement>(c, '.gantt-tb-rows')!.click();
    TestBed.tick();
    expect(c.layout.rows()).toBe('tasks');
    vi.advanceTimersByTime(STATE_SAVE_DELAY);
    expect(c.h.states.at(-1)?.rows).toBe('tasks');
  });

  it('has no toggle without resources', async () => {
    const c = await mount({ ...BASE, toolbar: { rowsToggle: true } }, []);
    expect($(c, '.gantt-tb-rows')).toBeNull();
  });

  it('restores the rows with setState; an invalid value changes nothing', async () => {
    const c = await mount();
    c.h.gantt().setState({ rows: 'resources' }, false);
    await c.f.whenStable();
    expect(c.layout.resourceMode()).toBe(true);
    expect(c.h.gantt().getState().rows).toBe('resources');
    // An invalid value changes nothing
    c.h.gantt().setState({ rows: 'nope' as never }, false);
    await c.f.whenStable();
    expect(c.layout.resourceMode()).toBe(true);
  });

  it('follows a changed `options.rows` (the option is the initial value, as `view`)', async () => {
    const c = await mount();
    c.h.options.set(VIEW);
    await c.f.whenStable();
    expect(c.layout.resourceMode()).toBe(true);
    c.h.options.set({ ...VIEW, rows: 'tasks' });
    await c.f.whenStable();
    expect(c.layout.resourceMode()).toBe(false);
  });
});

describe('columns and row names', () => {
  it('shows name, capacity and peak load by default in the resource view (the resolved config picks them)', async () => {
    const c = await mount({ viewMode: ViewMode.Day, initialScroll: false, rows: 'resources' });
    const keys = $$(c, '[data-focus-key^="cell:res:ana:"]').map(cell =>
      cell.getAttribute('data-focus-key')!.split(':').pop(),
    );
    expect(keys).toEqual(['name', 'capacity', 'load']);
    expect(['res:ana', 'res:bo', 'team:Eng', 'unassigned'].map(id => cellText(c, id, 'capacity'))).toEqual([
      '100%',
      '50%',
      '200%',
      '',
    ]);
    // The tasks view keeps its own defaults
    const tasks = await (async () => {
      TestBed.resetTestingModule();
      return mount({ viewMode: ViewMode.Day, initialScroll: false });
    })();
    expect(
      $$(tasks, '[data-focus-key^="cell:t1:"]').map(cell => cell.getAttribute('data-focus-key')!.split(':').pop()),
    ).not.toContain('capacity');
  });

  it('gives the cells the resource index (the Resources column, also in the tasks view) and the rows mode', async () => {
    const c = await mount({ ...BASE, panel: { columns: ['name', 'resources'] } });
    expect(c.layout.columnContext().resources?.list.map(r => r.id)).toEqual(['ana', 'bo', 'cy', 'di']);
    expect(c.layout.columnContext().rows).toBeUndefined();
    expect(cellText(c, 't2', 'resources')).toBe('Ana, Bo 50%');
    expect(cellText(c, 't5', 'resources')).toBe('');
    c.layout.rows.set('resources');
    await c.f.whenStable();
    expect(c.layout.columnContext().rows).toBe('resources');
    expect(c.layout.columnContext().resources?.list).toHaveLength(4);
    // The column context describes the projected rows
    expect([...c.layout.columnContext().taskById.keys()]).toContain('res:ana');
  });

  it('names a resource row by its numbers; a task row has no aria-label', async () => {
    const tasks = await mount(BASE);
    expect($$(tasks, '.gantt-tl-row').filter(r => r.hasAttribute('aria-label'))).toHaveLength(0);
    TestBed.resetTestingModule();
    const c = await mount(VIEW);
    const name = (id: string) => $(c, `.gantt-tl-row[data-task-id="${id}"]`)?.getAttribute('aria-label');
    const util = c.layout.utilization()!;
    for (const id of ['res:ana', 'res:bo', 'team:Eng', 'res:cy']) {
      const load = util.rows.get(id)!;
      expect(name(id), id).toBe(
        DEFAULT_LABELS.describeResource(
          load.kind === 'team' ? 'Eng' : load.resource!.name,
          load.capacity!,
          load.peak,
          load.overDays,
        ),
      );
    }
    expect(name('res:ana')).toBe('Ana, capacity 100%, peak load 200%, 2 days over capacity');
    expect(name('res:cy')).toBe('Cy, capacity 100%, peak load 100%, never over capacity');
    expect(name('unassigned')).toBe('Unassigned, Load 100%');
  });
});

describe('the cut-offs', () => {
  it('keeps the utilization and the projected rows through a zoom, a theme change and a new equal resources list', async () => {
    const c = await mount(VIEW);
    const util = c.layout.utilization();
    const rows = c.layout.viewTasks();
    expect(util).not.toBeNull();
    c.layout.zoomOut();
    await c.f.whenStable();
    expect(c.layout.utilization()).toBe(util);
    expect(c.layout.viewTasks()).toBe(rows);
    // A new list with the same content: the same index, so the same utilization
    c.h.resources.set(RESOURCES());
    await c.f.whenStable();
    expect(c.layout.utilization()).toBe(util);
  });

  it('recomputes them when a resource changes or a task is unassigned', async () => {
    const c = await mount(VIEW);
    const util = c.layout.utilization();
    c.h.resources.set(RESOURCES().map(r => (r.id === 'bo' ? { ...r, capacity: 200 } : r)));
    await c.f.whenStable();
    expect(c.layout.utilization()).not.toBe(util);
    expect(c.layout.utilization()!.rows.get('res:bo')!.overDays).toBe(0);
    expect(pathOf(c, 'res:bo', 'over')).toBeNull();
    // The hatch pattern follows the rows that are over: Ana still is
    expect($(c, '.gantt-load defs pattern[id$="-over-hatch"]')).not.toBeNull();
    c.h.tasks.set(PLAN().map(t => (t.id === 't1' ? { ...t, resources: [] } : t)));
    await c.f.whenStable();
    expect(pathOf(c, 'res:ana', 'over')).toBeNull();
    expect($(c, '.gantt-load defs pattern[id$="-over-hatch"]')).toBeNull();
  });
});

describe('the tooltip over a load cell', () => {
  /** A pointer move over `day` (October) of the resource row `id`, in the test DOM's 1:1 client coordinates */
  function moveTo(c: Chart, id: string, day: number): void {
    const geo = c.layout.geometryById().get(id)!;
    const x = c.layout.timeline().toX(oct(day)) + c.layout.pxPerDay() / 2;
    svg(c).dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: geo.y + 10 }),
    );
    TestBed.tick();
    TestBed.tick();
  }
  const tip = (c: Chart) => $(c, '.gantt-tooltip')!;
  const shown = (c: Chart): Record<string, string | null> => {
    const labels = [...tip(c).querySelectorAll('dt.gantt-tooltip-label')].map(n => n.textContent ?? '');
    const values = [...tip(c).querySelectorAll('dd.gantt-tooltip-value')].map(n => n.textContent);
    return Object.fromEntries(labels.map((label, i) => [label, values[i] ?? null]));
  };

  async function open(options: GanttOptions = { ...VIEW, tooltip: { showDelay: 0 } }): Promise<Chart> {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const c = create(options);
    TestBed.tick();
    // The pointer listeners are bound after the first render
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    return c;
  }

  it('opens with the day’s load, the capacity, what is over it and the tasks that weigh on it', async () => {
    const c = await open();
    moveTo(c, 'res:bo', 19);
    expect(tip(c).hidden).toBe(false);
    expect(tip(c).querySelector('.gantt-tooltip-title')!.textContent).toBe('Bo');
    expect(shown(c)).toMatchObject({
      Load: '150%',
      Capacity: '50%',
      'Over capacity': '100%',
      Test: '100%',
      Build: '50%',
    });
    // The first row is the date (its label), with no value
    expect(tip(c).querySelector('dd.gantt-tooltip-value')!.textContent).toBe('');
  });

  it('moves with the pointer along the row, day by day, and closes off the rows', async () => {
    const c = await open();
    moveTo(c, 'res:bo', 19);
    expect(shown(c)['Load']).toBe('150%');
    moveTo(c, 'res:bo', 13);
    expect(shown(c)['Load']).toBe('0%');
    // Unassigned: no capacity row
    moveTo(c, 'unassigned', 26);
    expect(tip(c).querySelector('.gantt-tooltip-title')!.textContent).toBe('Unassigned');
    expect(shown(c)['Capacity']).toBeUndefined();
    // Off every row (below them): closes after the hide delay
    svg(c).dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: 200, clientY: 100_000 }),
    );
    vi.advanceTimersByTime(1000);
    TestBed.tick();
    expect(tip(c).hidden).toBe(true);
  });

  it('follows a `resources` change while it is open', async () => {
    const c = await open();
    moveTo(c, 'res:bo', 19);
    expect(shown(c)).toMatchObject({ Capacity: '50%', 'Over capacity': '100%' });
    c.h.resources.set(RESOURCES().map(r => (r.id === 'bo' ? { ...r, capacity: 200 } : r)));
    TestBed.tick();
    expect(tip(c).hidden).toBe(false);
    expect(shown(c)['Capacity']).toBe('200%');
    expect(shown(c)['Over capacity']).toBeUndefined();
  });

  it('is placed by the day’s cell (its x range and the row), not by the whole row', async () => {
    const c = await open();
    moveTo(c, 'res:bo', 19);
    // The tooltip state is provided by the canvas
    const state = c.f.debugElement.query(By.css('gantt-canvas')).injector.get(GanttTooltipState);
    const box = state.anchor()!.getBoundingClientRect();
    const geo = c.layout.geometryById().get('res:bo')!;
    expect(box.left - svg(c).getBoundingClientRect().left).toBeCloseTo(c.layout.timeline().toX(oct(19)), 5);
    expect(box.width).toBeCloseTo(c.layout.pxPerDay(), 5);
    expect(box.height).toBe(geo.height);
  });

  it('closes when the rows switch back to tasks', async () => {
    const c = await open();
    moveTo(c, 'res:bo', 19);
    expect(tip(c).hidden).toBe(false);
    c.layout.rows.set('tasks');
    TestBed.tick();
    expect(tip(c).hidden).toBe(true);
  });
});

describe('the review fixes', () => {
  it('hides the svg listbox from assistive technology in the resource view only', async () => {
    const tasks = await mount();
    expect(svg(tasks).getAttribute('role')).toBe('listbox');
    expect(svg(tasks).hasAttribute('aria-hidden')).toBe(false);
    const view = create(VIEW);
    await view.f.whenStable();
    expect(svg(view).getAttribute('aria-hidden')).toBe('true');
  });

  it('selects and focuses the synthetic rows of the resource view', async () => {
    const c = await mount(VIEW);
    const g = c.h.gantt();
    expect(g.focusTask('res:ana')).toBe(true);
    expect(g.focusTask('t1')).toBe(false);
    g.setSelectedTasks(['res:ana', 'res:bo']);
    expect(g.getSelectedTasks().map(t => t.id)).toEqual(['res:ana', 'res:bo']);
  });

  it('lists no critical path in the legend of the resource view, and no load layer in the table view', async () => {
    const opts: GanttOptions = { ...VIEW, criticalPath: true };
    const c = await mount(opts);
    expect(c.layout.legendItems().some(i => i.key === 'critical')).toBe(false);
    const tasks = create({ ...BASE, criticalPath: true });
    await tasks.f.whenStable();
    expect(tasks.layout.legendItems().some(i => i.key === 'critical')).toBe(true);
    c.layout.view.set('table');
    c.f.detectChanges();
    await c.f.whenStable();
    expect($(c, '.gantt-load')).toBeNull();
  });

  it('fills fitToWidth to the viewport box (scrollbar included), and to the content width when none is measured', async () => {
    const c = await mount({ ...BASE, fitToWidth: true });
    c.layout.viewportWidth.set(900);
    const clientOnly = c.layout.timeline().totalWidth;
    c.layout.fitWidth.set(900);
    expect(c.layout.timeline().totalWidth).toBe(clientOnly);
    c.layout.fitWidth.set(1400);
    expect(c.layout.timeline().totalWidth).toBeGreaterThanOrEqual(1400);
    c.layout.fitWidth.set(0);
    expect(c.layout.timeline().totalWidth).toBe(clientOnly);
  });
});

describe('export', () => {
  it('equals core on a headless source of the same resource chart (SVG and CSV)', async () => {
    const c = await mount(VIEW);
    c.layout.now.set(NOW.getTime());
    await c.f.whenStable();
    const headless = createExportSource({ tasks: PLAN(), resources: RESOURCES(), options: VIEW, now: NOW });
    expect(await c.h.gantt().exportSvg({ idPrefix: 'p' })).toBe(exportChartSvg(headless, { idPrefix: 'p' }));
    expect(await c.h.gantt().exportCsv()).toBe(exportChartCsv(headless));
    expect(await c.h.gantt().exportCsv({ values: 'display', columns: 'all' })).toBe(
      exportChartCsv(headless, { values: 'display', columns: 'all' }),
    );
  });

  it('exports a tasks chart with resources as the headless one does (no load, no resource columns)', async () => {
    const c = await mount(BASE);
    c.layout.now.set(NOW.getTime());
    await c.f.whenStable();
    const headless = createExportSource({ tasks: PLAN(), resources: RESOURCES(), options: BASE, now: NOW });
    expect(await c.h.gantt().exportSvg({ idPrefix: 'p' })).toBe(exportChartSvg(headless, { idPrefix: 'p' }));
    expect(await c.h.gantt().exportCsv({ columns: 'all' })).toBe(exportChartCsv(headless, { columns: 'all' }));
  });

  it('exports the resource view: three kinds of path, no bars', async () => {
    const c = await mount(VIEW);
    const markup = await c.h.gantt().exportSvg();
    expect(markup).toContain('gantt-load-bars');
    expect(markup).toContain('gantt-load-over');
    expect(markup).toContain('gantt-load-cap');
    expect(markup).not.toContain('gantt-bar-body');
    expect(markup).toContain('gantt-load-hatch');
  });

  it('exports tasks mode as before (no load layer)', async () => {
    const c = await mount(BASE);
    expect(await c.h.gantt().exportSvg()).not.toContain('gantt-load');
  });
});
