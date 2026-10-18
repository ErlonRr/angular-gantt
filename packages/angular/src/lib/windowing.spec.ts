// Windowing (Gantry 2 phase 7, step 3.1): the layout service is Angular's engine graph. The header,
// the bands and the grid lines mount only what lies in the horizontal window (the viewport ± half
// its width, snapped to 256 px chunks), the canvas the rows of the vertical window plus the pinned
// (focused / dragged) rows, the arrows whose span meets the window. The timeline is built from the
// quantised day (hour), so the minute clock only moves the today line. The DOM-less test
// environment measures nothing: the tests write the viewport size and the scroll offsets into the
// layout's sources directly.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  buildArrowIndex,
  todayX,
  HORIZONTAL_WINDOW_QUANTUM,
  type TimelineModel,
  type GanttDependency,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttTaskBarComponent } from './bars/task-bar.component';

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 600px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>([]);
  readonly options = signal<GanttOptions>({ initialScroll: false, viewMode: 'Day' });
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  root: HTMLElement;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  drag: GanttDragService;
  /** Writes into the layout's sources and waits for the render */
  set(write: () => void): Promise<void>;
}

/** A fixed instant inside every task range below (the clock is an instant, never a date-only value) */
const NOW = new Date(2026, 5, 15, 10, 5).getTime();

async function mount(tasks: GanttTask[], options: GanttOptions = {}): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.tasks.set(tasks);
  f.componentInstance.options.set({ initialScroll: false, viewMode: 'Day', ...options });
  await f.whenStable();
  const injector = f.debugElement.query(By.directive(GantryComponent)).injector;
  const layout = injector.get(GanttLayoutService);
  const chart: Chart = {
    f,
    root: f.nativeElement as HTMLElement,
    layout,
    scroll: injector.get(GanttScrollService),
    drag: injector.get(GanttDragService),
    async set(write) {
      write();
      await f.whenStable();
    },
  };
  await chart.set(() => layout.now.set(NOW));
  return chart;
}

const $$ = <E extends Element = HTMLElement>(c: Chart, sel: string): E[] => [...c.root.querySelectorAll<E>(sel)];

/** One task from `start` spanning `years` (local calendar dates) */
function yearsTasks(years: number): GanttTask[] {
  return [
    { id: 'first', name: 'First', start: new Date(2025, 0, 1), end: new Date(2025, 0, 10) },
    { id: 'span', name: 'Span', start: new Date(2025, 0, 1), end: new Date(2025 + years, 0, 1) },
  ];
}

/**
 * `n` rows of two-day tasks, one hour apart: rows are ordered by start date, so row `i` is `t<i>`
 * (1 000 rows span six weeks: the Day header stays small)
 */
function rows(n: number, deps: (i: number) => GanttTask['dependency'] = () => undefined): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 5, 1, i),
    end: new Date(2026, 5, 3, i),
    dependency: deps(i),
  }));
}

/** Header cells per tier, as rendered */
const tierCells = (c: Chart) => $$(c, '.g-tier').map(t => [...t.querySelectorAll<HTMLElement>('.g-cell')]);

afterEach(() => vi.restoreAllMocks());

describe('horizontal window: header, bands, grid lines', () => {
  it('mounts per tier at most the cells of the viewport ± half its width (snapped), whatever the range', async () => {
    const c = await mount(yearsTasks(3));
    await c.set(() => {
      c.layout.viewportWidth.set(1000);
      c.scroll.scrollLeft.set(20_000);
    });
    const tl = c.layout.timeline();
    // A 3-year Day timeline: far wider than the window
    expect(tl.totalWidth).toBeGreaterThan(50_000);
    const span = 1000 + 2 * 500 + 2 * HORIZONTAL_WINDOW_QUANTUM;
    const counts = tierCells(c).map(cells => cells.length);
    expect(counts).toHaveLength(tl.tiers.length);
    tl.tiers.forEach((tier, i) => {
      const cellWidth = Math.min(...tier.cells.map(cell => cell.width));
      expect(counts[i]).toBeGreaterThan(0);
      expect(counts[i]).toBeLessThanOrEqual(span / cellWidth + 2);
    });
    const bottom = tl.tiers.at(-1)?.cells.length ?? 0;
    expect(counts.at(-1)).toBeLessThan(bottom / 10);
    // Bands and vertical grid lines are windowed the same way
    const { x0, x1 } = c.layout.hWindow();
    expect(x1 - x0).toBeLessThanOrEqual(span);
    const bands = $$<SVGRectElement>(c, '.gantt-bands rect.gantt-band');
    expect(bands.length).toBe(c.layout.bandWindow().length);
    expect(bands.length).toBeLessThan(tl.bands.length);
    for (const b of bands) {
      const x = Number(b.getAttribute('x'));
      expect(x + Number(b.getAttribute('width'))).toBeGreaterThan(x0);
      expect(x).toBeLessThan(x1);
    }
    const majors = $$<SVGLineElement>(c, '.gantt-grid-major');
    expect(majors.length).toBe(c.layout.lineWindow().major.length);
    expect(majors.length).toBeLessThan(tl.majorLines.length);

    // Twice the range: the same window mounts the same number of cells
    await c.set(() => c.f.componentInstance.tasks.set(yearsTasks(6)));
    expect(c.layout.timeline().totalWidth).toBeGreaterThan(1.9 * tl.totalWidth);
    expect(tierCells(c).map(cells => cells.length)).toEqual(counts);
  });

  it('a scroll inside one 256 px chunk recomputes nothing and keeps every cell node', async () => {
    const c = await mount(yearsTasks(3));
    await c.set(() => {
      c.layout.viewportWidth.set(1000);
      c.scroll.scrollLeft.set(5000);
    });
    const tiers = c.layout.tierWindows();
    const bands = c.layout.bandWindow();
    const lines = c.layout.lineWindow();
    const nodes = tierCells(c).flat();

    // [4352, 6656] for 5000 and for 5010: the same chunks
    await c.set(() => c.scroll.scrollLeft.set(5010));
    expect(c.layout.tierWindows()).toBe(tiers);
    expect(c.layout.bandWindow()).toBe(bands);
    expect(c.layout.lineWindow()).toBe(lines);
    const after = tierCells(c).flat();
    expect(after).toHaveLength(nodes.length);
    after.forEach((node, i) => expect(node).toBe(nodes[i]));

    // Across a chunk: new windows, but the cells still inside keep their node
    await c.set(() => c.scroll.scrollLeft.set(5000 + HORIZONTAL_WINDOW_QUANTUM));
    expect(c.layout.tierWindows()).not.toBe(tiers);
    const byLeft = (els: HTMLElement[]) =>
      new Map(els.map(el => [`${el.parentElement?.className}|${el.style.left}`, el]));
    const before = byLeft(nodes);
    const moved = byLeft(tierCells(c).flat());
    const kept = [...moved].filter(([k]) => before.has(k));
    expect(kept.length).toBeGreaterThan(nodes.length / 2);
    for (const [k, el] of kept) expect(el).toBe(before.get(k));
  });

  it('mounts the whole timeline while the viewport has no width (server, DOM-less tests)', async () => {
    const c = await mount(yearsTasks(1));
    expect(c.layout.viewportWidth()).toBe(0);
    const tl = c.layout.timeline();
    expect(tierCells(c).map(cells => cells.length)).toEqual(tl.tiers.map(t => t.cells.length));
    expect($$(c, '.gantt-bands rect.gantt-band')).toHaveLength(tl.bands.length);
    expect($$(c, '.gantt-grid-major')).toHaveLength(tl.majorLines.length);
  });
});

describe('quantised clock', () => {
  /** Three tasks around `NOW` */
  const around = (): GanttTask[] =>
    rows(3).map((t, i) => ({ ...t, start: new Date(2026, 5, 10 + i), end: new Date(2026, 5, 20 + i) }));
  const todayLine = (c: Chart) => c.root.querySelector('line.gantt-today')?.getAttribute('x1');
  const pointer = (c: Chart) => c.root.querySelector<HTMLElement>('.g-today-pointer')?.style.left;

  it('keeps the timeline for a tick within the day and moves the today line to the exact tick', async () => {
    const c = await mount(around());
    const tl: TimelineModel = c.layout.timeline();
    const x0 = todayX(tl, new Date(NOW));
    expect(x0).not.toBeNull();
    expect(todayLine(c)).toBe(String(x0));
    expect(pointer(c)).toBe(`${x0}px`);

    await c.set(() => c.layout.now.set(NOW + 60_000));
    expect(c.layout.timeline()).toBe(tl);
    expect(todayLine(c)).toBe(String(todayX(tl, new Date(NOW + 60_000))));

    // Later the same day: same timeline, the line follows (48 px per day → 12 px in 6 hours)
    const evening = NOW + 6 * 3_600_000;
    await c.set(() => c.layout.now.set(evening));
    expect(c.layout.timeline()).toBe(tl);
    const x1 = todayX(tl, new Date(evening));
    expect(x1).not.toBe(x0);
    expect(todayLine(c)).toBe(String(x1));
    expect(pointer(c)).toBe(`${x1}px`);

    // The next day: a new timeline (the current period moved)
    await c.set(() => c.layout.now.set(new Date(2026, 5, 16, 0, 1).getTime()));
    expect(c.layout.timeline()).not.toBe(tl);
  });

  it('on hour scales keeps the timeline within the hour', async () => {
    const c = await mount(
      rows(3).map(t => ({ ...t, start: new Date(2026, 5, 15, 8), end: new Date(2026, 5, 15, 18) })),
      {
        viewMode: 'Hour',
      },
    );
    const tl = c.layout.timeline();
    await c.set(() => c.layout.now.set(NOW + 20 * 60_000));
    expect(c.layout.timeline()).toBe(tl);
    expect(todayLine(c)).toBe(String(todayX(tl, new Date(NOW + 20 * 60_000))));
    expect(todayLine(c)).not.toBe(String(todayX(tl, new Date(NOW))));
    await c.set(() => c.layout.now.set(NOW + 60 * 60_000));
    expect(c.layout.timeline()).not.toBe(tl);
  });

  it('hides the today line and pointer with showToday: false', async () => {
    const c = await mount(around(), { showToday: false });
    expect(c.layout.todayX()).toBeNull();
    expect(todayLine(c)).toBeUndefined();
    expect(pointer(c)).toBeUndefined();
  });
});

describe('vertical window', () => {
  it('a scroll that mounts the same rows keeps the window and the mounted geometries', async () => {
    const c = await mount(rows(200));
    const rh = c.layout.rowHeight();
    // 15 rows below the header: any offset inside row 50 mounts rows 46..(50 + 16 + 4)
    await c.set(() => {
      c.layout.viewportHeight.set(c.layout.totalHeaderHeight() + 15 * rh);
      c.scroll.scrollTop.set(50 * rh + 1);
    });
    const win = c.layout.vWindow();
    const mounted = c.layout.mountedGeometries();
    const span = c.layout.windowSpan();
    expect(win.first).toBe(46);
    expect(win.last).toBe(70);
    expect(mounted.map(g => g.row.task.id)).toEqual(
      Array.from({ length: win.last - win.first + 1 }, (_, i) => `t${win.first + i}`),
    );
    expect(span).toEqual({ top: win.first * rh, bottom: (win.last + 1) * rh });
    expect($$(c, '.gantt-rows rect')).toHaveLength(mounted.length);
    expect($$(c, '.gantt-bars-layer [data-task-id]')).toHaveLength(mounted.length);
    expect($$(c, '.gantt-tl-row')).toHaveLength(mounted.length);

    await c.set(() => c.scroll.scrollTop.set(51 * rh - 1));
    expect(c.layout.vWindow()).toBe(win);
    expect(c.layout.mountedGeometries()).toBe(mounted);
    expect(c.layout.windowSpan()).toBe(span);
  });

  it('keeps the dragged row mounted (bar and row) after scrolling it 50 rows away', async () => {
    const c = await mount(rows(1000));
    const rh = c.layout.rowHeight();
    await c.set(() => c.layout.viewportHeight.set(600));
    const bar = (id: string) => c.root.querySelector(`.gantt-bars-layer [data-task-id="${id}"]`);
    expect(bar('t10')).not.toBeNull();

    await c.set(() => c.drag.state.set({ kind: 'dragging', taskId: 't10' }));
    await c.set(() => c.scroll.scrollTop.set(60 * rh));
    const win = c.layout.vWindow();
    expect(win.first).toBeGreaterThan(50);
    expect(win.pinnedBefore).toEqual([10]);
    expect(bar('t10')).not.toBeNull();
    expect(bar('t11')).toBeNull();
    expect(c.layout.mountedGeometries()[0]?.row.task.id).toBe('t10');
    expect($$(c, '.gantt-rows rect')).toHaveLength(win.last - win.first + 2);

    // Drag over: the row leaves with the window
    await c.set(() => c.drag.state.set({ kind: 'idle' }));
    expect(bar('t10')).toBeNull();
  });

  it('keeps the focused row mounted (focusedRowId)', async () => {
    const c = await mount(rows(1000));
    const rh = c.layout.rowHeight();
    await c.set(() => {
      c.layout.focusedRowId.set('t900');
      c.scroll.scrollTop.set(10 * rh);
    });
    expect(c.layout.vWindow().pinnedAfter).toEqual([900]);
    expect(c.root.querySelector('.gantt-bars-layer [data-task-id="t900"]')).not.toBeNull();
  });
});

describe('arrows', () => {
  it('mounts only the links whose span meets the window (1 000 rows, 500 links)', async () => {
    // 499 links between neighbours, one from the first row to the last (always crossing the window)
    const tasks = rows(1000, i => (i === 999 ? 't0' : i % 2 === 1 && i < 998 ? `t${i - 1}` : undefined));
    const c = await mount(tasks);
    const rh = c.layout.rowHeight();
    const index = buildArrowIndex(c.layout.tasks(), c.layout.geometryById());
    expect(index.size).toBe(500);

    await c.set(() => {
      c.layout.viewportHeight.set(600);
      c.scroll.scrollTop.set(400 * rh);
    });
    const { top, bottom } = c.layout.windowSpan();
    const geo = c.layout.geometryById();
    const crossing = index.links.filter(l => l.y0 <= bottom && l.y1 >= top);
    // Brute force over every dependency agrees with the index
    const brute = tasks.flatMap(t => {
      const to = geo.get(t.id);
      const from = typeof t.dependency === 'string' ? geo.get(t.dependency) : undefined;
      if (!to || !from) return [];
      const y0 = Math.min(from.y, to.y);
      const y1 = Math.max(from.y + from.height, to.y + to.height);
      return y0 <= bottom && y1 >= top ? [t.id] : [];
    });
    expect(crossing.map(l => l.to)).toEqual(brute);
    expect(crossing.length).toBeGreaterThan(5);
    expect(crossing.length).toBeLessThan(40);
    expect($$(c, '.gantt-arrows > .gantt-arrow')).toHaveLength(crossing.length);

    // Scrolling moves the set: the long link stays, the neighbours change
    await c.set(() => c.scroll.scrollTop.set(100 * rh));
    const span2 = c.layout.windowSpan();
    const crossing2 = index.links.filter(l => l.y0 <= span2.bottom && l.y1 >= span2.top);
    expect(crossing2.some(l => l.from === 't0' && l.to === 't999')).toBe(true);
    expect($$(c, '.gantt-arrows > .gantt-arrow')).toHaveLength(crossing2.length);
  });

  it('draws a repeated dependency twice, with distinct keys', async () => {
    const warn = vi.spyOn(console, 'warn');
    const dep: GanttDependency = { taskId: 'a' };
    const tasks: GanttTask[] = [
      { id: 'a', name: 'A', start: new Date(2026, 5, 1), end: new Date(2026, 5, 4) },
      { id: 'b', name: 'B', start: new Date(2026, 5, 6), end: new Date(2026, 5, 9), dependency: [dep, { ...dep }] },
    ];
    const c = await mount(tasks);
    const links = buildArrowIndex(c.layout.tasks(), c.layout.geometryById()).links;
    expect(links.map(l => l.key)).toEqual(['a→b:FS', 'a→b:FS#2']);
    expect($$(c, '.gantt-arrows > .gantt-arrow')).toHaveLength(2);
    // No duplicate-track-key warning (NG0955)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('NG0955');
  });
});

describe('getBarVisual', () => {
  it('serves a row outside the window: the visual its bar paints once scrolled back', async () => {
    const c = await mount(rows(1000));
    const rh = c.layout.rowHeight();
    await c.set(() => {
      c.layout.viewportHeight.set(600);
      c.scroll.scrollTop.set(500 * rh);
    });
    const gantt = c.f.componentInstance.gantt();
    expect(c.root.querySelector('.gantt-bars-layer [data-task-id="t5"]')).toBeNull();
    const off = gantt.getBarVisual('t5');
    expect(off).toBeDefined();
    expect(gantt.getBarVisual('missing')).toBeUndefined();

    await c.set(() => c.scroll.scrollTop.set(0));
    const bar = c.f.debugElement
      .queryAll(By.directive(GanttTaskBarComponent))
      .map(de => de.componentInstance as GanttTaskBarComponent)
      .find(b => b.ctx().row.task.id === 't5');
    expect(bar).toBeDefined();
    expect(bar?.ctx().visual).toEqual(off);
    // The same memoised object: the canvas and the API share it
    expect(bar?.ctx().visual).toBe(off);
  });
});
