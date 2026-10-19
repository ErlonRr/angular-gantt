// Phase 10 step 4.9 — synchronised charts (`[syncGroup]`, core `createGanttSyncGroup`), the Web
// Component's sync suite (`packages/vanilla/src/__tests__/sync.test.ts`, `sync-announce.test.ts`) in
// Angular: two `<gantry>` in one host sharing one group union their ranges (same start, same x for a
// date), follow each other's zoom level, horizontal scroll and panel width, and never send back what
// they received (echo guard). happy-dom has no layout and fires no scroll events: each chart's viewport
// gets a width and a `scrollLeft` the "browser" clamps to the timeline (installed when the chart
// registers its viewport, before it measures it), and `frame()` plays a browser frame (render, then a
// scroll event from every viewport that moved).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DebugElement } from '@angular/core';
import {
  ANNOUNCE_DEBOUNCE,
  anchoredScrollLeft,
  createGanttSyncGroup,
  DEFAULT_ZOOM_LEVELS,
  fitScrollLeft,
  fitZoomLevel,
  STATE_SAVE_DELAY,
  ViewMode,
  type GanttOptions,
  type GanttState,
  type GanttSyncGroup,
  type GanttSyncState,
  type GanttTask,
  type TimelineModel,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttSync } from './sync/gantt-sync';

const day = (month: number, date: number, year = 2026) => new Date(year, month, date);

const EARLY: GanttTask[] = [
  { id: 'e1', name: 'E1', start: day(0, 5), end: day(0, 20) },
  { id: 'e2', name: 'E2', start: day(1, 2), end: day(1, 10) },
];
const LATE: GanttTask[] = [
  { id: 'l1', name: 'L1', start: day(4, 4), end: day(4, 22) },
  { id: 'l2', name: 'L2', start: day(6, 1), end: day(6, 15) },
];

/** One chart of the host: its inputs, its viewport width and what it emitted */
interface ChartDef {
  readonly id: number;
  readonly tasks: WritableSignal<GanttTask[]>;
  readonly options: WritableSignal<GanttOptions>;
  readonly group: WritableSignal<GanttSyncGroup | null | undefined>;
  /** Timeline viewport width (px) */
  readonly width: number;
  readonly saves: GanttState[];
  readonly modes: (string | undefined)[];
}

@Component({
  imports: [GantryComponent],
  template: `
    @for (d of charts(); track d.id) {
      <gantry
        style="height: 400px"
        [attr.data-chart]="d.id"
        [series]="d.tasks()"
        [options]="d.options()"
        [syncGroup]="d.group()"
        (stateChange)="d.saves.push($event)"
        (viewModeChange)="d.modes.push($event)"
      />
    }
  `,
})
class Host {
  readonly charts = signal<readonly ChartDef[]>([]);
}

interface ChartInit {
  tasks: GanttTask[];
  group?: GanttSyncGroup | null;
  options?: GanttOptions;
  /** Timeline viewport width (px) */
  width?: number;
}

/** A chart of the host (resolved on first use: the host creates it on the next render) */
interface Chart {
  readonly def: ChartDef;
  readonly host: HTMLElement;
  readonly gantt: GantryComponent;
  readonly layout: GanttLayoutService;
  readonly scroll: GanttScrollService;
  readonly sync: GanttSync;
  readonly viewport: HTMLElement;
}

let fixture: ComponentFixture<Host> | null = null;
let nextId = 0;
/** Every chart of the test, in creation order (the order their scroll events fire in a frame) */
const charts: Chart[] = [];
/** The offset each viewport's last scroll event carried */
const announced = new WeakMap<ChartDef, number>();

const host = (): ComponentFixture<Host> => {
  if (!fixture) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
  }
  return fixture;
};
const alive = (c: Chart) => host().componentInstance.charts().includes(c.def);

/** A chart joining `group` (not rendered yet: `frame()` / `settle()` render every chart). */
function chart({ tasks, group = null, options = {}, width = 600 }: ChartInit): Chart {
  const def: ChartDef = {
    id: nextId++,
    tasks: signal(tasks),
    options: signal({ initialScroll: false, showToday: false, ...options }),
    group: signal(group),
    width,
    saves: [],
    modes: [],
  };
  let debug: DebugElement | null = null;
  const node = (): DebugElement => {
    debug ??= host().debugElement.query(By.css(`[data-chart="${def.id}"]`));
    if (!debug) throw new Error(`chart ${def.id} is not rendered`);
    return debug;
  };
  const c: Chart = {
    def,
    get host() {
      return node().nativeElement as HTMLElement;
    },
    get gantt() {
      return node().componentInstance as GantryComponent;
    },
    get layout() {
      return node().injector.get(GanttLayoutService);
    },
    get scroll() {
      return node().injector.get(GanttScrollService);
    },
    get sync() {
      return node().injector.get(GanttSync);
    },
    get viewport() {
      return c.host.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
    },
  };
  host().componentInstance.charts.update(list => [...list, def]);
  charts.push(c);
  return c;
}

/** The chart is destroyed (it leaves the host). */
const remove = (c: Chart) => host().componentInstance.charts.update(list => list.filter(d => d !== c.def));

/**
 * The layout happy-dom lacks, installed when a chart registers its viewport (before it measures it):
 * the viewport's and the main area's widths, and a `scrollLeft` the browser keeps inside the scroll
 * range.
 */
function fakeLayout(viewport: HTMLElement): void {
  const id = Number(viewport.closest('[data-chart]')?.getAttribute('data-chart'));
  const c = charts.find(x => x.def.id === id);
  if (!c) return;
  const { width } = c.def;
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: () => width });
  const main = c.host.querySelector<HTMLElement>('.gantry-main')!;
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => width + 300 });
  let left = 0;
  Object.defineProperty(viewport, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (v: number) => {
      left = Math.max(0, Math.min(v, c.layout.timeline().totalWidth - width));
    },
  });
}

const left = (c: Chart) => c.viewport.scrollLeft;
const timeline = (c: Chart): TimelineModel => c.layout.timeline();
const level = (c: Chart) => c.layout.level();
const panelW = (c: Chart) => c.layout.panelWidthPx();

/** One browser frame: every chart renders, then each viewport that moved fires `scroll`. */
async function frame(): Promise<void> {
  await host().whenStable();
  for (const c of charts) {
    if (!alive(c) || left(c) === (announced.get(c.def) ?? 0)) continue;
    announced.set(c.def, left(c));
    c.viewport.dispatchEvent(new Event('scroll'));
  }
}
/** Frames until everything settled. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await frame();
}
/** The user scrolls a chart's timeline horizontally. */
async function userScroll(c: Chart, x: number): Promise<void> {
  c.viewport.scrollLeft = x;
  await settle();
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A member that only listens: it receives every report the charts send (and what the group sends to all). */
function observe(group: GanttSyncGroup): Partial<GanttSyncState>[] {
  const patches: Partial<GanttSyncState>[] = [];
  group.join({ update: p => void patches.push(p) });
  patches.length = 0;
  return patches;
}
const scrolls = (patches: Partial<GanttSyncState>[]) =>
  patches.filter(p => p.scrollLeft != null).map(p => p.scrollLeft);
const levels = (patches: Partial<GanttSyncState>[]) => patches.filter(p => p.level != null).map(p => p.level);

beforeEach(() => {
  const register = GanttScrollService.prototype.registerCanvas;
  vi.spyOn(GanttScrollService.prototype, 'registerCanvas').mockImplementation(function (
    this: GanttScrollService,
    el: HTMLElement,
  ) {
    fakeLayout(el);
    register.call(this, el);
  });
});

afterEach(() => {
  fixture?.destroy();
  fixture = null;
  charts.length = 0;
  vi.restoreAllMocks();
});

describe('<gantry> sync group', () => {
  describe('range', () => {
    it('unions the ranges: every chart starts at the same date and places a date at the same x', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group, width: 400 });
      await settle();
      const ta = timeline(a);
      const tb = timeline(b);
      // Each chart keeps its own natural range; the timeline covers the union
      expect(ta.range.start.getTime()).toBeLessThan(tb.range.start.getTime());
      expect(ta.start).toEqual(ta.range.start);
      expect(tb.start).toEqual(ta.start);
      expect(ta.end).toEqual(tb.range.end);
      expect(tb.end).toEqual(ta.end);
      expect(tb.totalWidth).toBe(ta.totalWidth);
      for (const d of [day(0, 5), day(3, 1), day(6, 15)]) expect(tb.toX(d)).toBe(ta.toX(d));
      expect(group.state.range).toEqual({ start: ta.range.start, end: tb.range.end });
      // The shared extent: from the first chart's first task to the second chart's last
      expect(ta.sharedExtent).toEqual({ start: ta.extent!.start, end: tb.extent!.end });
      expect(tb.sharedExtent).toEqual(ta.sharedExtent);

      // The header's first cell: same x, same label
      const firstCell = (c: Chart) => {
        const bottom = [...c.host.querySelectorAll('.g-tier')].at(-1)!;
        const cell = bottom.querySelector<HTMLElement>('.g-cell')!;
        return [cell.style.left, cell.textContent?.trim()];
      };
      expect(firstCell(b)).toEqual(firstCell(a));
    });

    it('a chart that is destroyed leaves: the range shrinks back; a new chart with its tasks joins again', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group });
      await settle();
      const shared = timeline(a);
      expect(group.size).toBe(2);
      const layoutB = b.layout;

      remove(b);
      await settle();
      expect(group.size).toBe(1);
      const own = timeline(a);
      expect(own.end.getTime()).toBeLessThan(shared.end.getTime());
      expect(own.end).toEqual(own.range.end);
      expect(own.sharedExtent).toEqual(own.extent);
      expect(layoutB.shared()).toBeNull();

      const again = chart({ tasks: LATE, group });
      await settle();
      expect(group.size).toBe(2);
      expect(timeline(a).end).toEqual(shared.end);
      expect(timeline(again).start).toEqual(timeline(a).start);
    });

    it('{ range: false }: each chart keeps its own range', async () => {
      const group = createGanttSyncGroup({ range: false });
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group });
      await settle();
      expect(timeline(b).start).toEqual(timeline(b).range.start);
      expect(timeline(b).start.getTime()).toBeGreaterThan(timeline(a).start.getTime());
      expect(timeline(a).sharedExtent).toBeNull();
      expect(a.layout.shared()).toBeNull();
    });
  });

  describe('zoom level', () => {
    it('sends a zoom to the other charts, which do not send it back', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Month } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Month } });
      const patches = observe(group);
      await settle();

      a.gantt.zoomIn();
      await settle();
      expect(level(a)).toBe(ViewMode.Week);
      expect(level(b)).toBe(ViewMode.Week);
      // [(viewMode)] follows in both charts
      expect(b.gantt.viewMode()).toBe(ViewMode.Week);
      expect(b.def.modes).toEqual([ViewMode.Week]);
      expect(group.state.level).toBe(ViewMode.Week);
      expect(levels(patches)).toEqual([ViewMode.Week]);
      // Same scale, same start: a date still has one x
      expect(timeline(b).pxPerDay).toBe(timeline(a).pxPerDay);
      expect(timeline(b).start).toEqual(timeline(a).start);

      // Any chart's zoom, and the group's own
      b.gantt.setViewMode(ViewMode.Day);
      await settle();
      expect(level(a)).toBe(ViewMode.Day);
      group.setLevel(ViewMode.Month);
      expect([level(a), level(b)]).toEqual([ViewMode.Month, ViewMode.Month]);
      await settle();
      expect(levels(patches)).toEqual([ViewMode.Week, ViewMode.Day, ViewMode.Month]);
    });

    it('ignores a level the chart does not have, and does not send its own instead', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const zoomLevels = DEFAULT_ZOOM_LEVELS.filter(l => l.name !== ViewMode.Day);
      const c = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week, zoomLevels } });
      const patches = observe(group);
      await settle();
      a.gantt.setViewMode(ViewMode.Day);
      await settle();
      // Not its fallback (Month), which it would then have sent to every chart
      expect(level(c)).toBe(ViewMode.Week);
      expect(level(a)).toBe(ViewMode.Day);
      expect(group.state.level).toBe(ViewMode.Day);
      expect(levels(patches)).toEqual([ViewMode.Day]);
    });

    it('the chart that zooms sends its anchored scroll; the others follow it, not their own centre', async () => {
      const group = createGanttSyncGroup();
      // b first: its scroll event fires before a's in every frame
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week } });
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      await settle();
      await userScroll(a, 500);
      expect(left(b)).toBe(500);
      const before = timeline(a);
      const beforeB = timeline(b);
      patches.length = 0;

      a.gantt.zoomIn();
      await settle();
      const expected = anchoredScrollLeft(before, timeline(a), 500, 600, null)!;
      // b's own centre would land elsewhere
      expect(anchoredScrollLeft(beforeB, timeline(b), 500, 400, null)).not.toBe(expected);
      expect(left(a)).toBe(expected);
      expect(left(b)).toBe(expected);
      // b's correction around its centre never reached the group
      expect(scrolls(patches)).toEqual([expected]);
    });

    it('fit to screen fits the tasks of every chart, and the others follow', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Day } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Day } });
      await settle();
      const fit = fitZoomLevel({ levels: DEFAULT_ZOOM_LEVELS, extent: group.state.extent, viewportWidth: 600 });
      expect(fit).not.toBe(
        fitZoomLevel({ levels: DEFAULT_ZOOM_LEVELS, extent: timeline(a).extent, viewportWidth: 600 }),
      );

      a.gantt.fitToScreen();
      await settle();
      expect(level(a)).toBe(fit);
      expect(level(b)).toBe(fit);
      const x = fitScrollLeft(timeline(a), 600);
      expect(left(a)).toBe(x);
      expect(left(b)).toBe(x);
    });
  });

  describe('scroll', () => {
    it('sends a scroll to the other charts; their echo does not come back', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      await settle();

      await userScroll(a, 300);
      expect(left(b)).toBe(300);
      expect(left(a)).toBe(300);
      // The windowed regions saw the jump
      expect(b.scroll.scrollLeft()).toBe(300);
      expect(group.state.scrollLeft).toBe(300);
      expect(scrolls(patches)).toEqual([300]);

      await userScroll(b, 120);
      expect(left(a)).toBe(120);
      expect(scrolls(patches)).toEqual([300, 120]);

      // A vertical scroll leaves the horizontal offset alone: nothing to send
      b.viewport.scrollTop = 40;
      b.viewport.dispatchEvent(new Event('scroll'));
      await settle();
      expect(scrolls(patches)).toEqual([300, 120]);

      // The group's own scroll: every chart, nothing sent back
      group.scrollTo(250);
      await settle();
      expect([left(a), left(b)]).toEqual([250, 250]);
      expect(scrolls(patches)).toEqual([300, 120, 250]);
    });

    it('a chart that cannot scroll as far clamps without pushing the others back', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, width: 400, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 900, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      await settle();
      const maxA = timeline(a).totalWidth - 400;
      const maxB = timeline(b).totalWidth - 900;
      expect(maxB).toBeLessThan(maxA);

      await userScroll(a, maxA);
      expect(left(b)).toBe(maxB);
      expect(left(a)).toBe(maxA);
      expect(group.state.scrollLeft).toBe(maxA);
      expect(scrolls(patches)).toEqual([maxA]);

      // Its own scrolls still go out
      await userScroll(b, 100);
      expect(left(a)).toBe(100);
    });

    it('on joining, the group scroll replaces initialScroll', async () => {
      const group = createGanttSyncGroup();
      const tasks = [...EARLY, ...LATE];
      const a = chart({ tasks, group, options: { viewMode: ViewMode.Week } });
      await settle();
      await userScroll(a, 640);

      const c = chart({ tasks, group, options: { viewMode: ViewMode.Week, initialScroll: day(5, 1) } });
      await settle();
      expect(timeline(c).toX(day(5, 1))).toBeGreaterThan(640 + 600);
      expect(left(c)).toBe(640);
      expect(left(a)).toBe(640);
      expect(c.layout.initialScrollPending()).toBe(false);
    });

    it('without a group scroll, initialScroll runs and the group gets it', async () => {
      const group = createGanttSyncGroup();
      const patches = observe(group);
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week, initialScroll: 'start' } });
      await settle();
      const x = left(b);
      expect(x).toBeGreaterThan(0);
      expect(left(a)).toBe(x);
      expect(scrolls(patches)).toEqual([x]);
    });

    it('two charts that scroll initially in the same frame end up together, not swapped', async () => {
      const group = createGanttSyncGroup();
      const options = { viewMode: ViewMode.Week };
      const a = chart({ tasks: EARLY, group, options: { ...options, initialScroll: day(1, 1) } });
      const b = chart({ tasks: LATE, group, width: 400, options: { ...options, initialScroll: day(5, 1) } });
      await frame();
      const first = left(a);
      expect(left(b)).not.toBe(first);
      await settle();
      // The scroll the group heard first wins; the other chart's own never went out
      expect(left(a)).toBe(first);
      expect(left(b)).toBe(first);
      expect(group.state.scrollLeft).toBe(first);
    });

    it('a new shared start keeps the left-edge date in every chart, and the group scroll follows it', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      await settle();
      await userScroll(a, 800);
      const start = timeline(a).start;
      const date = timeline(a).toDate(800);
      patches.length = 0;

      b.def.tasks.set([...LATE, { id: 'x', name: 'X', start: day(10, 3, 2025), end: day(10, 20, 2025) }]);
      await settle();
      const tl = timeline(a);
      expect(tl.start.getTime()).toBeLessThan(start.getTime());
      expect(timeline(b).start).toEqual(tl.start);
      const x = left(a);
      expect(x).toBeGreaterThan(800);
      expect(Math.abs(tl.toX(date) - x)).toBeLessThanOrEqual(1);
      expect(left(b)).toBe(x);
      // Measured from the new start: one report (the charts agree), nothing bounced
      expect(group.state.scrollLeft).toBe(x);
      expect(scrolls(patches)).toEqual([x]);
    });

    it('a chart that joins with an earlier range opens at the date the others show', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      await settle();
      await userScroll(a, 500);
      const date = timeline(a).toDate(500);

      const c = chart({ tasks: EARLY, group, width: 400, options: { viewMode: ViewMode.Week } });
      await settle();
      expect(timeline(c).start).toEqual(timeline(a).start);
      expect(timeline(a).start.getTime()).toBeLessThan(timeline(a).range.start.getTime());
      expect(left(c)).toBe(left(a));
      expect(Math.abs(timeline(a).toX(date) - left(a))).toBeLessThanOrEqual(1);
      expect(group.state.scrollLeft).toBe(left(a));
    });

    it('a start correction at the scroll limit does not pull the others back', async () => {
      const group = createGanttSyncGroup();
      // b first: its scroll event fires before a's in every frame
      const b = chart({ tasks: LATE, group, width: 900, options: { viewMode: ViewMode.Week } });
      const a = chart({ tasks: EARLY, group, width: 400, options: { viewMode: ViewMode.Week } });
      await settle();
      await userScroll(a, timeline(a).totalWidth - 400);
      expect(left(b)).toBe(timeline(b).totalWidth - 900);

      b.def.tasks.set([...LATE, { id: 'x', name: 'X', start: day(10, 3, 2025), end: day(10, 20, 2025) }]);
      await settle();
      // Both kept their date at the left edge: each at the end of its own range
      expect(left(a)).toBe(timeline(a).totalWidth - 400);
      expect(left(b)).toBe(timeline(b).totalWidth - 900);
    });

    it('a group scroll waits while the table view hides the timeline', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      await settle();
      b.gantt.setView('table');
      await settle();
      await userScroll(a, 300);
      expect(left(b)).toBe(0);
      b.gantt.setView('split');
      await settle();
      expect(left(b)).toBe(300);
      expect(left(a)).toBe(300);
    });
  });

  describe('panel width', () => {
    it('shares the width the splitter or setState sets, without saving it in the other charts', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group });
      await settle();

      a.gantt.setState({ panelWidth: 320 }, false);
      expect(panelW(b)).toBe(320);
      expect(b.gantt.getState().panelWidth).toBe(320);

      // The splitter's keys
      const handle = a.host.querySelector<HTMLElement>('.gantry-splitter-handle')!;
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      expect(panelW(a)).toBeGreaterThan(320);
      expect(panelW(b)).toBe(panelW(a));

      // A drag: sent when it ends
      const splitter = a.host.querySelector<HTMLElement>('.gantry-splitter')!;
      const press = (type: string, clientX: number) =>
        splitter.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX }));
      const before = panelW(b);
      press('pointerdown', 500);
      press('pointermove', 440);
      expect(panelW(a)).toBeLessThan(before!);
      expect(panelW(b)).toBe(before);
      press('pointerup', 440);
      expect(panelW(b)).toBe(panelW(a));

      // b saved nothing; a saved its own changes
      await wait(STATE_SAVE_DELAY + 20);
      await settle();
      expect(b.def.saves).toEqual([]);
      expect(a.def.saves.at(-1)?.panelWidth).toBe(panelW(a));
    });

    it('{ scroll: false, panel: false }: only the range and the level are shared', async () => {
      const group = createGanttSyncGroup({ scroll: false, panel: false });
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      await settle();
      await userScroll(a, 300);
      expect(left(b)).toBe(0);
      a.gantt.setState({ panelWidth: 300 }, false);
      expect(panelW(b)).toBeNull();
      a.gantt.zoomOut();
      await settle();
      expect(level(b)).toBe(ViewMode.Month);
      expect(timeline(b).start).toEqual(timeline(a).start);
    });
  });

  describe('membership', () => {
    it('[syncGroup] null or undefined leaves; the group again rejoins with its state', async () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      await settle();
      await userScroll(a, 300);

      b.def.group.set(null);
      await frame();
      expect(group.size).toBe(1);
      expect(b.layout.shared()).toBeNull();
      await settle();
      expect(timeline(b).start).toEqual(timeline(b).range.start);
      expect(timeline(a).end).toEqual(timeline(a).range.end);
      const alone = left(b);
      await userScroll(a, 500);
      expect(left(b)).toBe(alone);

      b.def.group.set(group);
      await frame();
      expect(group.size).toBe(2);
      await settle();
      expect(timeline(b).start).toEqual(timeline(a).start);
      expect(left(b)).toBe(500);

      b.def.group.set(undefined);
      await frame();
      expect(b.sync.group).toBeNull();
      expect(group.size).toBe(1);
    });

    it('moving to another group leaves the first; the same group again changes nothing', async () => {
      const first = createGanttSyncGroup();
      const second = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group: first });
      await settle();
      const join = vi.spyOn(first, 'join');
      a.sync.connect(first);
      expect(join).not.toHaveBeenCalled();
      expect(first.size).toBe(1);

      a.def.group.set(second);
      await frame();
      expect([first.size, second.size]).toEqual([0, 1]);
      expect(second.state.range).toEqual(timeline(a).range);
    });
  });
});

// A sync group's zoom is announced once: by the chart the user zoomed. The other members still show
// the level, emit `viewModeChange` and save their state, but their live regions stay quiet (with N
// charts a screen reader would otherwise hear the same zoom N times).
describe('sync group: zoom announcements', () => {
  it('announces the zoom in the chart the user zoomed only; the others follow quietly', async () => {
    const tasks: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 1, 2), end: new Date(2026, 1, 20) }];
    const group = createGanttSyncGroup();
    const a = chart({ tasks, group, options: { viewMode: ViewMode.Week } });
    const b = chart({ tasks, group, options: { viewMode: ViewMode.Week } });
    await settle();
    const live = (c: Chart) => c.host.querySelector('.gantt-sr-live')!.textContent ?? '';

    a.gantt.zoomIn();
    await settle();
    await wait(Math.max(ANNOUNCE_DEBOUNCE, STATE_SAVE_DELAY) + 20);
    await host().whenStable();

    expect(level(b)).toBe(level(a));
    expect(level(a)).not.toBe(ViewMode.Week);
    expect(live(a)).toMatch(/\S/);
    expect(live(b).trim()).toBe('');
    // The follower still reports its own change and saves it
    expect(b.def.modes).toEqual([level(a)]);
    expect(b.def.saves.at(-1)?.viewMode).toBe(level(a));
  });
});
