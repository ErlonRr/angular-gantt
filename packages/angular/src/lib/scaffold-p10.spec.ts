// The phase 10 scaffold of <gantry> (Gantry 2 phase 10, step 3.2): the `syncGroup` input and the sync
// member's hooks, the host's `data-density` / `data-narrow` and layout variables, the responsive hooks,
// the layout graph's rollups (`applyRollups` before the sort, raw events), `groupBar.collapsed` seeding,
// row styles (`computeBarVisual` style, custom bars' `ctx.style` and style classes), rollup segments,
// the natural and shared ranges, `fitToScreen` with the shared extent, and the zoom anchor read from
// the viewport. Nothing here paints differently by default.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  TaskType,
  anchoredScrollLeft,
  createGanttSyncGroup,
  fitZoomLevel,
  layoutCssVars,
  resolveConfig,
  rollupSource,
  timelineRange,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttOptions,
  type GanttSyncGroup,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttBarBase } from './bars/bar-base';
import { provideGanttBar } from './bar-registry';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttResponsive } from './layout/responsive';
import { GanttSync } from './sync/gantt-sync';

const day = (d: number) => new Date(2026, 2, d);
/** p rolls up to 50 % (4 days at 100 %, 8 days at 25 %) over 2–14 Mar; q to 10 % over 4–8 Mar */
const TASKS: GanttTask[] = [
  { id: 'p', name: 'Parent', type: TaskType.Group, start: day(1), end: day(30), progress: 5 },
  { id: 'a', name: 'Alpha', parentId: 'p', start: day(2), end: day(6), progress: 100 },
  { id: 'b', name: 'Beta', parentId: 'p', start: day(6), end: day(14), progress: 25 },
  {
    id: 'q',
    name: 'Second',
    barType: 'styled',
    start: day(3),
    end: day(20),
    progress: 90,
    style: { className: 'mine' },
  },
  { id: 'c', name: 'Gamma', parentId: 'q', start: day(4), end: day(8), progress: 10 },
];

/** Every mounted custom bar (its context is read through it) */
const live = new Set<StyledBar>();

@Component({
  selector: 'g[p10StyledBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'own' },
  template: '<svg:rect class="styled-rect" [attr.x]="ctx().visual.x" [style.fill]="ctx().style.color ?? null" />',
})
class StyledBar extends GanttBarBase {
  constructor() {
    super();
    live.add(this);
    inject(DestroyRef).onDestroy(() => live.delete(this));
  }
}

@Component({
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: 'styled', component: StyledBar })],
  template: `<gantry
    style="height: 400px"
    [series]="tasks()"
    [options]="options()"
    [syncGroup]="group()"
    (rowClick)="clicks.push($event)"
    (rowDblClick)="dblClicks.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly group = signal<GanttSyncGroup | null>(null);
  readonly clicks: GanttFlatRow[] = [];
  readonly dblClicks: GanttFlatRow[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  sync: GanttSync;
  responsive: GanttResponsive;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    scroll: debug.injector.get(GanttScrollService),
    sync: debug.injector.get(GanttSync),
    responsive: debug.injector.get(GanttResponsive),
    async set(change) {
      change();
      await f.whenStable();
    },
    $(sel) {
      const el = host.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      return el;
    },
  };
}

const rowOf = (c: Chart, id: string) => c.layout.visibleRows().find(r => r.task.id === id);
const ctxOf = (id: string): GanttBarContext | undefined =>
  [...live].map(bar => bar.ctx()).find(ctx => ctx.row.task.id === id);
const rawTask = (c: Chart, id: string) => c.layout.tasks().find(t => t.id === id);

beforeEach(() => {
  vi.restoreAllMocks();
  live.clear();
});

describe('[syncGroup]', () => {
  it('defaults to null; the sync member follows the input, leaves on null and when the chart is destroyed', async () => {
    const c = await mount();
    expect(c.gantt.syncGroup()).toBeNull();
    expect(c.sync.group).toBeNull();

    const one = createGanttSyncGroup();
    await c.set(() => c.h.group.set(one));
    expect(c.sync.group).toBe(one);

    const two = createGanttSyncGroup({ panel: false });
    await c.set(() => c.h.group.set(two));
    expect(c.sync.group).toBe(two);

    await c.set(() => c.h.group.set(null));
    expect(c.sync.group).toBeNull();

    await c.set(() => c.h.group.set(one));
    const disconnect = vi.spyOn(c.sync, 'disconnect');
    c.f.destroy();
    expect(disconnect).toHaveBeenCalled();
    expect(c.sync.group).toBeNull();
  });

  it('the splitter, setState() and zoom levels after the first render reach the sync member', async () => {
    const reportLevel = vi.spyOn(GanttSync.prototype, 'reportLevel');
    const reportPanel = vi.spyOn(GanttSync.prototype, 'reportPanel');
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Week', panel: { width: 300 } }));
    expect(reportLevel).not.toHaveBeenCalled();

    await c.set(() => c.gantt.zoomIn());
    expect(reportLevel).toHaveBeenLastCalledWith(c.layout.level());

    const handle = c.$('.gantry-splitter-handle');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await c.f.whenStable();
    expect(reportPanel).toHaveBeenLastCalledWith(c.layout.panelWidthPx());

    c.gantt.setState({ panelWidth: 320 }, false);
    expect(reportPanel).toHaveBeenLastCalledWith(320);
  });

  it('a group scroll replaces initialScroll on the first render with rows (applyScroll)', async () => {
    const scrollToX = vi.spyOn(GanttScrollService.prototype, 'scrollToX');
    const apply = vi.spyOn(GanttSync.prototype, 'applyScroll').mockReturnValueOnce(true);
    const c = await mount(h => h.options.set({ initialScroll: day(25) }));
    expect(apply).toHaveBeenCalled();
    expect(scrollToX).not.toHaveBeenCalled();
    expect(c.layout.initialScrollPending()).toBe(false);
  });

  it('without a group scroll, initialScroll applies as before', async () => {
    const scrollToX = vi.spyOn(GanttScrollService.prototype, 'scrollToX');
    await mount(h => h.options.set({ initialScroll: day(25) }));
    expect(scrollToX).toHaveBeenCalledWith(expect.any(Number), 'instant');
  });
});

describe('host attributes and layout variables', () => {
  it('data-density, no data-narrow, and the layout variables next to the theme tokens (default output)', async () => {
    const c = await mount();
    expect(c.host.getAttribute('data-density')).toBe('normal');
    expect(c.host.hasAttribute('data-narrow')).toBe(false);
    const style = c.host.style;
    expect(style.getPropertyValue('--gantt-row-height')).toBe('36px');
    expect(style.getPropertyValue('--gantt-bar-height')).toBe('21.6px');
    expect(style.getPropertyValue('--gantry-control-size')).toBe('32px');
    // The theme tokens are still there
    expect(style.getPropertyValue('--gantt-bar')).not.toBe('');
  });

  it('follow density and explicit sizes (core layoutCssVars)', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, density: 'compact' }));
    expect(c.host.getAttribute('data-density')).toBe('compact');
    expect(c.host.style.getPropertyValue('--gantt-row-height')).toBe('28px');
    expect(c.host.style.getPropertyValue('--gantry-control-size')).toBe('28px');

    await c.set(() => c.h.options.set({ initialScroll: false, density: 'comfortable', rowHeight: 40 }));
    const [[, row], [, bar]] = layoutCssVars(resolveConfig({ density: 'comfortable', rowHeight: 40 }));
    expect(c.host.getAttribute('data-density')).toBe('comfortable');
    expect(c.host.style.getPropertyValue('--gantt-row-height')).toBe(row);
    expect(c.host.style.getPropertyValue('--gantt-bar-height')).toBe(bar);
    expect(c.host.style.getPropertyValue('--gantry-control-size')).toBe('36px');
  });
});

describe('responsive hooks', () => {
  it('hears the measured width and the views the user picks; getState persists the responsive view', async () => {
    const onWidth = vi.spyOn(GanttResponsive.prototype, 'onWidth');
    const userView = vi.spyOn(GanttResponsive.prototype, 'userView');
    const c = await mount();
    expect(onWidth).toHaveBeenCalledWith(expect.any(Number));

    await c.set(() => c.gantt.setView('table'));
    expect(userView).toHaveBeenLastCalledWith('table');
    // From the table view the toggle hides the task list: the chart view (core togglePanelView)
    await c.set(() => c.gantt.togglePanel());
    expect(userView).toHaveBeenLastCalledWith('chart');
    // The stub never forces a view: the shown view is persisted
    expect(c.gantt.getState().view).toBe('chart');

    // A narrow chart persists its wide view, not the one shown
    vi.spyOn(c.responsive, 'persistedView').mockReturnValue('split');
    const state = c.gantt.getState();
    expect(state.view).toBe('split');
    expect(state.panelCollapsed).toBe(false);
  });
});

describe('rollups in the layout graph', () => {
  it('rolled-up parents carry a copy of their task; the raw tasks, the selection and the events stay raw', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, rollup: true }));
    const p = rowOf(c, 'p')!;
    expect(p.task.progress).toBe(50);
    expect(p.task.start).toEqual(day(2));
    expect(p.task.end).toEqual(day(14));
    expect(p.task.draggable).toBe(false);
    expect(rollupSource(p.task)).toBe(rawTask(c, 'p'));
    expect(rawTask(c, 'p')!.progress).toBe(5);
    // The columns read the copy
    expect(c.$('.gantt-tl-row[data-task-id="p"]').textContent).toContain('50%');

    c.gantt.setSelectedTasks(['p']);
    expect(c.gantt.getSelectedTasks().map(t => t.progress)).toEqual([5]);

    const row = c.$('.gantt-tl-row[data-task-id="p"]');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await c.f.whenStable();
    expect(c.h.clicks.at(-1)?.task).toBe(rawTask(c, 'p'));
    expect(c.h.dblClicks.at(-1)?.task).toBe(rawTask(c, 'p'));

    // The timeline's double-click (the first row) too
    c.$('gantt-canvas svg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 4, clientY: 4 }));
    expect(c.h.dblClicks.at(-1)?.task).toBe(rawTask(c, 'p'));
  });

  it('a sort reads the rolled-up values (applyRollups runs before sortTree)', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false }));
    await c.set(() => c.layout.toggleSort('progress'));
    expect(
      c.layout
        .visibleRows()
        .filter(r => r.level === 0)
        .map(r => r.task.id),
    ).toEqual(['p', 'q']);
    await c.set(() => c.h.options.set({ initialScroll: false, rollup: true }));
    // p rolls up to 50 %, q to 10 %
    expect(
      c.layout
        .visibleRows()
        .filter(r => r.level === 0)
        .map(r => r.task.id),
    ).toEqual(['q', 'p']);
  });

  it('a zoom keeps the rollups and the rows (the rollup input is compared field by field)', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, rollup: true, viewMode: 'Week' }));
    const rollups = c.layout.rollups();
    const rows = c.layout.allRows();
    await c.set(() => c.gantt.zoomIn());
    expect(c.layout.rollups()).toBe(rollups);
    expect(c.layout.allRows()).toBe(rows);
  });

  it('rollup.segments: a collapsed rolled-up parent gets its children as segments, an expanded one none', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, rollup: { segments: true } }));
    expect(c.gantt.getBarVisual('p')?.segments ?? null).toBeNull();
    await c.set(() => c.layout.toggleCollapse('p'));
    expect(c.gantt.getBarVisual('p')?.segments).toHaveLength(2);
    // Without segments: none
    await c.set(() => c.h.options.set({ initialScroll: false, rollup: true }));
    expect(c.gantt.getBarVisual('p')?.segments ?? null).toBeNull();
  });
});

describe('groupBar.collapsed', () => {
  it('collapses every parent the chart has never seen, once', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, groupBar: { collapsed: true } }));
    expect([...c.layout.collapsedIds()].sort()).toEqual(['p', 'q']);
    expect(c.layout.visibleRows().map(r => r.task.id)).toEqual(['p', 'q']);

    // The user's expand wins over the option for the ids already seen; a new parent starts collapsed
    await c.set(() => c.layout.toggleCollapse('p'));
    await c.set(() =>
      c.h.tasks.set([
        ...TASKS,
        { id: 'r', name: 'Third', start: day(5), end: day(9) },
        { id: 'd', name: 'Delta', parentId: 'r', start: day(5), end: day(9) },
      ]),
    );
    expect([...c.layout.collapsedIds()].sort()).toEqual(['q', 'r']);
  });

  it('is off by default', async () => {
    const c = await mount();
    expect(c.layout.collapsedIds().size).toBe(0);
  });
});

describe('row styles', () => {
  it('reach the bar visuals, custom bars (ctx.style) and a custom bar host (visual.className)', async () => {
    const c = await mount(h =>
      h.options.set({ initialScroll: false, styles: { parent: { color: '#123456', className: 'is-parent' } } }),
    );
    expect(c.gantt.getBarVisual('p')?.paint.body).toBe('#123456');
    expect(c.gantt.getBarVisual('a')?.paint.body).not.toBe('#123456');
    expect(c.layout.rowStyle()(rowOf(c, 'q')!)).toEqual({ color: '#123456', className: 'is-parent mine' });

    const ctx = ctxOf('q')!;
    expect(ctx.style).toEqual({ color: '#123456', className: 'is-parent mine' });
    expect(ctx.visual.className).toBe('is-parent mine');
    const q = c.$('.gantt-bars-layer > [data-task-id="q"]');
    expect([...q.classList].sort()).toEqual(['is-parent', 'mine', 'own']);
    expect(q.querySelector('.styled-rect')?.getAttribute('style')).toContain('fill');

    // A new class list replaces the classes the outlet added, never the component's own
    await c.set(() => c.h.options.set({ initialScroll: false, styles: { parent: { className: 'other' } } }));
    expect([...q.classList].sort()).toEqual(['mine', 'other', 'own']);
  });

  it('a selection keeps the unchanged rows’ contexts and their style objects', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, styles: { parent: { color: '#123456' } } }));
    const before = ctxOf('q')!;
    const style = before.style;
    await c.set(() => c.gantt.setSelectedTasks(['p']));
    expect(ctxOf('q')).toBe(before);
    await c.set(() => c.gantt.setSelectedTasks(['q']));
    expect(ctxOf('q')).not.toBe(before);
    expect(ctxOf('q')!.style).toBe(style);
  });

  it('unstyled tasks resolve to their own style (the default output)', async () => {
    const c = await mount();
    const style = c.layout.rowStyle();
    expect(style(rowOf(c, 'a')!)).toEqual({});
    expect(style(rowOf(c, 'q')!)).toEqual({ className: 'mine' });
    // A zoom keeps the resolver (and so every resolved style)
    await c.set(() => c.gantt.zoomIn());
    expect(c.layout.rowStyle()).toBe(style);
  });
});

describe('natural and shared ranges', () => {
  it('naturalRange is the chart’s own range; a shared range widens the timeline, not the natural range', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Week' }));
    const own = timelineRange({ tasks: c.layout.tasks(), config: c.layout.cfg(), now: c.layout.nowDay() });
    const natural = c.layout.naturalRange();
    expect(natural).toEqual(own);
    expect(c.layout.timeline().sharedExtent).toBeNull();

    const start = new Date(2025, 11, 1);
    const extent = { start: new Date(2025, 11, 15), end: day(10) };
    await c.set(() => c.layout.shared.set({ range: { start, end: day(20) }, extent }));
    const tl = c.layout.timeline();
    expect(tl.start.getTime()).toBeLessThanOrEqual(start.getTime());
    expect(tl.sharedExtent?.start).toEqual(extent.start);
    expect(c.layout.naturalRange()).toBe(natural);

    // An equal patch (by date) rebuilds nothing
    await c.set(() => c.layout.shared.set({ range: { start: new Date(start), end: day(20) }, extent: { ...extent } }));
    expect(c.layout.timeline()).toBe(tl);
  });

  it('fitToScreen() fits the shared extent inside a group', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Day' }));
    const extent = { start: new Date(2025, 0, 1), end: new Date(2026, 11, 31) };
    await c.set(() => {
      c.layout.viewportWidth.set(900);
      c.layout.shared.set({ range: extent, extent });
    });
    const expected = fitZoomLevel({
      levels: c.layout.cfg().zoomLevels,
      extent: c.layout.timeline().sharedExtent,
      viewportWidth: 900,
    });
    const own = fitZoomLevel({
      levels: c.layout.cfg().zoomLevels,
      extent: c.layout.timeline().extent,
      viewportWidth: 900,
    });
    expect(expected).not.toBe(own);
    await c.set(() => c.gantt.fitToScreen());
    expect(c.layout.level()).toBe(expected);
  });
});

describe('zoom anchoring', () => {
  it('reads the viewport’s own scrollLeft (the scroll signal may lag behind it)', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Week' }));
    const canvas = c.$('.gantry-canvas-viewport');
    canvas.scrollLeft = 300;
    const left = canvas.scrollLeft;
    // No scroll event yet: the scroll signal still says 0
    expect(left).toBe(300);
    expect(c.scroll.scrollLeft()).toBe(0);
    const prev = c.layout.timeline();
    const scrollTo = vi.spyOn(c.scroll, 'scrollToX');
    await c.set(() => c.layout.zoomBy(1, 120));
    expect(scrollTo).toHaveBeenCalledWith(
      anchoredScrollLeft(prev, c.layout.timeline(), left, canvas.clientWidth, 120),
      'instant',
    );
  });
});
