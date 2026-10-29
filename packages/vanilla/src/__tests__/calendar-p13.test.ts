// The working calendar in <gantry-element> (Gantry 2 phase 13, step 3.1, plan §3c): `options.calendar` is
// the only input; the engine passes the chart's config (a core `DateReading`) to everything that reads or
// edits task dates. The `dateReading` node compares by value (`sameDateReading`), so a zoom keeps the
// critical path, the rollups and the cell context; a calendar change recomputes them. A pointer drop, a
// move-mode commit and a cell edit build their change with the config, so a working move is one
// `task-dragged`. Without `calendar` every output is what it was. Week of Mon 12 Oct 2026, holiday Wed 21.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, type GanttOptions, type GanttTask, type TaskDragEvent, type TaskResizeEvent } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { TOOLTIP_SHOW_DELAY } from '../layers/tooltip';
import type { GantryEventDetailMap } from '../types';
import '../index';

/** October 2026: the 12th is a Monday, the 21st a holiday. */
const d = (day: number, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute);
const HOLIDAY = d(21);

const BASE: GanttOptions = {
  viewMode: ViewMode.Day,
  initialScroll: false,
  nonWorkingTime: { holidays: [HOLIDAY] },
  panel: { columns: ['name', 'start', 'end', 'duration'] },
};

let el: GantryElement;

function mount(options: GanttOptions = {}, tasks: GanttTask[] = [], props: Partial<GantryElement> = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks, options: { ...BASE, ...options }, ...props });
  document.body.appendChild(el);
  getEngine(el).flushSync();
  return el;
}

const engine = () => getEngine(el);
const flush = () => engine().flushSync();
const $ = <T extends Element = HTMLElement>(sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string) => [...el.shadowRoot!.querySelectorAll<T>(sel)];
const canvas = () => engine().dom.canvasContainer;
const barEl = (id: string) => $<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const cellEl = (id: string, key: string) => $(`[data-focus-key="cell:${id}:${key}"]`)!;
const cellText = (id: string, key: string) => cellEl(id, key).textContent.trim();
const taskOf = (id: string) => el.tasks.find(t => t.id === id)!;
const px = () => engine().graph.timeline.peek().pxPerDay;

type EventName = keyof GantryEventDetailMap;
const PIPELINE: EventName[] = ['task-dragged', 'task-resized', 'task-updated', 'tasks-change'];
function record(...names: EventName[]): { type: EventName; detail: unknown }[] {
  const log: { type: EventName; detail: unknown }[] = [];
  for (const name of names) el.addEventListener(name, e => log.push({ type: name, detail: (e as CustomEvent).detail }));
  return log;
}
const types = (log: { type: string }[]) => log.map(e => e.type);

// Pointer and key helpers (as the pointer / keyboard / cell-edit suites)
type Kind = 'mouse' | 'touch' | 'pen';
const send = (type: string, x: number, y: number, kind: Kind = 'mouse', on?: Element): void => {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
  (on ?? canvas()).dispatchEvent(e);
};
/** Drags `id`'s bar by `days` snap units with the mouse, from the middle of its body. */
function dragBar(id: string, days: number): void {
  const v = el.getBarVisual(id)!;
  const x = v.x + v.width / 2;
  send('pointerdown', x, v.cy, 'mouse', barEl(id));
  send('pointermove', x + 4, v.cy);
  send('pointermove', x + days * px(), v.cy);
  send('pointerup', x + days * px(), v.cy);
}
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (el.shadowRoot!.activeElement ?? el).dispatchEvent(e);
  return e.defaultPrevented;
}
function typeInto(text: string): void {
  const input = $<HTMLInputElement>('.gantt-tl-editor')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}
/** Opens the editor of a cell with F2, types `text` and commits with Enter. */
function editCell(id: string, key: string, text: string): void {
  cellEl(id, key).focus();
  expect(press('F2')).toBe(true);
  flush();
  typeInto(text);
  press('Enter');
  flush();
}

/** Two working days (Fri 16, Mon 19) across a weekend: 4 calendar days. */
const ACROSS = (): GanttTask => ({ id: 'x', name: 'Across', start: d(16), end: d(20) });
/** Three working days Wed 14 – Fri 16 (end Sat 17 00:00). */
const MIDWEEK = (): GanttTask => ({ id: 'w', name: 'Midweek', start: d(14), end: d(17) });
/** One working day, Friday 16. */
const FRIDAY = (): GanttTask => ({ id: 'f', name: 'Friday', start: d(16), end: d(17) });

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  el?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the date reading', () => {
  it('carries the calendar to the config and the graph; calendar unset resolves to null', () => {
    mount({ calendar: true }, [MIDWEEK()]);
    const { graph: G } = engine();
    expect(G.config.peek().calendar).toMatchObject({ durations: 'working', unit: 'day', skipNonWorking: true });
    expect(G.dateReading.peek().calendar).toBe(G.config.peek().calendar);
    expect(G.columnCtx.peek().calendar).toBe(G.config.peek().calendar);
    el.options = { ...BASE };
    flush();
    expect(G.config.peek().calendar).toBeNull();
    expect(G.dateReading.peek().calendar).toBeNull();
    expect(G.columnCtx.peek().calendar).toBeNull();
  });

  it('a zoom keeps the critical path, the rollups and the cell context; a calendar change recomputes them', () => {
    const tree: GanttTask[] = [
      { id: 'p', name: 'Parent', start: d(12), end: d(13) },
      { id: 'a', name: 'A', start: d(16), end: d(20), parentId: 'p', progress: 0 },
      { id: 'b', name: 'B', start: d(20), end: d(24), parentId: 'p', progress: 100, dependency: 'a' },
    ];
    const options: GanttOptions = { ...BASE, calendar: true, criticalPath: true, rollup: true };
    mount(options, tree);
    const runs = engine().runs;
    const reset = () => {
      for (const k of Object.keys(runs)) runs[k] = 0;
    };
    const critical = engine().graph.critical.peek();
    const rollups = engine().graph.rollups.peek();
    const ctx = engine().graph.columnCtx.peek();

    reset();
    el.options = { ...options, viewMode: ViewMode.Week };
    flush();
    expect(runs['config']).toBeGreaterThan(0);
    // The reading is re-derived (a new resolved calendar) but equal by value: nothing downstream runs
    expect(runs['dateReading']).toBe(1);
    expect(runs['critical'] ?? 0).toBe(0);
    expect(runs['rollups'] ?? 0).toBe(0);
    expect(runs['columnCtx'] ?? 0).toBe(0);
    expect(engine().graph.critical.peek()).toBe(critical);
    expect(engine().graph.rollups.peek()).toBe(rollups);
    expect(engine().graph.columnCtx.peek()).toBe(ctx);

    // A label or theme change doesn't either
    reset();
    el.options = { ...options, viewMode: ViewMode.Week, labels: { ttFloat: 'Slack' } };
    flush();
    expect(runs['critical'] ?? 0).toBe(0);
    expect(runs['rollups'] ?? 0).toBe(0);

    reset();
    el.options = { ...options, viewMode: ViewMode.Week, calendar: { durations: 'calendar' } };
    flush();
    expect(runs['critical']).toBe(1);
    expect(runs['rollups']).toBe(1);
    expect(runs['columnCtx']).toBe(1);
    expect(engine().graph.critical.peek()).not.toBe(critical);

    // A holiday is part of the reading too
    reset();
    el.options = { ...options, viewMode: ViewMode.Week, calendar: { durations: 'calendar' }, nonWorkingTime: {} };
    flush();
    expect(runs['critical']).toBe(1);
  });

  it('the rollup weights its children in working days (67 %), in calendar days without a calendar (50 %)', () => {
    const tree: GanttTask[] = [
      { id: 'p', name: 'Parent', start: d(12), end: d(13) },
      { id: 'a', name: 'A', start: d(16), end: d(20), parentId: 'p', progress: 0 },
      { id: 'b', name: 'B', start: d(20), end: d(24), parentId: 'p', progress: 100 },
    ];
    const options: GanttOptions = { ...BASE, rollup: true, panel: { columns: ['name', 'progress'] } };
    mount({ ...options, calendar: true }, tree);
    // Fri 16 – Mon 19 is 2 working days, Tue 20 – Fri 23 is 3 (the 21st is a holiday): (2·0 + 3·100) / 5
    expect(cellText('p', 'progress')).toContain('60%');
    el.options = options;
    flush();
    // 4 calendar days at 0 %, 4 at 100 %
    expect(cellText('p', 'progress')).toContain('50%');
  });
});

describe('the Duration column and the tooltip', () => {
  it('reads working days with a calendar and calendar days without', () => {
    mount({ calendar: true }, [ACROSS(), MIDWEEK()]);
    expect(cellText('x', 'duration')).toBe('2 days');
    expect(cellText('w', 'duration')).toBe('3 days');
    el.options = { ...BASE };
    flush();
    expect(cellText('x', 'duration')).toBe('4 days');
    expect(cellText('w', 'duration')).toBe('3 days');
    el.options = { ...BASE, calendar: { durations: 'calendar' } };
    flush();
    expect(cellText('x', 'duration')).toBe('4 days');
  });

  it('reads working hours in an hour calendar (09:00 – 17:00 by default)', () => {
    const hours: GanttTask = { id: 'h', name: 'Hours', start: d(12, 9, 15), end: d(12, 15, 15) };
    mount({ calendar: { unit: 'hour' }, normalizeDateOnly: false, viewMode: ViewMode.Hour }, [hours]);
    expect(cellText('h', 'duration')).toBe('6 hours');
    // The off-hours are shaded from the same hours
    expect(engine().graph.config.peek().nonWorking?.workingHours?.(1)).toEqual([{ start: 9, end: 17 }]);
  });

  it('shows the float in working days in the tooltip', () => {
    const chain: GanttTask[] = [
      { id: 'a', name: 'A', start: d(12), end: d(17) },
      { id: 'b', name: 'B', start: d(19), end: d(24), dependency: 'a' },
      { id: 'c', name: 'C', start: d(16), end: d(20) },
    ];
    const rows = (id: string) => {
      const row = engine()
        .graph.allRows.peek()
        .find(r => r.task.id === id)!;
      engine().layers.tooltip.hover(row, barEl(id), 100);
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
      const tip = $('.gantt-tooltip')!;
      return Object.fromEntries(
        [...tip.querySelectorAll('.gantt-tooltip-row')].map(r => [
          r.querySelector('dt')!.textContent,
          r.querySelector('dd')!.textContent,
        ]),
      );
    };
    mount({ calendar: true, criticalPath: true }, chain);
    // a is 5 working days, b 4 (Wed 21 is a holiday): 9; c is 2: 7 days of float
    expect(rows('c')).toMatchObject({ Duration: '2 days', Float: '7d' });
    // (A closed tooltip is built at its next opening; the open one is rewritten in place, below)
    engine().layers.tooltip.hide();
    el.options = { ...BASE, criticalPath: true };
    flush();
    // Calendar days: c lasts 4 days, a + b 10: 6 days of float
    expect(rows('c')).toMatchObject({ Duration: '4 days', Float: '6d' });
  });

  it('rewrites the open tooltip when the calendar changes under it, without closing it', () => {
    // a + b: 5 + 4 working days (Wed 21 is a holiday), 10 calendar days; c is 2 working days over 4 calendar days
    const chain: GanttTask[] = [
      { id: 'a', name: 'A', start: d(12), end: d(17) },
      { id: 'b', name: 'B', start: d(19), end: d(24), dependency: 'a' },
      { id: 'c', name: 'C', start: d(16), end: d(20) },
    ];
    const working: GanttOptions = { ...BASE, calendar: true, criticalPath: true };
    mount(working, chain);
    const tooltip = engine().layers.tooltip;
    tooltip.hover(
      engine()
        .graph.allRows.peek()
        .find(r => r.task.id === 'c')!,
      barEl('c'),
      100,
    );
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    const tip = $('.gantt-tooltip')!;
    const rows = () =>
      Object.fromEntries(
        [...tip.querySelectorAll('.gantt-tooltip-row')].map(r => [
          r.querySelector('dt')!.textContent,
          r.querySelector('dd')!.textContent,
        ]),
      );
    expect(rows()).toMatchObject({ Duration: '2 days', Float: '7d' });
    // The opening's own refresh (it writes nothing again) runs in the next frame: let it, then count
    flush();
    const refresh = vi.spyOn(tooltip, 'refresh');

    // The same calendar in another options object: the same content, not even asked
    el.options = { ...working };
    flush();
    expect(refresh).not.toHaveBeenCalled();

    // `durations: 'calendar'` only flips the calendar key
    el.options = { ...working, calendar: { durations: 'calendar' } };
    flush();
    expect(tooltip.visibleId()).toBe('c');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(rows()).toMatchObject({ Duration: '4 days', Float: '6d' });

    // Working time again, then no calendar at all: the same opening each time
    el.options = working;
    flush();
    expect(rows()).toMatchObject({ Duration: '2 days', Float: '7d' });
    el.options = { ...working, calendar: undefined };
    flush();
    expect(tooltip.visibleId()).toBe('c');
    expect(rows()).toMatchObject({ Duration: '4 days', Float: '6d' });
    expect(tip.hidden).toBe(false);
  });
});

describe('export', () => {
  it('the CSV reads durations like the Duration column: working days with a calendar, calendar days without', async () => {
    mount({ calendar: true }, [ACROSS()]);
    const row = (csv: string) => csv.split('\n').find(line => line.includes('Across'))!;
    expect(row(await el.exportCsv({ values: 'display', columns: 'all' }))).toContain('2 days');
    el.options = { ...BASE };
    flush();
    expect(row(await el.exportCsv({ values: 'display', columns: 'all' }))).toContain('4 days');
  });
});

describe('editing with a calendar', () => {
  it('a pointer drop of a Wednesday bar by a day keeps its working days: one task-dragged, the end over the weekend', () => {
    mount({ calendar: true }, [MIDWEEK()]);
    const log = record(...PIPELINE);
    dragBar('w', 1);
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    // Thu, Fri, Mon: Tue 20 00:00 is right after the third working day
    expect(log[0].detail).toEqual({
      taskId: 'w',
      oldStart: d(14),
      oldEnd: d(17),
      newStart: d(15),
      newEnd: d(20),
      daysMoved: 1,
    } satisfies TaskDragEvent);
    expect(taskOf('w')).toMatchObject({ start: d(15), end: d(20) });
    flush();
    expect(cellText('w', 'duration')).toBe('3 days');
  });

  it('a drop on the weekend starts on Monday (starts move forward)', () => {
    mount({ calendar: true }, [FRIDAY()]);
    const log = record(...PIPELINE);
    dragBar('f', 1);
    // Sat 17 snaps forward to Mon 19; one working day: Tue 20
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    expect(taskOf('f')).toMatchObject({ start: d(19), end: d(20) });
  });

  it('a resize onto the weekend snaps the end back to the last working day', () => {
    mount({ calendar: true }, [MIDWEEK()]);
    const log = record(...PIPELINE);
    const v = el.getBarVisual('w')!;
    const x = v.x + v.width - 2;
    send('pointerdown', x, v.cy);
    send('pointermove', x + px(), v.cy);
    send('pointerup', x + px(), v.cy);
    // Sat 17 + 1 day = Sun 18 00:00 -> back to Sat 17 00:00 (the end it had): nothing to commit
    expect(log.filter(e => e.type === 'task-resized')).toHaveLength(0);
    expect(taskOf('w').end).toEqual(d(17));
    send('pointerdown', x, v.cy);
    send('pointermove', x + 3 * px(), v.cy);
    send('pointerup', x + 3 * px(), v.cy);
    // Tue 20 00:00 is right after Monday: no snap needed
    const resized = log.filter(e => e.type === 'task-resized');
    expect(resized).toHaveLength(1);
    expect((resized[0].detail as TaskResizeEvent).newEnd).toEqual(d(20));
  });

  it('without a calendar the same drop moves the calendar days (the end on Sunday)', () => {
    mount({}, [MIDWEEK()]);
    const log = record(...PIPELINE);
    dragBar('w', 1);
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    expect(taskOf('w')).toMatchObject({ start: d(15), end: d(18) });
  });

  it('move mode steps in working days: from Friday to Monday, one task-dragged', () => {
    mount({ calendar: true }, [FRIDAY()]);
    const log = record(...PIPELINE);
    barEl('f').focus();
    expect(press('Enter')).toBe(true);
    expect(press('ArrowRight')).toBe(true);
    expect(engine().inputs.dragPreview.peek()).toMatchObject({ taskId: 'f', start: d(19) });
    expect(press('Enter')).toBe(true);
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    // The event reports the real calendar shift of the start
    expect(log[0].detail).toMatchObject({ taskId: 'f', newStart: d(19), newEnd: d(20), daysMoved: 3 });
    expect(taskOf('f')).toMatchObject({ start: d(19), end: d(20) });
    // And back: Monday to Friday
    barEl('f').focus();
    press('Enter');
    press('ArrowLeft');
    press('Enter');
    expect(taskOf('f')).toMatchObject({ start: d(16), end: d(17) });
  });

  it('move mode on a repaired task (the change is built from the raw one) is still one task-dragged', () => {
    // An unknown parent is repaired: the row's task is a copy. Thu 15 – Fri 16 moved one working day: the start
    // shifts 1 calendar day, the end 3 (over the weekend), which only a calendar-aware change reads as one move
    mount({ calendar: true }, [{ id: 'r', name: 'Repaired', start: d(15), end: d(17), parentId: 'nowhere' }]);
    expect(engine().graph.tasks.peek()[0]).not.toBe(el.tasks[0]);
    const log = record(...PIPELINE);
    barEl('r').focus();
    press('Enter');
    press('ArrowRight');
    press('Enter');
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    expect(log[0].detail).toMatchObject({ newStart: d(16), newEnd: d(20), daysMoved: 1 });
    expect(taskOf('r')).toMatchObject({ start: d(16), end: d(20) });
  });

  it('move mode over the holiday lands after it', () => {
    mount({ calendar: true }, [{ id: 't', name: 'Tuesday', start: d(20), end: d(21) }]);
    barEl('t').focus();
    press('Enter');
    press('ArrowRight');
    press('Enter');
    // Wed 21 is a holiday: the next working day is Thu 22
    expect(taskOf('t')).toMatchObject({ start: d(22), end: d(23) });
  });

  it('a start cell on a Saturday moves to Monday and the end follows the working length', () => {
    mount({ calendar: true, editing: true }, [ACROSS()]);
    const log = record(...PIPELINE);
    editCell('x', 'start', '2026-10-17');
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    // Mon 19 + 2 working days: Wed 21 is the holiday, so the end sits at Wed 21 00:00 (right after Tuesday)
    expect(taskOf('x')).toMatchObject({ start: d(19), end: d(21) });
  });

  it('a duration cell writes the working end: 3d from a Thursday ends on Tuesday', () => {
    mount({ calendar: true, editing: true }, [{ id: 'u', name: 'Thursday', start: d(15), end: d(16) }]);
    const log = record(...PIPELINE);
    expect(cellText('u', 'duration')).toBe('1 day');
    editCell('u', 'duration', '3d');
    // Thu, Fri, Mon
    expect(types(log)).toEqual(['task-resized', 'task-updated', 'tasks-change']);
    expect(taskOf('u')).toMatchObject({ start: d(15), end: d(20) });
    expect(cellText('u', 'duration')).toBe('3 days');
  });

  it('a duration cell in an hour calendar parses hours of the working day', () => {
    const hours: GanttTask = { id: 'h', name: 'Hours', start: d(12, 9, 15), end: d(12, 12, 15) };
    mount({ calendar: { unit: 'hour' }, normalizeDateOnly: false, viewMode: ViewMode.Hour, editing: true }, [hours]);
    expect(cellText('h', 'duration')).toBe('3 hours');
    editCell('h', 'duration', '6h');
    expect(taskOf('h').end).toEqual(d(12, 15, 15));
    expect(cellText('h', 'duration')).toBe('6 hours');
  });

  it('calendar unset: a start cell on a Saturday is kept and the end follows the calendar length', () => {
    mount({ editing: true }, [ACROSS()]);
    editCell('x', 'start', '2026-10-17');
    expect(taskOf('x')).toMatchObject({ start: d(17), end: d(21) });
  });
});

describe('nonWorkingTime.style: none', () => {
  const bands = () => $$('.gantt-bands > rect').length;
  const tints = () => $$('.g-band').length;

  it('paints no weekend, holiday or off-hours band, and keeps the working durations', () => {
    mount({ calendar: true }, [ACROSS()]);
    expect(bands()).toBeGreaterThan(0);
    expect(tints()).toBeGreaterThan(0);
    el.options = { ...BASE, calendar: true, nonWorkingTime: { holidays: [HOLIDAY], style: 'none' } };
    flush();
    expect(bands()).toBe(0);
    expect(tints()).toBe(0);
    expect(engine().graph.timeline.peek().bands).toHaveLength(0);
    // The calendar is the same: the definition stays, only the paint goes
    expect(cellText('x', 'duration')).toBe('2 days');
    expect(engine().graph.config.peek().calendar?.working.isWorkingDay(HOLIDAY)).toBe(false);
  });
});

describe('calendar unset', () => {
  /** The shadow tree with the per-instance ids made equal. */
  const dom = () => el.shadowRoot!.innerHTML.replace(/\b(gantt|gs)-([a-z-]*?)-?\d+\b/g, '$1-$2-N');

  it('is the same chart as an explicit false or undefined: same DOM, no calendar anywhere', () => {
    const tasks = () => [ACROSS(), MIDWEEK()];
    mount({}, tasks());
    const unset = dom();
    el.remove();
    mount({ calendar: false }, tasks());
    expect(dom()).toBe(unset);
    expect(engine().graph.config.peek().calendar).toBeNull();
    el.remove();
    mount({ calendar: undefined }, tasks());
    expect(dom()).toBe(unset);
    // Durations are the calendar days of the drawn span
    expect(cellText('x', 'duration')).toBe('4 days');
  });

  it('an app that never sets a calendar still gets one event per move, as before', () => {
    mount({}, [FRIDAY()]);
    const log = record(...PIPELINE);
    dragBar('f', 3);
    expect(types(log)).toEqual(['task-dragged', 'task-updated', 'tasks-change']);
    expect(taskOf('f')).toMatchObject({ start: d(19), end: d(20) });
  });
});
