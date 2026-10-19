// Phase 10 step 4.8 — the narrow-width view switch (`options.responsive`, D2; core
// `reduceResponsive`) in Angular, the Web Component's step 4.2
// (`packages/vanilla/src/__tests__/responsive.test.ts`): the measured chart width forces
// `responsive.view` below the breakpoint (`data-narrow` on the host), a view the user picks while
// narrow wins until the width crosses back, which restores the wide view; the forced view is never
// saved (`getState().view` keeps the wide view, no `saveState`), and a view the options apply while
// narrow becomes the wide view.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttResponsive } from './layout/responsive';

function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + i),
    end: new Date(2026, 2, 9 + i),
  }));
}

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan(3));
  readonly options = signal<GanttOptions>({});
  readonly gantt = viewChild.required(GantryComponent);
}

/** The chart's ResizeObserver callback (the panes), driven by the test */
let measure: (() => void) | undefined;

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  responsive: GanttResponsive;
  set(change: () => void): Promise<void>;
  /** The chart's width becomes `width` (the ResizeObserver fires), then a render. */
  resize(width: number): Promise<void>;
  narrow(): boolean;
}

/** A chart `width` px wide once measured (`initialScroll` off; responsive on, as by default). */
async function mount(options: GanttOptions = {}, width = 1150): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set({ initialScroll: false, ...options });
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  const main = host.querySelector<HTMLElement>('.gantry-main')!;
  let mainWidth = 0;
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => mainWidth });
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    responsive: debug.injector.get(GanttResponsive),
    async set(change) {
      change();
      await f.whenStable();
    },
    async resize(px) {
      mainWidth = px;
      measure?.();
      await f.whenStable();
    },
    narrow: () => host.hasAttribute('data-narrow'),
  };
  await c.resize(width);
  return c;
}

describe('responsive view (Phase 10 step 4.8)', () => {
  /** `saveState` calls (debounced `stateChange` + `stateKey` write): the forced view never saves */
  let saves: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    measure = undefined;
    saves = vi.spyOn(GantryComponent.prototype as unknown as { saveState(): void }, 'saveState');
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          // The chart's observer is the first one made (the toolbar's comes once it has a width)
          measure ??= cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('a chart narrower than 640 px shows the chart view once measured; the wide view is kept', async () => {
    const c = await mount({}, 500);
    expect(c.gantt.view()).toBe('chart');
    expect(c.narrow()).toBe(true);
    expect(c.host.getAttribute('data-view')).toBe('chart');
    expect(c.responsive.narrow()).toBe(true);
    // The forced view is never persisted
    expect(c.gantt.getState()).toMatchObject({ view: 'split', panelCollapsed: false });
    expect(saves).not.toHaveBeenCalled();
  });

  it('crossing the breakpoint switches and restores the view, without saving state', async () => {
    const c = await mount({}, 1150);
    expect(c.narrow()).toBe(false);
    await c.resize(640);
    expect(c.gantt.view()).toBe('split');
    await c.resize(639);
    expect(c.gantt.view()).toBe('chart');
    expect(c.narrow()).toBe(true);
    await c.resize(400);
    expect(c.gantt.view()).toBe('chart');
    await c.resize(900);
    expect(c.gantt.view()).toBe('split');
    expect(c.narrow()).toBe(false);
    expect(c.host.getAttribute('data-view')).toBe('split');
    expect(saves).not.toHaveBeenCalled();
  });

  it('restores the view shown before the chart became narrow', async () => {
    const c = await mount({ view: 'table' }, 1150);
    await c.resize(500);
    expect(c.gantt.view()).toBe('chart');
    expect(c.gantt.getState().view).toBe('table');
    await c.resize(1000);
    expect(c.gantt.view()).toBe('table');
  });

  it('a view the user picks while narrow wins until the width crosses back', async () => {
    const c = await mount({}, 500);
    await c.set(() => c.gantt.setView('table'));
    expect(c.gantt.view()).toBe('table');
    await c.resize(450);
    expect(c.gantt.view()).toBe('table');
    // Persisted: the wide view, still
    expect(c.gantt.getState().view).toBe('split');
    await c.resize(1000);
    expect(c.gantt.view()).toBe('split');
    // Narrow again: forced again, the earlier pick is forgotten
    await c.resize(500);
    expect(c.gantt.view()).toBe('chart');
  });

  it('togglePanel() and the toolbar are user picks too', async () => {
    const c = await mount({ toolbar: { panelToggle: true } }, 500);
    await c.set(() => c.gantt.togglePanel());
    expect(c.gantt.view()).toBe('split');
    await c.resize(480);
    expect(c.gantt.view()).toBe('split');
    await c.resize(1000);
    await c.resize(500);
    expect(c.gantt.view()).toBe('chart');
    // The task-list toggle of the toolbar (it fits next to the More button)
    await c.set(() => c.host.querySelector<HTMLButtonElement>('[data-focus-key="panel"]')!.click());
    expect(c.gantt.view()).toBe('split');
    await c.resize(470);
    expect(c.gantt.view()).toBe('split');
  });

  it('follows responsive.breakpoint and responsive.view; false turns it off', async () => {
    const c = await mount({ responsive: { breakpoint: 900, view: 'table' } }, 800);
    expect(c.gantt.view()).toBe('table');
    expect(c.narrow()).toBe(true);
    // The options change: the switch looks again at the last width
    await c.set(() => c.h.options.update(o => ({ ...o, responsive: { breakpoint: 900, view: 'chart' } })));
    expect(c.gantt.view()).toBe('chart');
    await c.set(() => c.h.options.update(o => ({ ...o, responsive: false })));
    expect(c.gantt.view()).toBe('split');
    expect(c.responsive.narrow()).toBe(false);
    await c.resize(300);
    expect(c.gantt.view()).toBe('split');
    expect(c.narrow()).toBe(false);
  });

  it('an options view applied while narrow is the view restored once wide', async () => {
    const c = await mount({ view: 'split' }, 500);
    expect(c.gantt.view()).toBe('chart');
    await c.set(() => c.h.options.update(o => ({ ...o, view: 'table' })));
    expect(c.gantt.view()).toBe('chart');
    expect(c.gantt.getState().view).toBe('table');
    await c.resize(1000);
    expect(c.gantt.view()).toBe('table');
  });

  it('ignores an unmeasured width (0: hidden, not laid out)', async () => {
    const c = await mount({}, 0);
    expect(c.gantt.view()).toBe('split');
    expect(c.narrow()).toBe(false);
    await c.resize(500);
    expect(c.gantt.view()).toBe('chart');
    await c.resize(0);
    expect(c.gantt.view()).toBe('chart');
    expect(c.narrow()).toBe(true);
  });

  it('a restored state applied while narrow is the view restored once wide; options arriving later too', async () => {
    const c = await mount({}, 500);
    expect(c.gantt.view()).toBe('chart');
    // setState is not a user pick: the forced view stays, the restored one is persisted
    await c.set(() => c.gantt.setState({ view: 'table' }, false));
    expect(c.gantt.view()).toBe('chart');
    expect(c.gantt.getState().view).toBe('table');
    // Options assigned later (a new object with a view) while still narrow
    await c.set(() => c.h.options.set({ initialScroll: false, view: 'split' }));
    expect(c.gantt.view()).toBe('chart');
    expect(c.gantt.getState().view).toBe('split');
    await c.resize(1000);
    expect(c.gantt.view()).toBe('split');
  });
});
