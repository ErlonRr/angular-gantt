// Lifecycle (Gantry 2 phase 7, step 2.2): browser-only work starts after the first render and ends
// with the chart — the ResizeObserver, the 60 s clock, the scroll listeners, the load-more
// IntersectionObserver and a column resize in progress (pointer capture on its handle, never
// `window` listeners). The observers are recording stubs read through `document.defaultView`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDataSource } from './datasource/gantt-datasource';
import { type GanttOptions, type GanttTask } from '@gantry/core';

const day = (d: number) => new Date(2026, 3, d);
const TASKS: GanttTask[] = [
  { id: 'a', name: 'Alpha', start: day(1), end: day(8) },
  { id: 'b', name: 'Beta', start: day(8), end: day(15), dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(15), end: day(22) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks" [dataSource]="dataSource()" [options]="options()" />`,
})
class Host {
  readonly tasks = TASKS;
  readonly dataSource = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ initialScroll: false, panel: { columns: ['name', 'start'] } });
  readonly gantt = viewChild.required(GantryComponent);
}

/** An observer class whose instances record what they observe and whether they were disconnected */
function recordingObserver() {
  const instances: { observed: Element[]; disconnected: boolean }[] = [];
  class Recording {
    readonly observed: Element[] = [];
    disconnected = false;
    constructor(readonly callback: unknown) {
      instances.push(this);
    }
    observe(el: Element): void {
      this.observed.push(el);
    }
    unobserve(): void {}
    disconnect(): void {
      this.disconnected = true;
    }
    takeRecords(): [] {
      return [];
    }
  }
  return { Recording, instances };
}

async function mount(setup?: (host: Host) => void): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  setup?.(fixture.componentInstance);
  await fixture.whenStable();
  return fixture;
}

const $ = (f: ComponentFixture<Host>, sel: string): HTMLElement => {
  const el = (f.nativeElement as HTMLElement).querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`no element for ${sel}`);
  return el;
};

/** The test document's `EventTarget.prototype` (Node has its own `EventTarget` global) */
function domEventTarget(): EventTarget {
  let proto: object | null = document.createElement('div');
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'addEventListener'))
    proto = Object.getPrototypeOf(proto);
  if (!proto) throw new Error('no EventTarget.prototype');
  return proto as EventTarget;
}

const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { pointerId: 7, button: 0, bubbles: true, cancelable: true, ...init });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser-only work is released with the chart', () => {
  it('disconnects the observers, clears the clock and removes the scroll listeners on destroy', async () => {
    const ro = recordingObserver();
    const io = recordingObserver();
    vi.stubGlobal('ResizeObserver', ro.Recording);
    vi.stubGlobal('IntersectionObserver', io.Recording);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const baseline = vi.getTimerCount();
    const target = domEventTarget();
    const added = vi.spyOn(target, 'addEventListener');
    const removed = vi.spyOn(target, 'removeEventListener');

    const f = await mount(h => h.dataSource.set(new GanttDataSource({ data: TASKS })));
    const panel = $(f, '.gantry-panel');
    const canvas = $(f, '.gantry-canvas-viewport');

    // Started after the first render: sizes observed, the clock ticking, both panes listened to
    expect(ro.instances).toHaveLength(1);
    expect(ro.instances[0]?.observed).toEqual(expect.arrayContaining([panel, canvas, $(f, '.gantry-main')]));
    expect(io.instances).toHaveLength(1);
    expect(io.instances[0]?.observed).toEqual([$(f, 'gantt-load-more')]);
    expect(vi.getTimerCount()).toBe(baseline + 1);
    const scrollListeners = added.mock.calls
      .map((args, i) => ({ target: added.mock.contexts[i] as EventTarget, type: args[0], handler: args[1] }))
      .filter(l => l.type === 'scroll');
    expect(scrollListeners.map(l => l.target)).toEqual(expect.arrayContaining([panel, canvas]));

    f.destroy();

    expect(ro.instances[0]?.disconnected).toBe(true);
    expect(io.instances[0]?.disconnected).toBe(true);
    expect(vi.getTimerCount()).toBe(baseline);
    for (const { target, handler } of scrollListeners) {
      const match = removed.mock.calls.findIndex(
        (args, i) => removed.mock.contexts[i] === target && args[0] === 'scroll' && args[1] === handler,
      );
      expect(match, 'scroll listener removed').toBeGreaterThanOrEqual(0);
    }
  });

  it('registers the panes before the first scroll sync: initialScroll applies on the first render', async () => {
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
    const f = await mount(h => h.options.update(o => ({ ...o, initialScroll: day(15) })));
    const canvas = $(f, '.gantry-canvas-viewport');
    const onCanvas = scrollTo.mock.calls.filter((_, i) => scrollTo.mock.contexts[i] === canvas);
    expect(onCanvas.length).toBeGreaterThan(0);
    expect((onCanvas[0]?.[0] as ScrollToOptions).left).toBeGreaterThan(0);
  });

  it('a column resize listens on its handle (pointer capture); the trailing click does not sort', async () => {
    const f = await mount();
    const gantt = f.componentInstance.gantt();
    const handle = $(f, '.gantt-tl-col-header .gantt-col-resize');
    const header = handle.closest<HTMLElement>('.gantt-tl-col-header')!;
    const added = vi.spyOn(handle, 'addEventListener');
    const removed = vi.spyOn(handle, 'removeEventListener');
    const onWindow = vi.spyOn(window, 'addEventListener');
    const start = gantt.getState().columnWidths?.['name'];
    expect(start).toBeTypeOf('number');

    handle.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
    handle.dispatchEvent(pointer('pointermove', { clientX: 150 }));
    handle.dispatchEvent(pointer('pointermove', { clientX: 150, pointerId: 8 })); // another pointer: ignored
    await f.whenStable();
    expect(gantt.getState().columnWidths?.['name']).toBe(start! + 50);
    expect(added.mock.calls.map(c => c[0]).sort()).toEqual([
      'lostpointercapture',
      'pointercancel',
      'pointermove',
      'pointerup',
    ]);
    expect(onWindow.mock.calls.filter(c => String(c[0]).startsWith('pointer'))).toEqual([]);

    handle.dispatchEvent(pointer('pointerup', { clientX: 150 }));
    header.click();
    await f.whenStable();
    expect(gantt.getState().sort ?? null).toBeNull();
    for (const [type, listener] of added.mock.calls) {
      expect(
        removed.mock.calls.some(c => c[0] === type && c[1] === listener),
        `${type} removed`,
      ).toBe(true);
    }

    // The guard lasts until the next task: a later click sorts again
    await new Promise(r => setTimeout(r));
    header.click();
    await f.whenStable();
    expect(gantt.getState().sort).toEqual({ key: 'name', dir: 'asc' });
  });

  it('a column resize interrupted by destroy leaves no listener and keeps the width reached', async () => {
    const f = await mount();
    const gantt = f.componentInstance.gantt();
    const handle = $(f, '.gantt-tl-col-header .gantt-col-resize');
    const added = vi.spyOn(handle, 'addEventListener');
    const removed = vi.spyOn(handle, 'removeEventListener');
    const start = gantt.getState().columnWidths?.['name'] ?? 0;
    const states: unknown[] = [];
    gantt.stateChange.subscribe(s => states.push(s));

    handle.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
    handle.dispatchEvent(pointer('pointermove', { clientX: 70 }));
    await f.whenStable();
    expect(added).toHaveBeenCalledTimes(4);

    f.destroy();

    for (const [type, listener] of added.mock.calls) {
      expect(
        removed.mock.calls.some(c => c[0] === type && c[1] === listener),
        `${type} removed`,
      ).toBe(true);
    }
    expect(gantt.getState().columnWidths?.['name']).toBe(start - 30);
    // A late move reaches nothing, and the aborted gesture reports no end
    handle.dispatchEvent(pointer('pointermove', { clientX: 10 }));
    expect(gantt.getState().columnWidths?.['name']).toBe(start - 30);
    await new Promise(r => setTimeout(r, 200));
    expect(states).toEqual([]);
  });
});
