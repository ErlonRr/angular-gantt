// The phase 9 scaffold of <gantry> (Gantry 2 phase 9, step 3.2): the public surface (`loading`,
// `errorMessage`, `retry`, `fitToScreen()`, `<ng-template ganttTooltip>`, `[ganttEmpty]`), the static
// ARIA of the Web Component's contract (svg listbox, every bar an option — custom bars too — the
// treegrid's column indexes and positions in the set), the header height with the marker lane
// (task-list header, sticky header, `scroll-padding-top`, splitter toggle), the extracted legend and
// annotation layers, the drag service's external previews and the zoom anchor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  FOCUS_RING_MARGIN,
  MARKER_LANE_HEIGHT,
  SPLITTER_TOGGLE_OFFSET,
  TaskType,
  anchoredScrollLeft,
  announceZoom,
  fitScrollLeft,
  fitZoomLevel,
  type GanttAnnotation,
  type GanttOptions,
  type DragPreview,
  type GanttTask,
  type RetryEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttBarBase } from './bars/bar-base';
import { provideGanttBar } from './bar-registry';
import { GanttDataSource } from './datasource/gantt-datasource';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttTooltipState } from './tooltip/tooltip-state';
import { GanttTooltipTemplateDirective } from './tooltip/gantt-tooltip-template.directive';

const day = (d: number) => new Date(2026, 2, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(2), end: day(20) },
  { id: 'a', name: 'Alpha', parentId: 'g', start: day(2), end: day(9) },
  { id: 'b', name: 'Beta', parentId: 'g', start: day(9), end: day(16) },
  { id: 'm', name: 'Review', type: TaskType.Milestone, start: day(18), end: day(18) },
  { id: 'e', name: 'Epic', barType: 'epic', start: day(4), end: day(14) },
];
const LABELLED: GanttAnnotation[] = [{ x1: day(10), label: { text: 'Freeze' } }];

/** A custom bar that binds nothing on its host: the outlet stamps it like the built-in ones */
@Component({
  selector: 'g[scaffoldEpicBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img' },
  template: '<svg:rect class="epic-rect" [attr.x]="ctx().visual.x" [attr.width]="ctx().visual.width" />',
})
class EpicBar extends GanttBarBase {}

@Component({
  imports: [GantryComponent, GanttTooltipTemplateDirective],
  providers: [provideGanttBar({ type: 'epic', component: EpicBar })],
  template: `<gantry
    style="height: 500px"
    [series]="tasks()"
    [dataSource]="dataSource()"
    [options]="options()"
    [annotations]="annotations()"
    [showLegend]="showLegend()"
    [loading]="loading()"
    [errorMessage]="errorMessage()"
    (retry)="retries.push($event)"
  >
    @if (customEmpty()) {
      <div ganttEmpty class="my-empty">Nothing planned yet</div>
    }
    @if (customTooltip()) {
      <ng-template ganttTooltip let-model let-task="task">{{ task.name }}: {{ model.rows.length }}</ng-template>
    }
  </gantry>`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly dataSource = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly annotations = signal<GanttAnnotation[]>([]);
  readonly showLegend = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly customEmpty = signal(false);
  readonly customTooltip = signal(false);
  readonly retries: RetryEvent[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

/** A chart with no tasks and no `[ganttEmpty]` content (an `@if` around it would still fill the slot) */
@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 300px" [series]="[]" [options]="{ initialScroll: false }" />`,
})
class EmptyHost {}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  drag: GanttDragService;
  tooltip: GanttTooltipState;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
  $$(sel: string): Element[];
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  const canvas = f.debugElement.query(By.directive(GanttCanvasComponent));
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    scroll: debug.injector.get(GanttScrollService),
    drag: debug.injector.get(GanttDragService),
    tooltip: canvas.injector.get(GanttTooltipState),
    async set(change) {
      change();
      await f.whenStable();
    },
    $(sel) {
      const el = host.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      return el;
    },
    $$: sel => [...host.querySelectorAll(sel)],
  };
}

const bar = (c: Chart, id: string) => c.$(`.gantt-bars-layer > [data-task-id="${id}"]`);
const settle = async (c: Chart) => {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
};

beforeEach(() => vi.restoreAllMocks());

describe('the timeline listbox and its options', () => {
  it('the svg is a vertical listbox named by labels.ariaBars, multi-selectable with selection + multiSelect', async () => {
    const c = await mount();
    const svg = c.$('gantt-canvas svg');
    expect(svg.getAttribute('role')).toBe('listbox');
    expect(svg.getAttribute('aria-label')).toBe(DEFAULT_LABELS.ariaBars);
    expect(svg.getAttribute('aria-orientation')).toBe('vertical');
    expect(svg.getAttribute('aria-multiselectable')).toBe('true');
    await c.set(() => c.h.options.set({ initialScroll: false, multiSelect: false }));
    expect(svg.getAttribute('aria-multiselectable')).toBe('false');
  });

  it('stamps every bar, custom ones included: option, name, role description, type, selection, position, focus key', async () => {
    const c = await mount();
    const bars = c.$$('.gantt-bars-layer > [data-task-id]');
    expect(bars.map(b => b.getAttribute('data-task-id')).sort()).toEqual(['a', 'b', 'e', 'g', 'm']);
    for (const b of bars) {
      const id = b.getAttribute('data-task-id');
      expect(b.getAttribute('role'), id!).toBe('option');
      expect(b.getAttribute('aria-label'), id!).toBeTruthy();
      expect(b.getAttribute('aria-selected'), id!).toBe('false');
      expect(b.getAttribute('data-focus-key'), id!).toBe(`bar:${id}`);
      // The bars rove (D5): one is the tab stop (0), the others -1
      expect(['0', '-1'], id!).toContain(b.getAttribute('tabindex'));
    }
    expect(bars.filter(b => b.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(bar(c, 'a').getAttribute('aria-roledescription')).toBe(DEFAULT_LABELS.ariaTask);
    expect(bar(c, 'm').getAttribute('aria-roledescription')).toBe(DEFAULT_LABELS.ariaMilestone);
    expect(bar(c, 'g').getAttribute('aria-roledescription')).toBe(DEFAULT_LABELS.ariaGroup);
    expect(bar(c, 'e').getAttribute('aria-roledescription')).toBe(DEFAULT_LABELS.ariaBarRole);
    expect(bar(c, 'e').getAttribute('data-bar-type')).toBe('epic');
    expect(bar(c, 'm').getAttribute('data-bar-type')).toBe('milestone');
    // The custom bar's own host role is overridden; its content is its own
    expect(bar(c, 'e').querySelector('.epic-rect')).not.toBeNull();
    expect(bar(c, 'e').getAttribute('aria-label')).toContain('Epic');
    // A flat listbox (O1): the place among every visible row, of the visible row count (the task list tells the tree)
    for (const r of c.layout.visibleRows()) {
      expect(bar(c, r.task.id).getAttribute('aria-posinset'), r.task.id).toBe(String(r.visibleIndex + 1));
      expect(bar(c, r.task.id).getAttribute('aria-setsize'), r.task.id).toBe('5');
    }
  });

  it('follows the selection and the labels; built-in bars bind no role or name of their own', async () => {
    const c = await mount();
    await c.set(() => c.gantt.setSelectedTasks(['a', 'e']));
    expect(bar(c, 'a').getAttribute('aria-selected')).toBe('true');
    expect(bar(c, 'e').getAttribute('aria-selected')).toBe('true');
    expect(bar(c, 'b').getAttribute('aria-selected')).toBe('false');

    await c.set(() =>
      c.h.options.set({ initialScroll: false, labels: { ariaTask: 'barra', ariaBarRole: 'elemento' } }),
    );
    expect(bar(c, 'a').getAttribute('aria-roledescription')).toBe('barra');
    expect(bar(c, 'e').getAttribute('aria-roledescription')).toBe('elemento');
    // The old 1.x list semantics are gone
    expect(c.$$('[role="listitem"], svg[role="list"]')).toHaveLength(0);
  });

  it('aria-describedby names the open tooltip on its bar only', async () => {
    const c = await mount();
    const row = c.layout.geometryById().get('b')!.row;
    await c.set(() => {
      c.tooltip.elementId.set('tip-1');
      c.tooltip.focus(row, bar(c, 'b'));
    });
    expect(bar(c, 'b').getAttribute('aria-describedby')).toBe('tip-1');
    expect(bar(c, 'a').hasAttribute('aria-describedby')).toBe(false);
    await c.set(() => c.tooltip.blur());
    expect(bar(c, 'b').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('task list static ARIA', () => {
  it('aria-colindex on header cells and cells, aria-posinset / aria-setsize on rows', async () => {
    const c = await mount();
    const heads = c.$$('.gantt-tl-col-header');
    expect(heads.map(h => h.getAttribute('aria-colindex'))).toEqual(heads.map((_, i) => String(i + 1)));
    const cells = c.$$('.gantt-tl-row[data-task-id="a"] .gantt-tl-cell');
    expect(cells.length).toBe(heads.length);
    expect(cells.map(h => h.getAttribute('aria-colindex'))).toEqual(heads.map((_, i) => String(i + 1)));
    const row = (id: string) => c.$(`.gantt-tl-row[data-task-id="${id}"]`);
    expect(['g', 'e', 'm'].map(id => row(id).getAttribute('aria-posinset'))).toEqual(['1', '2', '3']);
    expect(row('m').getAttribute('aria-setsize')).toBe('3');
    expect(row('b').getAttribute('aria-posinset')).toBe('2');
    expect(row('b').getAttribute('aria-setsize')).toBe('2');
  });
});

describe('header height with the marker lane', () => {
  it('a labelled annotation adds the 18 px lane: task-list header, sticky header, scroll padding, toggle', async () => {
    const c = await mount();
    const tiers = c.layout.timeline().headerHeight;
    expect(c.layout.markerLane().height).toBe(0);
    expect(c.layout.headerHeight()).toBe(tiers);

    await c.set(() => c.h.annotations.set(LABELLED));
    const h = tiers + MARKER_LANE_HEIGHT;
    expect(c.layout.headerHeight()).toBe(h);
    expect(c.$('.gantt-tl-col-headers').style.height).toBe(`${h}px`);
    expect(c.$('.gantry-canvas-header-sticky').style.height).toBe(`${h}px`);
    // The timeline adds the focus ring's reach (core timelineScrollPadding), the panel doesn't
    expect(c.$('.gantry-canvas-viewport').style.getPropertyValue('scroll-padding-top')).toBe(
      `${h + FOCUS_RING_MARGIN}px`,
    );
    expect(c.$('.gantry-panel').style.getPropertyValue('scroll-padding-top')).toBe(`${h}px`);
    expect(c.$('.gantry-splitter-toggle').style.top).toBe(`${h + SPLITTER_TOGGLE_OFFSET}px`);
    // The lane takes the label off the canvas (D12)
    expect(c.$$('.gantt-annotation-labels text')).toHaveLength(0);
    expect(c.$$('.g-marker-lane .g-marker-label').map(t => t.textContent)).toContain('Freeze');

    await c.set(() => c.h.options.set({ initialScroll: false, markers: { lane: false } }));
    expect(c.layout.headerHeight()).toBe(tiers);
  });

  it('the vertical window leaves the lane out of the rows viewport', async () => {
    const c = await mount(h => h.tasks.set(Array.from({ length: 100 }, (_, i) => ({ ...TASKS[1], id: `t${i}` }))));
    const rh = c.layout.rowHeight();
    await c.set(() => c.layout.viewportHeight.set(c.layout.timeline().headerHeight + 10 * rh));
    const without = c.layout.vWindow().last;
    await c.set(() => c.h.annotations.set(LABELLED));
    expect(c.layout.vWindow().last).toBeLessThanOrEqual(without);
  });
});

describe('extracted layers keep their elements', () => {
  it('the annotations are g.gantt-annotations (region + line) and g.gantt-annotation-labels', async () => {
    const c = await mount(h => {
      h.annotations.set([{ x1: day(5), x2: day(7), label: { text: 'Sprint' } }]);
      h.options.set({ initialScroll: false, markers: { lane: false } });
    });
    const layer = c.$('g.gantt-annotations');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect([...layer.children].map(e => e.localName)).toEqual(['rect', 'line']);
    const line = layer.querySelector('line')!;
    expect(line.getAttribute('stroke-dasharray')).toBe('5 3');
    expect(line.getAttribute('stroke-width')).toBe('1.5');
    expect(line.getAttribute('opacity')).toBe('0.8');
    expect(layer.querySelector('rect')!.getAttribute('opacity')).toBe('0.08');
    // Under the bars, the labels over them: the svg's layer order is unchanged
    const order = c.$$('gantt-canvas svg > *').map(e => e.getAttribute('class'));
    expect(order.indexOf('gantt-annotations')).toBeLessThan(order.indexOf('gantt-bars-layer'));
    expect(order.indexOf('gantt-annotation-labels')).toBe(order.indexOf('gantt-bars-layer') + 1);
    const text = c.$('g.gantt-annotation-labels text');
    expect(text.textContent?.trim()).toBe('Sprint');
    expect(Number(text.getAttribute('x'))).toBe(Number(line.getAttribute('x1')) + 6);
  });

  it('the legend is div.gantt-legend.gantt-legend--bottom after .gantry-main, attached while placed there', async () => {
    const c = await mount(h => {
      h.showLegend.set(true);
      h.annotations.set([{ x1: day(5), label: { text: 'Kick-off' } }]);
    });
    const legend = c.$('.gantt-legend');
    expect(legend.classList.contains('gantt-legend--bottom')).toBe(true);
    expect(legend.previousElementSibling?.classList.contains('gantry-main')).toBe(true);
    expect(legend.querySelector('.gantt-legend-title')?.textContent).toBe(DEFAULT_LABELS.legend);
    expect(c.$$('.gantt-legend-item').length).toBeGreaterThan(0);

    await c.set(() => c.gantt.setView('table'));
    expect(c.host.querySelector('.gantt-legend')).toBeNull();
    await c.set(() => c.gantt.setView('split'));
    // In the toolbar (the toolbar attaches it there): none under the chart
    await c.set(() => c.h.options.set({ initialScroll: false, legend: { position: 'toolbar' } }));
    expect(c.layout.legendPlacement()).toBe('toolbar');
    expect(c.host.querySelector('.gantt-legend--bottom')).toBeNull();
  });
});

describe('loading, errorMessage, retry and [ganttEmpty]', () => {
  it('loading with no rows shows the loading state and sets aria-busy; over rows only aria-busy', async () => {
    const c = await mount(h => {
      h.tasks.set([]);
      h.loading.set(true);
    });
    expect(c.host.getAttribute('aria-busy')).toBe('true');
    const state = c.$('.gantry-main > .gantt-state');
    expect(state.classList.contains('gantt-state--loading')).toBe(true);
    expect(state.querySelector('.gantt-skeleton')?.getAttribute('aria-hidden')).toBe('true');
    expect(state.style.top).toBe(`${c.layout.headerHeight()}px`);

    await c.set(() => c.h.tasks.set(TASKS));
    expect(c.host.querySelector('.gantt-state')).toBeNull();
    expect(c.host.getAttribute('aria-busy')).toBe('true');
    await c.set(() => c.h.loading.set(false));
    expect(c.host.hasAttribute('aria-busy')).toBe(false);
  });

  it('errorMessage shows the error box (role=alert); Retry emits retry { source: "error" }', async () => {
    const c = await mount(h => h.errorMessage.set('Server unreachable'));
    const box = c.$('.gantt-state--error .gantt-state-box');
    expect(box.getAttribute('role')).toBe('alert');
    expect(c.$('.gantt-state-title').textContent?.trim()).toBe(DEFAULT_LABELS.errorTitle);
    expect(c.$('.gantt-state-message').textContent?.trim()).toBe('Server unreachable');
    const retry = c.$('button.gantt-state-retry');
    expect(retry.getAttribute('data-focus-key')).toBe('retry');
    expect(retry.textContent?.trim()).toBe(DEFAULT_LABELS.retry);
    await c.set(() => retry.click());
    expect(c.h.retries).toEqual([{ source: 'error' }]);

    // A blank message shows none
    await c.set(() => c.h.errorMessage.set('  '));
    expect(c.host.querySelector('.gantt-state')).toBeNull();
  });

  it('a failed first data-source page: Retry emits { source: "dataSource" } and retries the source', async () => {
    let calls = 0;
    const ds = new GanttDataSource({
      fetcher: () => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(TASKS.slice(0, 2))),
      pageSize: 30,
      retries: 0,
    });
    const c = await mount(h => {
      h.tasks.set([]);
      h.dataSource.set(ds);
    });
    await vi.waitFor(() => expect(ds.error()).not.toBeNull());
    await c.f.whenStable();
    // No footer over the state box
    expect(c.host.querySelector('gantt-load-more')).toBeNull();
    const retrySpy = vi.spyOn(ds, 'retry');
    await c.set(() => c.$('button.gantt-state-retry').click());
    expect(c.h.retries).toEqual([{ source: 'dataSource' }]);
    expect(retrySpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(ds.items().length).toBe(2));
    await c.f.whenStable();
    expect(c.host.querySelector('.gantt-state')).toBeNull();
    expect(c.host.querySelector('gantt-load-more')).not.toBeNull();
  });

  it('the empty state shows labels.emptyState without [ganttEmpty] content', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(EmptyHost);
    await f.whenStable();
    const host = f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement;
    const state = host.querySelector('.gantry-main > .gantt-state')!;
    expect(state.classList.contains('gantt-state--empty')).toBe(true);
    expect(state.querySelector('.gantt-state-box > .gantt-state-message')?.textContent).toBe(DEFAULT_LABELS.emptyState);
    expect(host.hasAttribute('aria-busy')).toBe(false);
    expect(host.querySelector('gantt-load-more')).toBeNull();
  });

  it('projects [ganttEmpty] into the empty state box', async () => {
    const c = await mount(h => {
      h.tasks.set([]);
      h.customEmpty.set(true);
    });
    const box = c.$('.gantt-state--empty .gantt-state-box');
    expect(box.querySelector('.my-empty')?.textContent).toBe('Nothing planned yet');
    expect(box.querySelector('.gantt-state-message')).toBeNull();
  });
});

describe('fitToScreen()', () => {
  it('switches to the finest level that fits, scrolls to the first task once painted, and announces it', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Day' }));
    await c.set(() => c.layout.viewportWidth.set(900));
    const expected = fitZoomLevel({
      levels: c.layout.cfg().zoomLevels,
      extent: c.layout.timeline().extent,
      viewportWidth: 900,
    });
    expect(expected).not.toBeNull();
    expect(expected).not.toBe('Day');
    const scrollTo = vi.spyOn(c.scroll, 'scrollToX');
    const changes: (string | undefined)[] = [];
    c.gantt.viewMode.subscribe(v => changes.push(v));

    await c.set(() => c.gantt.fitToScreen());
    expect(c.layout.level()).toBe(expected);
    expect(changes).toEqual([expected]);
    expect(c.layout.scrollRequest()).toBeNull();
    const canvas = c.$('.gantry-canvas-viewport');
    expect(scrollTo).toHaveBeenLastCalledWith(fitScrollLeft(c.layout.timeline(), canvas.clientWidth), 'instant');

    await settle(c);
    expect(c.$('.gantt-sr-live').textContent).toBe(announceZoom(c.layout.levelLabel(), DEFAULT_LABELS));
  });

  it('does nothing before the viewport is measured or without tasks', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Day' }));
    await c.set(() => c.gantt.fitToScreen());
    expect(c.layout.level()).toBe('Day');
    await c.set(() => {
      c.h.tasks.set([]);
      c.layout.viewportWidth.set(900);
    });
    await c.set(() => c.gantt.fitToScreen());
    expect(c.layout.level()).toBe('Day');
  });
});

describe('zoom anchoring and announcement', () => {
  it('a zoom with an anchor keeps the date under it (anchoredScrollLeft), then the anchor is consumed', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Week' }));
    const prev = c.layout.timeline();
    const scrollTo = vi.spyOn(c.scroll, 'scrollToX');
    const canvas = c.$('.gantry-canvas-viewport');
    await c.set(() => c.layout.zoomBy(1, 120));
    const next = c.layout.timeline();
    expect(next.pxPerDay).toBeGreaterThan(prev.pxPerDay);
    expect(scrollTo).toHaveBeenCalledWith(
      anchoredScrollLeft(prev, next, c.scroll.scrollLeft(), canvas.clientWidth, 120),
      'instant',
    );
    expect(c.layout.zoomAnchorX()).toBeNull();
  });

  it('zoomBy at the last level changes nothing; a zoom level change is announced with its label', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Week' }));
    await c.set(() => c.gantt.zoomIn());
    await settle(c);
    expect(c.$('.gantt-sr-live').textContent).toBe(announceZoom(c.layout.levelLabel(), DEFAULT_LABELS));
    const levels = c.layout.cfg().zoomLevels;
    await c.set(() => c.layout.level.set(levels[0].name));
    await c.set(() => c.layout.zoomBy(5, 40));
    expect(c.layout.level()).toBe(levels[0].name);
    expect(c.layout.zoomAnchorX()).toBeNull();
  });
});

describe('<ng-template ganttTooltip>', () => {
  it('reaches the chart tooltip state (and goes when removed)', async () => {
    const c = await mount(h => h.customTooltip.set(true));
    expect(c.tooltip.template()).not.toBeNull();
    await c.set(() => c.h.customTooltip.set(false));
    expect(c.tooltip.template()).toBeNull();
  });
});

describe('tooltip trigger API', () => {
  it('focus opens at once, blur closes a focus tooltip; tap toggles; dismiss reports whether one was open', async () => {
    const c = await mount();
    const row = c.layout.geometryById().get('a')!.row;
    await c.set(() => c.tooltip.focus(row, bar(c, 'a')));
    expect(c.tooltip.row()?.task.id).toBe('a');
    expect(c.tooltip.source()).toBe('focus');
    expect(c.tooltip.anchor()).toBe(bar(c, 'a'));
    await c.set(() => c.tooltip.blur());
    expect(c.tooltip.open()).toBe(false);

    await c.set(() => c.tooltip.tap(row, bar(c, 'a')));
    expect(c.tooltip.open()).toBe(true);
    await c.set(() => c.tooltip.tap(row, bar(c, 'a')));
    expect(c.tooltip.open()).toBe(false);

    await c.set(() => c.tooltip.tap(row, bar(c, 'a')));
    expect(c.tooltip.dismiss()).toBe(true);
    expect(c.tooltip.dismiss()).toBe(false);
  });
});

describe('external drag previews (keyboard move mode)', () => {
  it('pins and dims the bar, draws the ghost and the readout, keeps focus, and resets on endExternal', async () => {
    const c = await mount();
    expect(c.drag.startExternal('b')).toBe(true);
    // A second session cannot start meanwhile
    expect(c.drag.startExternal('a')).toBe(false);
    await c.f.whenStable();
    expect(c.drag.isActive()).toBe(true);
    expect(c.drag.isPointerDrag()).toBe(false);
    expect((bar(c, 'b') as unknown as SVGGElement).style.getPropertyValue('opacity')).not.toBe('');
    expect(c.host.querySelector('.gantt-drag-readout')).toBeNull();

    const geo = c.layout.geometryById().get('b')!;
    const preview: DragPreview = {
      taskId: 'b',
      x: geo.barX + 10,
      width: geo.barWidth,
      y: geo.y + 4,
      height: geo.height - 8,
      delta: 1,
      unit: 'day',
      daysDelta: 1,
      start: day(10),
      end: day(17),
    };
    await c.set(() => c.drag.setExternalPreview(preview));
    expect(c.host.querySelector('.gantt-drag-preview')).not.toBeNull();
    const readout = c.$('.gantry-canvas-viewport > .gantt-drag-readout');
    expect(readout.getAttribute('aria-hidden')).toBe('true');
    expect(readout.previousElementSibling?.localName).toBe('gantt-canvas');
    // The pointer-drag focus move does not apply
    expect(document.activeElement).not.toBe(c.$('.gantry-canvas-viewport'));

    await c.set(() => c.drag.endExternal());
    expect(c.drag.isActive()).toBe(false);
    expect(c.drag.preview()).toBeNull();
    expect(c.host.querySelector('.gantt-drag-readout')).toBeNull();
    expect((bar(c, 'b') as unknown as SVGGElement).style.getPropertyValue('opacity')).toBe('');
    // setExternalPreview outside a session is ignored
    c.drag.setExternalPreview(preview);
    expect(c.drag.preview()).toBeNull();
  });
});

describe('host', () => {
  it('sets its own line-height', async () => {
    await mount();
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    expect(css).toMatch(/\[_nghost-[^\]]+\]\s*\{[^}]*line-height:\s*normal/);
  });

  it('the viewport is the timeline tab stop only while no bar is mounted (the bars rove)', async () => {
    const c = await mount();
    expect(c.$('.gantry-canvas-viewport').getAttribute('tabindex')).toBe('-1');
    await c.set(() => c.h.tasks.set([]));
    expect(c.$('.gantry-canvas-viewport').getAttribute('tabindex')).toBe('0');
  });
});

describe('GanttDataSource.ɵsubscribe', () => {
  it('hands every load-state change to its listeners, previous and next, until unsubscribed', async () => {
    let resolve!: (tasks: GanttTask[]) => void;
    const ds = new GanttDataSource({
      fetcher: () => new Promise<GanttTask[]>(r => (resolve = r)),
      pageSize: 2,
      initialPage: 0,
    });
    const seen: [boolean, boolean, number][] = [];
    const off = ds.ɵsubscribe((prev, next) => seen.push([prev.isLoading, next.isLoading, next.loadedCount]));
    void ds.loadNext();
    expect(seen).toEqual([[false, true, 0]]);
    resolve(TASKS.slice(0, 1));
    await vi.waitFor(() => expect(seen.length).toBe(2));
    expect(seen[1]).toEqual([true, false, 1]);
    off();
    ds.setStatic([]);
    expect(seen.length).toBe(2);

    const statics = new GanttDataSource({ data: TASKS });
    const counts: number[] = [];
    statics.ɵsubscribe((_, next) => counts.push(next.loadedCount));
    statics.setStatic(TASKS.slice(0, 2));
    expect(counts).toEqual([2]);
  });
});
