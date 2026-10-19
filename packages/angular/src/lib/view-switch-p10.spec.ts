// Phase 10 review fixes (step 7.1) — the view switch, as the Web Component's
// (`packages/vanilla/src/__tests__/responsive.test.ts`, `toolbar-p10.test.ts`):
// - the task list toggle says what a press does in every view (core `taskListShown` /
//   `togglePanelView`): pressed and "Hide task list" in the split and table views, and a press from
//   the table view hides the task list (the chart view), not the split view;
// - `setState()` re-checks the narrow width at once: a view restored while narrow becomes the wide
//   view before `setState()` returns (no render in between);
// - `setView()` with the view shown is no pick (it returns before telling the responsive switch), so a
//   new `responsive.view` is still forced.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DEFAULT_LABELS, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';

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
  set(change: () => void): Promise<void>;
  resize(width: number): Promise<void>;
  panel(): HTMLButtonElement;
}

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
    async set(change) {
      change();
      await f.whenStable();
    },
    async resize(px) {
      mainWidth = px;
      measure?.();
      await f.whenStable();
    },
    panel: () => host.querySelector<HTMLButtonElement>('[data-focus-key="panel"]')!,
  };
  await c.resize(width);
  return c;
}

describe('view switch fixes (Phase 10 step 7.1)', () => {
  let saves: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    measure = undefined;
    saves = vi.spyOn(GantryComponent.prototype as unknown as { saveState(): void }, 'saveState');
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
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

  it('the task list toggle is pressed ("Hide task list") in the table view, and a press hides the list', async () => {
    const c = await mount({ toolbar: { panelToggle: true }, view: 'table', responsive: false });
    expect(c.gantt.view()).toBe('table');
    expect(c.panel().getAttribute('aria-pressed')).toBe('true');
    expect(c.panel().getAttribute('title')).toBe(DEFAULT_LABELS.hidePanel);
    await c.set(() => c.panel().click());
    expect(c.gantt.view()).toBe('chart');
    expect(c.panel().getAttribute('aria-pressed')).toBe('false');
    expect(c.panel().getAttribute('title')).toBe(DEFAULT_LABELS.showPanel);
    // togglePanel() follows the same rule (core togglePanelView)
    await c.set(() => c.gantt.setView('table'));
    await c.set(() => c.gantt.togglePanel());
    expect(c.gantt.view()).toBe('chart');
    await c.set(() => c.gantt.togglePanel());
    expect(c.gantt.view()).toBe('split');
  });

  it('setState() re-checks the narrow width at once: the restored view becomes the wide view', async () => {
    const c = await mount({}, 500);
    expect(c.gantt.view()).toBe('chart');
    // No render in between: right as setState() returns
    c.gantt.setState({ view: 'table' }, false);
    expect(c.gantt.view()).toBe('chart');
    expect(c.gantt.getState().view).toBe('table');
    await c.f.whenStable();
    expect(c.gantt.view()).toBe('chart');
    await c.resize(1000);
    expect(c.gantt.view()).toBe('table');
    expect(saves).not.toHaveBeenCalled();
  });

  it('setView() with the view shown is no pick: a new responsive.view is still forced', async () => {
    const c = await mount({}, 500);
    expect(c.gantt.view()).toBe('chart');
    await c.set(() => c.gantt.setView('chart'));
    expect(saves).not.toHaveBeenCalled();
    await c.set(() => c.h.options.update(o => ({ ...o, responsive: { breakpoint: 640, view: 'table' } })));
    expect(c.gantt.view()).toBe('table');
    // A real pick wins over it
    await c.set(() => c.gantt.setView('split'));
    await c.set(() => c.h.options.update(o => ({ ...o, responsive: { breakpoint: 640, view: 'chart' } })));
    expect(c.gantt.view()).toBe('split');
  });
});
