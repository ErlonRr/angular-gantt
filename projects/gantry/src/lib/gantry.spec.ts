// Regression tests for the Angular renderer (Gantry 2 phase 1 P0 bugs) and the data source.
import '../test/dom-shims';
import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDataSource } from './datasource/gantt-datasource';
import { provideGanttLib } from './module/gantt.module';
import { TaskType, type GanttOptions, type GanttTask, type SelectionChangeEvent } from './types';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(5), end: day(30) },
  { id: 'g1', name: 'Child one', parentId: 'g', start: day(5), end: day(12) },
  { id: 'g2', name: 'Child two', parentId: 'g', start: day(12), end: day(20) },
  { id: 'x', name: 'Standalone', start: day(8), end: day(25) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry [series]="tasks()" [options]="options()" (selectionChange)="events.push($event)" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly events: SelectionChangeEvent[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(): Promise<ComponentFixture<Host>> {
  // Built-in bars are registered by provideGanttLib() (phase 7 makes them the default)
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideGanttLib()] });
  const fixture = TestBed.createComponent(Host);
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
