// Saved and seeded UI state at parity with <gantry-element> (Gantry 2 phase 7, final review): a zoom level
// restored from `options.stateKey` reaches `[(viewMode)]` and `viewModeChange` (once, like the Web
// Component's `view-mode-change`), a pending debounced save is written when the chart is destroyed, and
// `task.collapsed` seeds only the ids the chart has never seen (core `seedCollapsed`), so the user's
// expand state survives an empty series and a data-source reset.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TaskType, type GanttOptions, type GanttState, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDataSource } from './datasource/gantt-datasource';

const day = (d: number) => new Date(2026, 0, d);
const tree = (): GanttTask[] => [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(5), end: day(30), collapsed: true },
  { id: 'c', name: 'Child', parentId: 'g', start: day(5), end: day(12) },
  { id: 'x', name: 'Standalone', start: day(8), end: day(25) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 420px"
    [series]="tasks()"
    [dataSource]="dataSource()"
    [options]="options()"
    [(viewMode)]="zoom"
    (viewModeChange)="zoomEvents.push($event)"
    (stateChange)="states.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(tree());
  readonly dataSource = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly zoom = signal<string | undefined>(undefined);
  readonly zoomEvents: (string | undefined)[] = [];
  readonly states: GanttState[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(setup?: (host: Host) => void): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  setup?.(fixture.componentInstance);
  await fixture.whenStable();
  return fixture;
}

const $$ = (f: ComponentFixture<Host>, sel: string): HTMLElement[] => [
  ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(sel),
];
/** Zoom-level radio the toolbar shows as checked */
const pressedLevel = (f: ComponentFixture<Host>) =>
  $$(f, '.gantt-tb-pills:not(.gantt-tb-views) > .gantt-tb-pill[aria-checked="true"]').map(b => b.textContent?.trim());
const rowIds = (f: ComponentFixture<Host>) => $$(f, '.gantt-tl-row').map(r => r.getAttribute('data-task-id'));
const stored = (key: string) => JSON.parse(localStorage.getItem(`gantry:${key}`) ?? 'null') as GanttState | null;
const debounce = () => new Promise(r => setTimeout(r, 200));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('a zoom level restored from stateKey', () => {
  it('syncs [(viewMode)] and emits viewModeChange exactly once', async () => {
    localStorage.setItem('gantry:restore-zoom', JSON.stringify({ v: 2, viewMode: 'Week' }));
    const f = await mount(h => {
      h.zoom.set('Month');
      h.options.set({ initialScroll: false, stateKey: 'restore-zoom' });
    });
    expect(pressedLevel(f)).toEqual(['Week']);
    expect(f.componentInstance.zoom()).toBe('Week');
    expect(f.componentInstance.zoomEvents).toEqual(['Week']);

    // Nothing more once the parent's value came back through [viewMode]
    await debounce();
    await f.whenStable();
    expect(f.componentInstance.zoomEvents).toEqual(['Week']);
    expect(f.componentInstance.zoom()).toBe('Week');
    expect(stored('restore-zoom')?.viewMode).toBe('Week');
  });

  it('emits nothing when the restored level is the one shown', async () => {
    localStorage.setItem('gantry:same-zoom', JSON.stringify({ v: 2, viewMode: 'Month', view: 'chart' }));
    const f = await mount(h => {
      h.zoom.set('Month');
      h.options.set({ initialScroll: false, stateKey: 'same-zoom' });
    });
    expect(f.componentInstance.gantt().view()).toBe('chart');
    expect(f.componentInstance.zoomEvents).toEqual([]);
    expect(f.componentInstance.zoom()).toBe('Month');
  });

  it('emits nothing on the first render without a saved state', async () => {
    const f = await mount(h => {
      h.zoom.set('Month');
      h.options.set({ initialScroll: false, stateKey: 'nothing-saved' });
    });
    await debounce();
    expect(f.componentInstance.zoomEvents).toEqual([]);
    expect(f.componentInstance.states).toEqual([]);
    expect(localStorage.getItem('gantry:nothing-saved')).toBeNull();
  });
});

describe('a pending state save', () => {
  it('is written under stateKey when the chart is destroyed, without stateChange', async () => {
    const f = await mount(h => h.options.set({ initialScroll: false, stateKey: 'destroy-flush' }));
    f.componentInstance.gantt().setView('table');
    await f.whenStable();
    expect(localStorage.getItem('gantry:destroy-flush')).toBeNull();

    f.destroy();
    expect(stored('destroy-flush')).toMatchObject({ v: 2, view: 'table' });
    // The debounce timer was cleared with it: no late output, no second write
    localStorage.removeItem('gantry:destroy-flush');
    await debounce();
    expect(f.componentInstance.states).toEqual([]);
    expect(localStorage.getItem('gantry:destroy-flush')).toBeNull();
  });

  it('a save already written is not written again on destroy', async () => {
    const f = await mount(h => h.options.set({ initialScroll: false, stateKey: 'destroy-idle' }));
    f.componentInstance.gantt().setView('chart');
    await debounce();
    expect(f.componentInstance.states).toHaveLength(1);
    localStorage.removeItem('gantry:destroy-idle');
    f.destroy();
    expect(localStorage.getItem('gantry:destroy-idle')).toBeNull();
  });
});

describe('task.collapsed seeding (the ids never seen)', () => {
  const expand = async (f: ComponentFixture<Host>) => {
    $$(f, '[data-focus-key="collapse:g"]')[0]?.click();
    await f.whenStable();
  };

  it('keeps the user expand state through an empty series; a new id starts collapsed', async () => {
    const f = await mount();
    expect(rowIds(f)).toEqual(['g', 'x']);
    await expand(f);
    expect(rowIds(f)).toEqual(['g', 'c', 'x']);

    f.componentInstance.tasks.set([]);
    await f.whenStable();
    expect(rowIds(f)).toEqual([]);
    f.componentInstance.tasks.set(tree());
    await f.whenStable();
    expect(rowIds(f)).toEqual(['g', 'c', 'x']);

    f.componentInstance.tasks.set([
      ...tree(),
      { id: 'h', name: 'Second group', type: TaskType.Group, start: day(6), end: day(18), collapsed: true },
      { id: 'h1', name: 'Hidden child', parentId: 'h', start: day(6), end: day(10) },
    ]);
    await f.whenStable();
    expect(rowIds(f)).toEqual(expect.arrayContaining(['g', 'c', 'x', 'h']));
    expect(rowIds(f)).not.toContain('h1');
  });

  it('keeps the user expand state across a data-source reset', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    let gate = Promise.resolve();
    const fetcher = vi.fn(async (page: number) => {
      await gate;
      return page === 1 ? tree() : [];
    });
    const ds = new GanttDataSource({ fetcher, pageSize: 50, retries: 0 });
    const f = await mount(h => h.dataSource.set(ds));
    await vi.waitFor(() => expect(ds.items()).toHaveLength(3));
    await f.whenStable();
    expect(rowIds(f)).toEqual(['g', 'x']);
    await expand(f);
    expect(rowIds(f)).toEqual(['g', 'c', 'x']);

    // The reset empties the list (rendered) until the first page is back
    let release = (): void => undefined;
    gate = new Promise<void>(r => (release = r));
    const reset = ds.reset();
    await f.whenStable();
    expect(rowIds(f)).toEqual([]);
    release();
    await reset;
    await f.whenStable();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(rowIds(f)).toEqual(['g', 'c', 'x']);
  });
});
