// The working calendar in Angular (Gantry 2 phase 13, step 4.1, plan §3c / D13 / D19 / D20), the Web
// Component's `calendar-p13.test.ts`: the binding only passes the chart's date reading on —
// - the critical path, the rollups and the column context follow `dateReadingOf(cfg)`: a zoom keeps
//   their objects, a calendar change (even one that only flips `durations`) recomputes them;
// - a pointer drop, a move-mode commit and a start cell keep a task's working length as ONE move
//   (a single `taskDragged`, no `taskResized`) — the editor, the keyboard directive and the cell
//   editor hand the config to the change builders;
// - the Duration column, the tooltip's float row and `nonWorkingTime.style: 'none'` read the core model;
// - with no `calendar` everything stays as it was (calendar days, today's events, the bands).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ViewMode, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttTooltipState } from './tooltip/tooltip-state';

/** October 2026: Mon 12, Fri 16, Mon 19, Fri 23, Mon 26. */
const oct = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m);

/**
 * `a` Mon–Fri (5 working days), `b` Mon–Tue, `c` Fri 23 + Mon 26 (2 working days over 4 calendar days) after `a`;
 * the group `g` has a 2-day and a 3-day child (Thu–Fri–Mon: 3 working days over 5 calendar days).
 */
const PLAN = (): GanttTask[] => [
  { id: 'a', name: 'Design', start: oct(12), end: oct(17), progress: 100 },
  { id: 'b', name: 'Docs', start: oct(12), end: oct(14), progress: 40 },
  { id: 'c', name: 'Build', start: oct(23), end: oct(27), progress: 0, dependency: 'a' },
  { id: 'g', name: 'Phase', start: oct(12), end: oct(20) },
  { id: 'g1', name: 'Part one', parentId: 'g', start: oct(12), end: oct(14), progress: 100 },
  { id: 'g2', name: 'Part two', parentId: 'g', start: oct(15), end: oct(20), progress: 0 },
];

const BASE: GanttOptions = {
  viewMode: ViewMode.Day,
  initialScroll: false,
  panel: { columns: ['name', 'start', 'end', 'duration'] },
};
const WORKING: GanttOptions = { ...BASE, calendar: true, criticalPath: true, rollup: true };

const PIPELINE = ['beforeChange', 'taskDragged', 'taskResized', 'taskUpdated', 'tasksChange'];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    (beforeChange)="log('beforeChange', $event)"
    (taskDragged)="log('taskDragged', $event)"
    (taskResized)="log('taskResized', $event)"
    (taskUpdated)="log('taskUpdated', $event)"
    (tasksChange)="log('tasksChange', $event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(PLAN());
  readonly options = signal<GanttOptions>(WORKING);
  readonly events: [string, unknown][] = [];
  readonly gantt = viewChild.required(GantryComponent);

  log(type: string, detail: unknown): void {
    this.events.push([type, detail]);
  }
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  layout: GanttLayoutService;
  canvas: GanttCanvasComponent;
  state: GanttTooltipState;
  set(change?: () => void): Promise<void>;
}

async function mount(options: GanttOptions = WORKING, tasks: GanttTask[] = PLAN()): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set(options);
  f.componentInstance.tasks.set(tasks);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const canvas = f.debugElement.query(By.directive(GanttCanvasComponent));
  return {
    f,
    h: f.componentInstance,
    host: debug.nativeElement as HTMLElement,
    layout: debug.injector.get(GanttLayoutService),
    canvas: canvas.componentInstance as GanttCanvasComponent,
    state: canvas.injector.get(GanttTooltipState),
    async set(change) {
      change?.();
      await f.whenStable();
    },
  };
}

const $ = <T extends Element = HTMLElement>(c: Chart, sel: string) => c.host.querySelector<T>(sel);
const $$ = (c: Chart, sel: string) => [...c.host.querySelectorAll<HTMLElement>(sel)];
const cellText = (c: Chart, id: string, key: string) =>
  $(c, `[data-focus-key="cell:${id}:${key}"]`)?.textContent?.trim();
const taskOf = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!;
/** The pipeline events the chart fired, in order */
const names = (c: Chart) => c.h.events.map(([type]) => type).filter(t => PIPELINE.includes(t));
const active = () => document.activeElement as HTMLElement | null;

/** A real keydown (bubbling, cancelable) on what has focus; returns whether the chart used it. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (active() ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/** What the canvas emits after dragging `c` (Fri 23 → Tue 27, 2 working days) to start on Monday 26. */
const dropBuildOnMonday = (c: Chart): void =>
  c.canvas.taskDragged.emit({
    taskId: 'c',
    oldStart: oct(23),
    oldEnd: oct(27),
    newStart: oct(26),
    newEnd: oct(28),
    daysMoved: 3,
  });

/** What the popover shows now as label → value */
function shownRows(c: Chart): Record<string, string | null> {
  const tip = c.host.querySelector<HTMLElement>('.gantt-tooltip')!;
  const labels = [...tip.querySelectorAll('dt.gantt-tooltip-label')].map(n => n.textContent ?? '');
  const values = [...tip.querySelectorAll('dd.gantt-tooltip-value')].map(n => n.textContent);
  return Object.fromEntries(labels.map((label, i) => [label, values[i] ?? null]));
}

/** The tooltip rows of the keyboard-focused bar `id` as label → value (opened again: an open tooltip keeps its content) */
function tooltipRows(c: Chart, id: string): Record<string, string | null> {
  c.layout.focusVisibleBarId.set(null);
  TestBed.tick();
  c.layout.focusVisibleBarId.set(id);
  TestBed.tick();
  return shownRows(c);
}

afterEach(() => {
  active()?.blur();
  vi.restoreAllMocks();
});

describe('<gantry> working calendar (phase 13 plumbing)', () => {
  describe('the date reading cut-off (D19 / D20)', () => {
    it('a zoom keeps the critical path, the rollups and the column context; the same objects', async () => {
      const c = await mount();
      const critical = c.layout.critical();
      const rollups = c.layout.rollups();
      const context = c.layout.columnContext();
      expect(critical).not.toBeNull();
      expect(rollups.size).toBeGreaterThan(0);
      // (Out, not in: the hour scale reads the clock by the hour — `nowDay` — and rebuilds the rollups with it)
      await c.set(() => c.h.gantt().zoomOut());
      expect(c.layout.critical()).toBe(critical);
      expect(c.layout.rollups()).toBe(rollups);
      expect(c.layout.columnContext()).toBe(context);
      // An unrelated option change (labels) keeps them too
      await c.set(() => c.h.options.set({ ...WORKING, labels: { ariaChart: 'Plan' } }));
      expect(c.layout.critical()).toBe(critical);
      expect(c.layout.rollups()).toBe(rollups);
    });

    it('a calendar change recomputes them, even when only `durations` flips: float, weights and column text follow', async () => {
      const c = await mount();
      const working = c.layout.critical()!;
      const rollups = c.layout.rollups();
      expect(working.durations).toBe('working');
      // a (5) + c (2) = 7 working days; b is 2 days long: 5 days of float
      expect(working.floatMap.get('b')).toBe(5);
      // g1 weighs 2 working days, g2 3: 2 / 5
      expect(rollups.get('g')?.progress).toBe(40);
      expect(cellText(c, 'c', 'duration')).toBe('2 days');
      expect(c.layout.columnContext().calendar?.durations).toBe('working');

      await c.set(() => c.h.options.set({ ...WORKING, calendar: { durations: 'calendar' } }));
      const calendar = c.layout.critical()!;
      expect(calendar).not.toBe(working);
      expect(calendar.durations).toBe('calendar');
      // a (5) + c (4) = 9 calendar days: 7 days of float for b
      expect(calendar.floatMap.get('b')).toBe(7);
      expect(c.layout.rollups()).not.toBe(rollups);
      expect(c.layout.rollups().get('g')?.progress).toBeLessThan(40);
      expect(cellText(c, 'c', 'duration')).toBe('4 days');
      expect(c.layout.columnContext().calendar?.durations).toBe('calendar');

      // Calendar off: today's reading
      await c.set(() => c.h.options.set({ ...WORKING, calendar: undefined }));
      expect(c.layout.cfg().calendar).toBeNull();
      expect(c.layout.columnContext().calendar).toBeNull();
      expect(c.layout.critical()!.durations).toBe('calendar');
      expect(c.layout.critical()!.floatMap.get('b')).toBe(7);
      expect(cellText(c, 'c', 'duration')).toBe('4 days');
    });
  });

  describe('edits keep the working length as one move (D13)', () => {
    it('a pointer drop of a task across a weekend fires one taskDragged, no taskResized', async () => {
      const c = await mount();
      dropBuildOnMonday(c);
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 'c')).toMatchObject({ start: oct(26), end: oct(28) });
    });

    it('without a calendar the same drop is a move and a resize, as before', async () => {
      const c = await mount({ ...WORKING, calendar: undefined });
      dropBuildOnMonday(c);
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskResized', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 'c')).toMatchObject({ start: oct(26), end: oct(28) });
    });

    // The second run edits a task whose row is a normalised copy (an unknown parent is dropped), so the
    // keyboard directive rebuilds the change from the raw task: it has to pass the config itself
    it.each([
      ['the row is the raw task', PLAN],
      ['the row is a normalised copy of it', () => PLAN().map(t => (t.id === 'c' ? { ...t, parentId: 'nowhere' } : t))],
    ])('move mode steps one working day: Friday → Monday, one event (%s)', async (_name, plan) => {
      const c = await mount({ ...WORKING, editing: true }, plan());
      expect(c.layout.visibleRows().find(r => r.task.id === 'c')?.task === taskOf(c, 'c')).toBe(plan === PLAN);
      await c.set(() => c.host.querySelector<SVGGElement>('.gantt-bars-layer [data-task-id="c"]')!.focus());
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(press('ArrowRight')).toBe(true);
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 'c')).toMatchObject({ start: oct(26), end: oct(28) });
    });

    /** Enter, one arrow (with `init`), Enter on the bar of `id`: a move-mode step through the keyboard directive */
    async function step(c: Chart, id: string, key: string, init: KeyboardEventInit = {}): Promise<void> {
      await c.set(() => c.host.querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${id}"]`)!.focus());
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(press(key, init)).toBe(true);
      expect(press('Enter')).toBe(true);
      await c.set();
    }
    const detailOf = (c: Chart, type: string) => c.h.events.filter(([t]) => t === type).map(([, detail]) => detail);

    it('move mode over a holiday lands after it and back: one taskDragged each way, the real calendar shift', async () => {
      const tuesday: GanttTask[] = [{ id: 't', name: 'Tuesday', start: oct(20), end: oct(21) }];
      const c = await mount(
        { ...BASE, calendar: true, editing: true, nonWorkingTime: { holidays: [oct(21)] } },
        tuesday,
      );
      await step(c, 't', 'ArrowRight');
      // Wed 21 is a holiday: the next working day is Thu 22, two calendar days on
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 't')).toMatchObject({ start: oct(22), end: oct(23) });
      expect(detailOf(c, 'taskDragged')[0]).toMatchObject({ taskId: 't', newStart: oct(22), daysMoved: 2 });
      await step(c, 't', 'ArrowLeft');
      expect(names(c).filter(n => n === 'taskDragged')).toHaveLength(2);
      expect(names(c)).not.toContain('taskResized');
      expect(taskOf(c, 't')).toMatchObject({ start: oct(20), end: oct(21) });
      expect(detailOf(c, 'taskDragged')[1]).toMatchObject({ newStart: oct(20), daysMoved: -2 });
    });

    it('Shift + → resizes the end by one working day over the weekend: one taskResized, the end on Tuesday 00:00', async () => {
      const friday: GanttTask[] = [{ id: 'f', name: 'Friday', start: oct(16), end: oct(17) }];
      const c = await mount({ ...BASE, calendar: true, editing: true }, friday);
      await step(c, 'f', 'ArrowRight', { shiftKey: true });
      expect(names(c)).toEqual(['beforeChange', 'taskResized', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 'f')).toMatchObject({ start: oct(16), end: oct(20) });
      expect(detailOf(c, 'taskResized')[0]).toMatchObject({ taskId: 'f', edge: 'end', newEnd: oct(20), daysDelta: 3 });
      expect(cellText(c, 'f', 'duration')).toBe('2 days');
    });

    it('without a calendar the same step moves one calendar day and the weekend is not skipped', async () => {
      const friday: GanttTask[] = [{ id: 'f', name: 'Friday', start: oct(16), end: oct(17) }];
      const c = await mount({ ...BASE, editing: true }, friday);
      await step(c, 'f', 'ArrowRight');
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 'f')).toMatchObject({ start: oct(17), end: oct(18) });
      expect(detailOf(c, 'taskDragged')[0]).toMatchObject({ daysMoved: 1 });
    });

    it('a start cell moves the task and keeps its working length: one move (the cell editor passes the config)', async () => {
      const c = await mount({ ...WORKING, editing: true });
      await c.set(() => $(c, '[data-focus-key="cell:c:start"]')!.focus());
      expect(press('F2')).toBe(true);
      await c.set();
      const input = $<HTMLInputElement>(c, '.gantt-tl-editor')!;
      input.value = '2026-10-26';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
      expect(taskOf(c, 'c')).toMatchObject({ start: oct(26), end: oct(28) });
    });
  });

  describe('what the model paints', () => {
    it('the Duration column counts working days (calendar days without a calendar)', async () => {
      const c = await mount();
      expect(cellText(c, 'a', 'duration')).toBe('5 days');
      expect(cellText(c, 'b', 'duration')).toBe('2 days');
      expect(cellText(c, 'c', 'duration')).toBe('2 days');
      await c.set(() => c.h.options.set({ ...WORKING, calendar: undefined }));
      expect(cellText(c, 'c', 'duration')).toBe('4 days');
    });

    it('an hour calendar reads hours: 6 working hours of a 9–17 day', async () => {
      const timed: GanttTask[] = [
        { id: 't', name: 'Workshop', start: oct(12, 9, 15), end: oct(12, 15, 15) },
        { id: 'u', name: 'Two days', start: oct(12, 9, 15), end: oct(14, 9, 15) },
      ];
      const c = await mount({ ...BASE, calendar: { unit: 'hour' } }, timed);
      expect(cellText(c, 't', 'duration')).toBe('6 hours');
      expect(cellText(c, 'u', 'duration')).toBe('2 days');
    });

    it('the tooltip float row is in working days', async () => {
      const c = await mount();
      expect(tooltipRows(c, 'b')['Float']).toBe('5d');
      expect(tooltipRows(c, 'b')['Duration']).toBe('2 days');
      await c.set(() => c.h.options.set({ ...WORKING, calendar: { durations: 'calendar' } }));
      expect(tooltipRows(c, 'b')['Float']).toBe('7d');
    });

    it('an open tooltip follows the calendar: Duration and Float are rewritten without closing it', async () => {
      // a (Mon–Fri) then b (Mon–Fri over the holiday Wed 21): 5 + 4 = 9 working days; c is 2 over 4 calendar days
      const chain: GanttTask[] = [
        { id: 'a', name: 'A', start: oct(12), end: oct(17) },
        { id: 'b', name: 'B', start: oct(19), end: oct(24), dependency: 'a' },
        { id: 'c', name: 'C', start: oct(16), end: oct(20) },
      ];
      const working: GanttOptions = { ...WORKING, nonWorkingTime: { holidays: [oct(21)] } };
      const c = await mount(working, chain);
      expect(tooltipRows(c, 'c')).toMatchObject({ Duration: '2 days', Float: '7d' });
      const shown = c.state.shown();
      expect(shown?.id).toBe('c');
      // Same calendar, another options object: the content stays as it was
      await c.set(() => c.h.options.set({ ...working }));
      expect(shownRows(c)).toMatchObject({ Duration: '2 days', Float: '7d' });
      // `durations: 'calendar'` only flips the calendar key: a + b last 10 calendar days, c 4 (6 days of float)
      await c.set(() => c.h.options.set({ ...working, calendar: { durations: 'calendar' } }));
      expect(c.state.shown()).toBe(shown);
      expect(shownRows(c)).toMatchObject({ Duration: '4 days', Float: '6d' });
      // Working time again, then the calendar off: the same opening each time
      await c.set(() => c.h.options.set(working));
      expect(c.state.shown()).toBe(shown);
      expect(shownRows(c)).toMatchObject({ Duration: '2 days', Float: '7d' });
      await c.set(() => c.h.options.set({ ...working, calendar: undefined }));
      expect(c.state.shown()).toBe(shown);
      expect(shownRows(c)).toMatchObject({ Duration: '4 days', Float: '6d' });
    });

    it('nonWorkingTime.style "none" paints no band, in the canvas or the header; shade does', async () => {
      const c = await mount({ ...WORKING, nonWorkingTime: { style: 'shade' } });
      expect($$(c, 'g.gantt-bands rect').length).toBeGreaterThan(0);
      expect($$(c, '.g-band').length).toBeGreaterThan(0);
      await c.set(() => c.h.options.set({ ...WORKING, nonWorkingTime: { style: 'none' } }));
      expect($$(c, 'g.gantt-bands rect')).toHaveLength(0);
      expect($$(c, '.g-band')).toHaveLength(0);
      // The calendar keeps counting working time while nothing is shaded
      expect(cellText(c, 'c', 'duration')).toBe('2 days');
    });
  });

  describe('no calendar', () => {
    it('reads like before: calendar days, no reading on the config or the column context', async () => {
      const c = await mount({ ...BASE, criticalPath: true, rollup: true });
      expect(c.layout.cfg().calendar).toBeNull();
      expect(c.layout.columnContext().calendar).toBeNull();
      expect(c.layout.critical()!.durations).toBe('calendar');
      expect(c.layout.critical()!.floatMap.get('b')).toBe(7);
      expect(cellText(c, 'c', 'duration')).toBe('4 days');
      expect(tooltipRows(c, 'b')['Float']).toBe('7d');
    });
  });
});
