// Regression tests for the Angular renderer (Gantry 2 phase 1 P0 bugs) and the data source.
import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDataSource } from './datasource/gantt-datasource';
import { TaskType, type GanttOptions, type GanttTask, type SelectionChangeEvent } from '@gantryjs/core';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(5), end: day(30) },
  { id: 'g1', name: 'Child one', parentId: 'g', start: day(5), end: day(12) },
  { id: 'g2', name: 'Child two', parentId: 'g', start: day(12), end: day(20) },
  { id: 'x', name: 'Standalone', start: day(8), end: day(25) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    [series]="tasks()"
    [options]="options()"
    [showLegend]="legend()"
    (selectionChange)="events.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly legend = signal(false);
  readonly events: SelectionChangeEvent[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(setup?: (host: Host) => void): Promise<ComponentFixture<Host>> {
  // Built-in bars need no provider
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  setup?.(fixture.componentInstance);
  await fixture.whenStable();
  return fixture;
}

const $$ = (f: ComponentFixture<Host>, sel: string) => [
  ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(sel),
];

describe('GantryComponent', () => {
  it('emits selectionChange for a task-list click (no prior timeline click needed)', async () => {
    const f = await mount();
    $$(f, '.gantt-tl-row')[1].click();
    await f.whenStable();
    expect(f.componentInstance.events.at(-1)?.selectedIds).toEqual(['g1']);
  });

  it('Ctrl/Cmd+A selects every visible row, and honours multiSelect: false', async () => {
    const f = await mount();
    const host = f.nativeElement.querySelector('gantry') as HTMLElement;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await f.whenStable();
    expect(f.componentInstance.events.at(-1)?.selectedIds).toEqual(['g', 'g1', 'g2', 'x']);

    f.componentInstance.options.set({ initialScroll: false, multiSelect: false });
    await f.whenStable();
    const before = f.componentInstance.events.length;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await f.whenStable();
    expect(f.componentInstance.events.length).toBe(before);
  });

  it('Ctrl/Cmd+Shift+A selects all; Escape on an empty selection emits nothing', async () => {
    const f = await mount();
    const host = f.nativeElement.querySelector('gantry') as HTMLElement;
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    host.dispatchEvent(esc);
    await f.whenStable();
    expect(f.componentInstance.events).toEqual([]);

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true, bubbles: true }));
    await f.whenStable();
    expect(f.componentInstance.events.at(-1)?.selectedIds).toEqual(['g', 'g1', 'g2', 'x']);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await f.whenStable();
    expect(f.componentInstance.events.at(-1)?.selectedIds).toEqual([]);
  });

  it('leaves unhandled shortcuts (fit, Alt+key) to the browser', async () => {
    const f = await mount();
    const host = f.nativeElement.querySelector('gantry') as HTMLElement;
    for (const init of [{ key: 'f' }, { key: 't', altKey: true }, { key: 'z', ctrlKey: true }]) {
      const e = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      host.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    const zoom = new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true });
    host.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
  });

  it('names bars with type, dates, progress and critical state', async () => {
    const f = await mount(h =>
      h.tasks.set([
        { id: 'a', name: 'Design', start: day(5), end: day(12), progress: 40 },
        { id: 'b', name: 'Build', start: day(12), end: day(20), dependency: 'a' },
        { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(20), end: day(20) },
      ]),
    );
    const label = (id: string) => $$(f, `.gantt-bars-layer [data-task-id="${id}"]`)[0]?.getAttribute('aria-label');
    expect(label('a')).toBe('Design, Task, 5 Jan – 12 Jan 2026, 40% complete');
    expect(label('m')).toBe('Launch, Milestone, 20 Jan 2026');

    f.componentInstance.options.set({ initialScroll: false, criticalPath: true });
    await f.whenStable();
    expect(label('b')).toBe('Build, Task, 12 Jan – 20 Jan 2026, 0% complete, critical');
  });

  it('builds the tooltip from the shared model (milestone row, predecessors, successors)', async () => {
    const f = await mount(h =>
      h.tasks.set([
        { id: 'a', name: 'Design', start: day(5), end: day(12), progress: 140 },
        { id: 'b', name: 'Build', start: day(12), end: day(20), dependency: 'a' },
        { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(20), end: day(20) },
      ]),
    );
    const tooltipOf = async (id: string, name: string) => {
      const bar = $$(f, `.gantt-bars-layer [data-task-id="${id}"]`)[0];
      bar?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
      await new Promise(r => setTimeout(r, 400));
      await f.whenStable();
      // One popover per chart; its title is the first line
      const pop = $$(f, '.gantt-tooltip').find(p => p.firstElementChild?.textContent?.trim() === name);
      return (pop?.textContent ?? '').replace(/\s+/g, '');
    };
    const a = await tooltipOf('a', 'Design');
    expect(a).toContain('Progress100%');
    expect(a).toContain('SuccessorsBuild');
    expect(await tooltipOf('b', 'Build')).toContain('PredecessorsDesign');
    const m = await tooltipOf('m', 'Launch');
    expect(m).toContain('MilestoneJan20,2026');
    expect(m).not.toContain('Start');
  });

  it('lists the critical path and baseline in the legend', async () => {
    const f = await mount(h => {
      h.legend.set(true);
      h.options.set({ initialScroll: false, criticalPath: true, baseline: true });
    });
    // After the today marker (when it falls in range)
    const items = $$(f, '.gantt-legend-item').map(i => i.textContent?.trim());
    expect(items.slice(-2)).toEqual(['Critical path', 'Baseline']);
    expect($$(f, '.gantt-legend-swatch--bar rect')).toHaveLength(1);
    expect($$(f, '.gantt-legend-swatch--strip rect')).toHaveLength(1);
  });

  it('restores and saves versioned state under stateKey', async () => {
    localStorage.setItem('gantry:spec', JSON.stringify({ panelCollapsed: true, panelWidth: 0 }));
    const f = await mount(h => h.options.set({ initialScroll: false, stateKey: 'spec' }));
    const host = f.nativeElement.querySelector('gantry') as HTMLElement;
    expect(host.getAttribute('data-view')).toBe('chart');

    f.componentInstance.gantt().setView('table');
    await new Promise(r => setTimeout(r, 200));
    const saved = JSON.parse(localStorage.getItem('gantry:spec') ?? 'null') as Record<string, unknown>;
    expect(saved).toMatchObject({ v: 2, view: 'table' });
    localStorage.removeItem('gantry:spec');
  });

  it('ignores shortcuts typed into inputs', async () => {
    const f = await mount();
    const input = document.createElement('input');
    f.nativeElement.querySelector('.gantt-tl-row')!.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await f.whenStable();
    expect(f.componentInstance.events).toEqual([]);
  });

  it('keeps bars on their rows after collapsing a group', async () => {
    const f = await mount();
    $$(f, '.gantt-collapse-btn')[0].click();
    await f.whenStable();
    const rowHeight = 36;
    const label =
      $$(f, '.gantt-bars-layer [data-task-id="x"] .gantt-bar-label')[0] ??
      $$(f, '.gantt-bars-layer [data-task-id="x"] text')[0];
    // 'x' is now the second visible row: its label sits on that row's centre line
    expect(Number(label?.getAttribute('y'))).toBe(rowHeight + rowHeight / 2);
  });
});

describe('GanttDataSource', () => {
  const task = (id: string): GanttTask => ({ id, name: id, start: day(1), end: day(2) });

  it('loads, survives a failure, retries and resets without duplicates', async () => {
    let fail = false;
    const fetcher = vi.fn(async (page: number, size: number) => {
      if (fail) throw new Error('offline');
      return page > 2 ? [] : Array.from({ length: size }, (_, i) => task(`p${page}-${i}`));
    });
    const ds = new GanttDataSource({ fetcher, pageSize: 2, retries: 0 });
    await vi.waitFor(() => expect(ds.items().length).toBe(2));
    fail = true;
    await ds.loadNext();
    expect(ds.error()).toBeInstanceOf(Error);
    expect(() => ds.items()).not.toThrow();
    expect(ds.nextPage()).toBe(2);
    fail = false;
    await ds.retry();
    expect(ds.items().map(t => t.id)).toEqual(['p1-0', 'p1-1', 'p2-0', 'p2-1']);
    await ds.reset();
    expect(ds.items().map(t => t.id)).toEqual(['p1-0', 'p1-1']);
  });

  it('initialPage: 0 waits for loadNext()', async () => {
    const fetcher = vi.fn(async () => [task('a')]);
    const ds = new GanttDataSource({ fetcher, initialPage: 0 });
    await new Promise(r => setTimeout(r, 10));
    expect(fetcher).not.toHaveBeenCalled();
    await ds.loadNext();
    expect(ds.items()).toHaveLength(1);
  });
});
