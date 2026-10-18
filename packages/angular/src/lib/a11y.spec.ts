// Accessibility of <gantry> (Gantry 2 phase 7, step 4.2): the Web Component's model in Angular. The host
// is a region named by `labels.ariaChart`, never a tab stop and without `data-theme`; the internal tab
// stops (one task-list row, the splitter's separator and its sibling toggle, the timeline's tab-stop bar
// — the viewport only without bars, phase 9);
// `aria-multiselectable` from the selection options; the polite live region (selection count, data-source
// load state) and the assertive one (a failed page); focus tracking (the focused row stays mounted,
// pinned) and the focus fallback when the focused control is removed. The keyboard path and axe run in
// Chromium (e2e/a11y.spec.ts). Polite announcements are debounced (core `createAnnouncer`,
// ANNOUNCE_DEBOUNCE): the live-region tests wait it out (`settle`).
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ANNOUNCE_DEBOUNCE, DEFAULT_LABELS, TaskType, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDataSource } from './datasource/gantt-datasource';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttAnnouncer } from './a11y/announcer';
import { GanttI18nService } from './services/gantt-i18n.service';

const day = (d: number) => new Date(2026, 2, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(2), end: day(20) },
  { id: 'a', name: 'Alpha', parentId: 'g', start: day(2), end: day(9) },
  { id: 'b', name: 'Beta', parentId: 'g', start: day(9), end: day(16) },
  { id: 'c', name: 'Gamma', start: day(10), end: day(18) },
  { id: 'd', name: 'Delta', start: day(12), end: day(19) },
];

/** `n` one-week tasks, in date order (row `i` is `t<i>`) */
const plan = (n: number): GanttTask[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2, i),
    end: new Date(2026, 2, 9, i),
  }));

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 500px"
    [series]="tasks()"
    [dataSource]="dataSource()"
    [options]="options()"
    [darkMode]="dark()"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly dataSource = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly dark = signal<boolean | undefined>(undefined);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  drag: GanttDragService;
  announcer: GanttAnnouncer;
  /** Runs `change` and waits for the render */
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
  $$(sel: string): HTMLElement[];
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
  return {
    f,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    scroll: debug.injector.get(GanttScrollService),
    drag: debug.injector.get(GanttDragService),
    announcer: debug.injector.get(GanttAnnouncer),
    async set(change) {
      change();
      await f.whenStable();
    },
    $(sel) {
      const el = $$(sel)[0];
      if (!el) throw new Error(`no element for ${sel}`);
      return el;
    },
    $$,
  };
}

const row = (c: Chart, id: string) => c.$(`.gantt-tl-row[data-task-id="${id}"]`);
const tabStops = (c: Chart) => c.$$('.gantt-tl-row[tabindex="0"]').map(r => r.getAttribute('data-task-id'));
const live = (c: Chart) => c.$('.gantt-sr-live').textContent;
const alert = (c: Chart) => c.$('.gantt-sr-alert').textContent;

/** Lets a debounced announcement reach the live region, then waits for the render. */
async function settle(c: Chart): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
}

/** Focuses `el` and waits for the render its `focusin` causes. */
async function focus(c: Chart, el: HTMLElement): Promise<void> {
  await c.set(() => el.focus());
}

/** A fetcher whose pages the test settles one by one. */
function pagedFetcher() {
  const pending: { resolve: (tasks: GanttTask[]) => void; reject: (e: unknown) => void }[] = [];
  const fetcher = (_page: number) =>
    new Promise<GanttTask[]>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  return {
    fetcher,
    /** Settles the oldest open request and lets the loader's promise chain run. */
    async settle(result: GanttTask[] | Error): Promise<void> {
      const next = pending.shift();
      if (!next) throw new Error('no open request');
      if (result instanceof Error) next.reject(result);
      else next.resolve(result);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

describe('host', () => {
  it('is a region named by labels.ariaChart, with no tabindex and no data-theme', async () => {
    const c = await mount(h => h.dark.set(true));
    expect(c.host.getAttribute('role')).toBe('region');
    expect(c.host.getAttribute('aria-label')).toBe(DEFAULT_LABELS.ariaChart);
    expect(c.host.hasAttribute('tabindex')).toBe(false);
    expect(c.host.hasAttribute('data-theme')).toBe(false);
    expect(c.host.classList.contains('gantry-dark')).toBe(true);

    await c.set(() =>
      c.f.componentInstance.options.set({ initialScroll: false, labels: { ariaChart: 'Release plan' } }),
    );
    expect(c.host.getAttribute('aria-label')).toBe('Release plan');
  });

  it('has no focus ring rule of its own (the old :host(:focus-visible))', async () => {
    await mount();
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    expect(css).not.toMatch(/\[_nghost-[^\]]+\]:focus-visible/);
  });
});

describe('tab stops', () => {
  it('one task-list row is a tab stop (the first in view), the others -1', async () => {
    const c = await mount();
    expect(c.$$('.gantt-tl-row').length).toBe(5);
    expect(tabStops(c)).toEqual(['g']);
    expect(c.$$('.gantt-tl-row[tabindex="-1"]')).toHaveLength(4);
    // Rows, collapse toggles and sortable headers carry the Web Component's focus keys
    expect(row(c, 'a').getAttribute('data-focus-key')).toBe('row:a');
    expect(c.$('.gantt-collapse-btn').getAttribute('data-focus-key')).toBe('collapse:g');
  });

  it('the splitter: a focusable separator with the toggle as its sibling, inside a box without a role', async () => {
    const c = await mount();
    const box = c.$('.gantry-splitter');
    expect(box.hasAttribute('role')).toBe(false);
    expect(box.hasAttribute('tabindex')).toBe(false);
    const handle = c.$('.gantry-splitter-handle');
    expect(handle.parentElement).toBe(box);
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    const toggle = c.$('.gantry-splitter-toggle');
    expect(toggle.parentElement).toBe(box);
    expect(handle.contains(toggle)).toBe(false);
    expect(handle.nextElementSibling).toBe(toggle);
  });

  it('Arrow keys on the separator or the toggle resize the panel; Enter on the toggle collapses it once', async () => {
    const c = await mount();
    const handle = c.$('.gantry-splitter-handle');
    const width = Number(handle.getAttribute('aria-valuenow'));
    await c.set(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(width + 24);
    const toggle = c.$('.gantry-splitter-toggle');
    await c.set(() => toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(width);

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await c.set(() => toggle.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    expect(c.gantt.view()).toBe('chart');
  });

  it('the timeline viewport is a named group, a tab stop only while no bar is mounted (the bars rove); inert in the table view', async () => {
    const c = await mount();
    const viewport = c.$('.gantry-canvas-viewport');
    expect(viewport.getAttribute('role')).toBe('group');
    expect(viewport.getAttribute('tabindex')).toBe('-1');
    expect(c.$$('.gantt-bars-layer > [tabindex="0"]').map(b => b.getAttribute('data-task-id'))).toEqual(['g']);
    expect(viewport.getAttribute('aria-label')).toBe(DEFAULT_LABELS.ariaChart);
    expect(viewport.hasAttribute('inert')).toBe(false);
    expect(viewport.firstElementChild?.classList.contains('gantry-canvas-header-sticky')).toBe(true);
    // The 1.x pane classes are gone
    expect(c.host.querySelector('.gantt-panel-scroll, .gantt-timeline-scroll, .gantt-timeline-header')).toBeNull();
    expect(c.$('.gantry-panel').querySelector('gantt-tasklist')).not.toBeNull();

    await c.set(() => c.gantt.setView('table'));
    expect(viewport.hasAttribute('inert')).toBe(true);
    expect(c.host.querySelector('.gantry-splitter')).toBeNull();

    await c.set(() => c.f.componentInstance.tasks.set([]));
    expect(viewport.getAttribute('tabindex')).toBe('0');
  });
});

describe('aria-multiselectable', () => {
  it('follows selection + multiSelect', async () => {
    const c = await mount();
    const list = c.$('gantt-tasklist');
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    await c.set(() => c.f.componentInstance.options.set({ initialScroll: false, multiSelect: false }));
    expect(list.getAttribute('aria-multiselectable')).toBe('false');
    await c.set(() => c.f.componentInstance.options.set({ initialScroll: false, enableSelection: false }));
    expect(list.getAttribute('aria-multiselectable')).toBe('false');
  });
});

describe('live regions', () => {
  it('are a polite status and an assertive alert, both empty at first', async () => {
    const c = await mount();
    const status = c.$('.gantt-sr-live');
    expect(status.parentElement).toBe(c.host);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(c.$('.gantt-sr-alert').getAttribute('role')).toBe('alert');
    expect(live(c)).toBe('');
    expect(alert(c)).toBe('');
  });

  it('announces a change of the selection count (task list, API), not a same-count change', async () => {
    const c = await mount();
    await c.set(() => row(c, 'a').click());
    await settle(c);
    expect(live(c)).toBe('1 task selected');
    await c.set(() => c.gantt.setSelectedTasks(['a', 'b', 'c']));
    await settle(c);
    expect(live(c)).toBe('3 tasks selected');
    // Another selection of the same size says nothing new
    await c.set(() => c.gantt.setSelectedTasks(['b', 'c', 'd']));
    await settle(c);
    expect(live(c)).toBe('3 tasks selected');
    await c.set(() => c.gantt.clearSelection());
    await settle(c);
    expect(live(c)).toBe('Selection cleared');
  });

  it('debounces a burst of changes: only the last one is read, once', async () => {
    const c = await mount();
    await c.set(() => c.gantt.setSelectedTasks(['a']));
    await c.set(() => c.gantt.setSelectedTasks(['a', 'b']));
    await c.set(() => c.gantt.setSelectedTasks(['a', 'b', 'c']));
    // Nothing yet: the debounce is still running
    expect(live(c)).toBe('');
    await settle(c);
    expect(live(c)).toBe('3 tasks selected');
  });

  it('a sentence equal to the one shown gets a trailing no-break space (read again)', async () => {
    const c = await mount();
    await c.set(() => c.announcer.announce('3 tasks selected'));
    await settle(c);
    await c.set(() => c.announcer.announce('3 tasks selected'));
    await settle(c);
    expect(live(c)).toBe('3 tasks selected\u00A0');
    await c.set(() => c.announcer.announce('3 tasks selected'));
    await settle(c);
    expect(live(c)).toBe('3 tasks selected');
  });

  it('announces nothing before the first render in the browser (the starting state is the baseline)', async () => {
    TestBed.configureTestingModule({ providers: [GanttAnnouncer, GanttI18nService] });
    const announcer = TestBed.inject(GanttAnnouncer);
    announcer.selection(2);
    announcer.announceNow('now');
    expect(announcer.live()).toBe('');
    announcer.start();
    announcer.selection(2);
    expect(announcer.live()).toBe('');
    await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
    expect(announcer.live()).toBe('2 tasks selected');
    // `announceNow` skips the debounce and drops a pending message
    announcer.selection(5);
    announcer.announceNow('Zoom level: Week');
    expect(announcer.live()).toBe('Zoom level: Week');
    await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
    expect(announcer.live()).toBe('Zoom level: Week');
    // Stopped (the chart is destroyed): a pending message is dropped
    announcer.selection(1);
    announcer.stop();
    await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
    expect(announcer.live()).toBe('Zoom level: Week');
  });

  it('announces the data-source load state; a failed page goes to the alert, its retry is read again', async () => {
    const pages = pagedFetcher();
    const ds = new GanttDataSource({ fetcher: pages.fetcher, pageSize: 2, initialPage: 0, retries: 0 });
    const c = await mount(h => {
      h.tasks.set([]);
      h.dataSource.set(ds);
    });
    // The state at the first render is the baseline
    expect(live(c)).toBe('');

    await c.set(() => void ds.loadNext());
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.loading);
    await pages.settle(plan(2));
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceLoaded(2));

    // A failure: nothing polite, the alert says it
    await c.set(() => void ds.loadNext());
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.loading);
    await pages.settle(new Error('offline'));
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.loading);
    expect(alert(c)).toBe(DEFAULT_LABELS.loadError);
    // The footer holds no live region of its own
    expect(c.host.querySelector('gantt-load-more [role="alert"]')).toBeNull();

    // Retry: the alert clears, "Loading…" again is still a change; the last page reads allLoaded
    await c.set(() => void ds.retry());
    expect(alert(c)).toBe('');
    await settle(c);
    expect(live(c)).toBe(`${DEFAULT_LABELS.loading}\u00A0`);
    await pages.settle(plan(1));
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.allLoaded(3));
  });

  it('reads every load-state transition, also one that starts and ends between two renders', async () => {
    const pages = pagedFetcher();
    const ds = new GanttDataSource({ fetcher: pages.fetcher, pageSize: 2, initialPage: 0, retries: 0 });
    const c = await mount(h => {
      h.tasks.set([]);
      h.dataSource.set(ds);
    });
    // loading → loaded with no render in between: the stream still sees both transitions (the
    // debounce reads the last one)
    void ds.loadNext();
    await pages.settle(plan(2));
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceLoaded(2));
  });

  it('a failure drops a pending "Loading…" (the failure is read at once elsewhere)', async () => {
    const pages = pagedFetcher();
    const ds = new GanttDataSource({ fetcher: pages.fetcher, pageSize: 2, initialPage: 0, retries: 0 });
    const c = await mount(h => {
      h.tasks.set([]);
      h.dataSource.set(ds);
    });
    void ds.loadNext();
    await pages.settle(new Error('offline'));
    await settle(c);
    expect(live(c)).toBe('');
  });

  it('a failed first page shows the error state (role=alert) instead of the assertive region', async () => {
    const pages = pagedFetcher();
    const ds = new GanttDataSource({ fetcher: pages.fetcher, pageSize: 2, initialPage: 0, retries: 0 });
    const c = await mount(h => {
      h.tasks.set([]);
      h.dataSource.set(ds);
    });
    await c.set(() => void ds.loadNext());
    await pages.settle(new Error('offline'));
    await c.f.whenStable();
    expect(alert(c)).toBe('');
    expect(c.$('.gantt-state--error .gantt-state-box').getAttribute('role')).toBe('alert');
    expect(c.$('.gantt-state-message').textContent?.trim()).toBe(DEFAULT_LABELS.loadError);
  });
});

describe('focus', () => {
  it('focusin records the task-list row holding focus; the viewport clears it', async () => {
    const c = await mount();
    await focus(c, row(c, 'b'));
    expect(c.layout.focusedRowId()).toBe('b');
    expect(tabStops(c)).toEqual(['b']);
    // A control inside a row counts as the row
    await focus(c, c.$('.gantt-collapse-btn'));
    expect(c.layout.focusedRowId()).toBe('g');

    await focus(c, row(c, 'c'));
    await focus(c, c.$('.gantry-canvas-viewport'));
    expect(c.layout.focusedRowId()).toBeNull();
    // The row focused last keeps the tab stop: Shift+Tab returns to it
    expect(tabStops(c)).toEqual(['c']);
  });

  it('keeps the focused row mounted and focused while it scrolls away, pinned at its offset', async () => {
    const c = await mount(h => h.tasks.set(plan(200)));
    const rh = c.layout.rowHeight();
    await c.set(() => c.layout.viewportHeight.set(400));
    const node = row(c, 't2');
    await focus(c, node);

    await c.set(() => c.scroll.scrollTop.set(60 * rh));
    expect(c.layout.vWindow().first).toBeGreaterThan(2);
    expect(row(c, 't2')).toBe(node);
    expect(node.isConnected).toBe(true);
    expect(document.activeElement).toBe(node);
    expect(node.classList.contains('gantt-tl-row--pinned')).toBe(true);
    expect(node.style.top).toBe(`${2 * rh}px`);
    expect(tabStops(c)).toEqual(['t2']);
    // Before the window's rows in the DOM (as the Web Component's pinnedBefore)
    expect(c.$$('.gantt-tl-row')[0]).toBe(node);

    await c.set(() => c.scroll.scrollTop.set(0));
    expect(node.classList.contains('gantt-tl-row--pinned')).toBe(false);
    expect(node.style.top).toBe('');
    expect(document.activeElement).toBe(node);
  });

  it("collapsing the group that holds the focused row moves focus to the timeline's tab-stop bar", async () => {
    const c = await mount();
    await focus(c, row(c, 'a'));
    expect(document.activeElement).toBe(row(c, 'a'));

    await c.set(() => c.gantt.collapseAll());
    expect(c.host.querySelector('.gantt-tl-row[data-task-id="a"]')).toBeNull();
    const stop = c.$('.gantt-bars-layer > [tabindex="0"]');
    expect(document.activeElement).toBe(stop);
    expect(c.layout.focusedRowId()).toBe(stop.getAttribute('data-task-id'));

    // Without rows the empty state covers the body (inert): the toolbar's tab stop
    await focus(c, row(c, 'c'));
    await c.set(() => c.f.componentInstance.tasks.set([]));
    expect(document.activeElement?.getAttribute('data-focus-key')).toBe('zoom-out');
    expect(c.layout.focusedRowId()).toBeNull();
  });

  it('in the table view the focus goes to the tab-stop row instead', async () => {
    const c = await mount(h => h.options.set({ initialScroll: false, view: 'table' }));
    await focus(c, row(c, 'b'));
    await c.set(() => c.gantt.collapseAll());
    expect(document.activeElement).toBe(c.$('.gantt-tl-row[tabindex="0"]'));
  });

  it('focus outside the chart is left alone when a row it held earlier goes', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      const c = await mount();
      await focus(c, row(c, 'a'));
      await focus(c, outside);
      await c.set(() => c.gantt.collapseAll());
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('a drag takes keyboard focus to the timeline viewport (Escape cancels it there)', async () => {
    const c = await mount();
    await focus(c, row(c, 'c'));
    await c.set(() => c.drag.state.set({ kind: 'dragging', taskId: 'c' }));
    expect(document.activeElement).toBe(c.$('.gantry-canvas-viewport'));

    await c.set(() =>
      c.$('.gantry-canvas-viewport').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(c.drag.isActive()).toBe(false);
  });
});
