// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 (step 2.3): the built-in cell editors under a
//  working calendar. The start cell moves forward off non-working time
//  and the end follows the working length, the end cell moves back, the
//  duration cell counts working time, predecessors take working lags.
//  October 2026: Monday the 12th, Saturday the 17th, Wednesday the 21st
//  a holiday. Hour calendars work 8–12 and 13–16 (no shift boundary is
//  a UTC midnight in the test:tz zones). Dates are built with
//  `new Date(y, m, d, …)`; UTC date-only values with Date.UTC.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { commitCellValue, resolveCellEditor, type ResolvedCellEditor } from '../editing/cells';
import { editRules } from '../editing/permissions';
import { flattenTree } from '../gantt-data';
import { isUtcDateOnly } from '../gantt-math';
import { buildBuiltinColumns, buildColumnContext } from '../render/columns';
import { resolveConfig } from '../render/config';
import { DEFAULT_LABELS, DependencyType, type GanttOptions, type GanttTask } from '../types';

const L = DEFAULT_LABELS;
const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const utc = (day: number): Date => new Date(Date.UTC(2026, 9, day));
/** A UTC date-only value is distinguishable from a local date only where the offset isn't 0 (the UTC zone). */
const DATE_ONLY = utc(12).getTimezoneOffset() !== 0;
const NOW = oct(1);
const SHIFT = [
  { start: 8, end: 12 },
  { start: 13, end: 16 },
];

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: oct(12), end: oct(17) }, // Mon–Fri: five working days
  { id: 'f', name: 'Friday', start: oct(16), end: oct(17) },
  { id: 'c', name: 'Short', start: oct(12), end: oct(13) },
  { id: 'i', name: 'Inclusive', start: oct(12), end: oct(16) },
  { id: 'u', name: 'Research', start: utc(12), end: utc(17) },
  { id: 'h', name: 'Shift', start: oct(12, 8), end: oct(12, 16) }, // one 7-hour working day
  {
    id: 'b',
    name: 'Build',
    start: oct(19),
    end: oct(21),
    dependency: [{ taskId: 'a', type: DependencyType.FS, lag: -0.5 }],
  },
];

const BUILTINS = buildBuiltinColumns(L);

interface Setup {
  editor: ResolvedCellEditor;
  commit: (value: string) => ReturnType<typeof commitCellValue>;
}

function setup(key: string, taskId: string, options: GanttOptions = {}): Setup {
  const config = resolveConfig({ editing: true, ...options });
  const ctx = buildColumnContext({ tasks: TASKS, config, now: NOW });
  const row = flattenTree(TASKS).find(r => r.task.id === taskId)!;
  const rules = editRules(row, { config, enableDrag: true, enableResize: true });
  const editor = resolveCellEditor(
    BUILTINS.find(c => c.key === key)!,
    row,
    { config, ctx, labels: L, rules },
  )!;
  return { editor, commit: value => commitCellValue(editor, value, row, ctx) };
}

const HOLIDAYS = { holidays: [oct(21)] };
const DAYS: GanttOptions = { calendar: true, nonWorkingTime: HOLIDAYS };
const HOURS: GanttOptions = {
  calendar: { unit: 'hour', hoursPerDay: 7 },
  nonWorkingTime: { workingHours: SHIFT },
};
const patchOf = (s: Setup, value: string) => {
  const result = s.commit(value);
  if ('error' in result) throw new Error(result.error);
  return result.patch;
};

describe('start cell', () => {
  it('moves a start on a day off to the next working time; the end keeps the working length', () => {
    const s = setup('start', 'a', DAYS);
    // Saturday 17 → Monday 19; five working days from there: Mon, Tue, Thu (21 is a holiday), Fri, Mon
    expect(patchOf(s, '2026-10-17')).toEqual({ start: oct(19), end: oct(27) });
    expect(patchOf(s, '2026-10-18')).toEqual({ start: oct(19), end: oct(27) });
  });

  it('a start on working time stays; the end widens over the days off it now spans', () => {
    const s = setup('start', 'a', DAYS);
    expect(patchOf(s, '2026-10-14')).toEqual({ start: oct(14), end: oct(21) }); // Wed, Thu, Fri, Mon, Tue
    expect(patchOf(s, '2026-10-20')).toEqual({ start: oct(20), end: oct(28) }); // Tue, Thu, Fri, Mon, Tue
  });

  it('a start that snaps back onto the current one commits nothing', () => {
    const s = setup('start', 'a', DAYS);
    expect(s.commit('2026-10-11')).toEqual({ patch: {} }); // Sunday → Monday 12: where it is
    expect(s.commit('2026-10-12')).toEqual({ patch: {} });
  });

  it('skipNonWorking off: the start stays where it was typed, the end still follows the working length', () => {
    const s = setup('start', 'a', { calendar: { skipNonWorking: false }, nonWorkingTime: HOLIDAYS });
    expect(patchOf(s, '2026-10-17')).toEqual({ start: oct(17), end: oct(27) });
  });

  it('calendar durations: the start skips, the end keeps the calendar length, snapped back past the days off', () => {
    const s = setup('start', 'a', { calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS });
    expect(patchOf(s, '2026-10-17')).toEqual({ start: oct(19), end: oct(24) });
    // Monday 19 00:00 is the end of Sunday: it snaps back to Saturday 00:00, the end the task already has
    expect(patchOf(s, '2026-10-14')).toEqual({ start: oct(14) });
  });

  it('keeps a UTC date-only task date-only', () => {
    const s = setup('start', 'u', DAYS);
    const { start, end } = patchOf(s, '2026-10-17') as { start: Date; end: Date };
    expect(isUtcDateOnly(start)).toBe(DATE_ONLY);
    expect(isUtcDateOnly(end)).toBe(DATE_ONLY);
    expect(start.getTime()).toBe(utc(19).getTime());
    expect(end.getTime()).toBe(utc(27).getTime());
  });

  it('working hours: a start in the lunch break moves to 13:00, the end follows the working hours', () => {
    const s = setup('start', 'h', HOURS);
    expect(patchOf(s, '2026-10-13T10:00')).toEqual({ start: oct(13, 10), end: oct(14, 10) }); // 2 h + 3 h + 2 h
    expect(patchOf(s, '2026-10-13T12:30')).toEqual({ start: oct(13, 13), end: oct(14, 12) }); // 3 h + 4 h
    expect(patchOf(s, '2026-10-17T09:00')).toEqual({ start: oct(19, 8), end: oct(19, 16) }); // Saturday → Monday 8:00
  });

  it('is today’s behaviour without a calendar and with calendar durations that skip nothing', () => {
    const off = { calendar: { durations: 'calendar', skipNonWorking: false } } as const;
    for (const id of ['a', 'f', 'u', 'h']) {
      for (const value of ['2026-10-17', '2026-10-14', '2026-10-20', '2026-10-18T09:30', '2026-10-13T12:30']) {
        const plain = setup('start', id).commit(value);
        expect(setup('start', id, off).commit(value), `${id} ${value}`).toEqual(plain);
        expect(setup('start', id, { calendar: false }).commit(value)).toEqual(plain);
      }
    }
  });
});

describe('end cell', () => {
  it('moves an end on a day off back to the end of the last working time', () => {
    const s = setup('end', 'a', DAYS);
    expect(patchOf(s, '2026-10-25')).toEqual({ end: oct(24) }); // Sunday → Saturday 00:00, right after Friday
    expect(patchOf(s, '2026-10-24')).toEqual({ end: oct(24) });
    expect(patchOf(s, '2026-10-20')).toEqual({ end: oct(20) }); // working time ends there already
    expect(patchOf(s, '2026-10-22')).toEqual({ end: oct(21) }); // the holiday's end → where it began
  });

  it('an end that snaps back onto the current one commits nothing', () => {
    expect(setup('end', 'a', DAYS).commit('2026-10-18')).toEqual({ patch: {} }); // Sunday → Saturday 17
  });

  it('keeps an inclusive end inclusive', () => {
    const s = setup('end', 'i', { ...DAYS, endDateMode: 'inclusive' });
    expect(patchOf(s, '2026-10-25')).toEqual({ end: oct(23) }); // Sunday 25 covered → Friday 23
    expect(patchOf(s, '2026-10-23')).toEqual({ end: oct(23) });
    expect(s.commit('2026-10-18')).toEqual({ patch: {} }); // Sunday → Friday 16: where it is
  });

  it('skipNonWorking off: the end stays where it was typed', () => {
    const s = setup('end', 'a', { calendar: { skipNonWorking: false }, nonWorkingTime: HOLIDAYS });
    expect(patchOf(s, '2026-10-25')).toEqual({ end: oct(25) });
  });

  it('calendar durations still skip', () => {
    const s = setup('end', 'a', { calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS });
    expect(patchOf(s, '2026-10-25')).toEqual({ end: oct(24) });
  });

  it('keeps a UTC date-only end date-only', () => {
    const { end } = patchOf(setup('end', 'u', DAYS), '2026-10-25') as { end: Date };
    expect(isUtcDateOnly(end)).toBe(DATE_ONLY);
    expect(end.getTime()).toBe(utc(24).getTime());
  });

  it('working hours: an end in the lunch break moves back to 12:00', () => {
    const s = setup('end', 'h', HOURS);
    expect(patchOf(s, '2026-10-13T12:30')).toEqual({ end: oct(13, 12) });
    expect(patchOf(s, '2026-10-13T18:00')).toEqual({ end: oct(13, 16) });
  });

  it('is today’s behaviour without a calendar and with calendar durations that skip nothing', () => {
    const off = { calendar: { durations: 'calendar', skipNonWorking: false } } as const;
    for (const id of ['a', 'i', 'u', 'h']) {
      for (const value of ['2026-10-25', '2026-10-18', '2026-10-20', '2026-10-13T12:30']) {
        const plain = setup('end', id).commit(value);
        expect(setup('end', id, off).commit(value), `${id} ${value}`).toEqual(plain);
      }
    }
  });
});

describe('duration cell', () => {
  it('shows and counts working days', () => {
    expect(setup('duration', 'a', DAYS).editor.value).toBe('5d');
    expect(setup('duration', 'a', { calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS }).editor.value).toBe(
      '5d',
    );
    const s = setup('duration', 'f', DAYS);
    expect(s.editor.value).toBe('1d');
    expect(patchOf(s, '3d')).toEqual({ end: oct(21) }); // Fri, Mon, Tue
    expect(patchOf(s, '4d')).toEqual({ end: oct(23) }); // the holiday is skipped
    expect(patchOf(s, '0.5d')).toEqual({ end: oct(16, 12) });
    expect(patchOf(s, '12h')).toEqual({ end: oct(16, 12) });
    expect(patchOf(s, '1w')).toEqual({ end: oct(24) }); // five working days: Fri, Mon, Tue, Thu, Fri
  });

  it('typing the current duration commits nothing', () => {
    const s = setup('duration', 'a', DAYS);
    expect(s.commit('5d')).toEqual({ patch: {} });
    expect(s.commit('5')).toEqual({ patch: {} });
    expect(s.commit('1w')).toEqual({ patch: {} });
  });

  it('rejects a zero or malformed duration', () => {
    const s = setup('duration', 'a', DAYS);
    expect(s.commit('0')).toEqual({ error: L.errorDuration });
    expect(s.commit('abc')).toEqual({ error: L.errorDuration });
  });

  it('keeps an inclusive end inclusive', () => {
    const s = setup('duration', 'i', { ...DAYS, endDateMode: 'inclusive' });
    expect(s.editor.value).toBe('5d');
    expect(patchOf(s, '3d')).toEqual({ end: oct(14) });
    expect(patchOf(s, '6d')).toEqual({ end: oct(19) });
  });

  it('keeps a UTC date-only end date-only', () => {
    const { end } = patchOf(setup('duration', 'u', DAYS), '3d') as { end: Date };
    expect(isUtcDateOnly(end)).toBe(DATE_ONLY);
    expect(end.getTime()).toBe(utc(15).getTime());
  });

  it('working hours: the units are the hours of a working day', () => {
    const s = setup('duration', 'h', HOURS);
    expect(s.editor.value).toBe('1d');
    expect(patchOf(s, '6h')).toEqual({ end: oct(12, 15) }); // 4 h in the morning, 2 h after lunch
    expect(patchOf(s, '1.5d')).toEqual({ end: oct(13, 11, 30) }); // 7 h + 3.5 h
    expect(patchOf(s, '2d')).toEqual({ end: oct(13, 16) });
    expect(patchOf(s, '1w')).toEqual({ end: oct(16, 16) });
    expect(setup('duration', 'h', { ...HOURS, calendar: { unit: 'hour', hoursPerDay: 6 } }).editor.value).toBe('7h');
    expect(patchOf(setup('duration', 'h', { ...HOURS, calendar: { unit: 'hour', hoursPerDay: 6 } }), '1d')).toEqual({
      end: oct(12, 15),
    });
  });

  it('calendar durations keep calendar days: what is typed is what is shown, the end may land on a day off', () => {
    const s = setup('duration', 'c', { calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS });
    expect(s.editor.value).toBe('1d');
    expect(patchOf(s, '4d')).toEqual({ end: oct(16) });
    expect(patchOf(s, '5d')).toEqual({ end: oct(17) });
    expect(patchOf(s, '6d')).toEqual({ end: oct(18) }); // Sunday 18: not snapped back, `6d` reads `6d`
    const friday = setup('duration', 'f', { calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS });
    expect(patchOf(friday, '3d')).toEqual({ end: oct(19) }); // Friday + 3 days ends Monday 00:00
  });

  it('is today’s behaviour without a calendar and with calendar durations that skip nothing', () => {
    const off = { calendar: { durations: 'calendar', skipNonWorking: false } } as const;
    for (const id of ['a', 'f', 'i', 'u', 'h']) {
      const plain = setup('duration', id);
      expect(setup('duration', id, off).editor.value).toBe(plain.editor.value);
      for (const value of ['3d', '1.5d', '6h', '2w', '8', '0.5']) {
        expect(setup('duration', id, off).commit(value), `${id} ${value}`).toEqual(plain.commit(value));
      }
    }
  });
});

describe('predecessors cell', () => {
  it('shows and reads lags in working units', () => {
    const days = setup('predecessors', 'b', DAYS);
    expect(days.editor.value).toBe('a FS-12h');
    expect(patchOf(days, 'a FS+1w')).toEqual({ dependency: [{ taskId: 'a', lag: 5 }] });
    const hours = setup('predecessors', 'b', HOURS);
    expect(hours.editor.value).toBe('a FS-3.5h'); // half a day of seven hours
    expect(patchOf(hours, 'a SS+7h')).toEqual({ dependency: [{ taskId: 'a', type: DependencyType.SS, lag: 1 }] });
    expect(patchOf(hours, 'a-7h; ')).toEqual({ dependency: [{ taskId: 'a', lag: -1 }] });
    expect(hours.commit('a-3.5h')).toEqual({ patch: {} }); // the current lag
  });

  it('calendar durations and no calendar: today’s lags', () => {
    for (const options of [{}, { calendar: { durations: 'calendar' } } as const]) {
      const s = setup('predecessors', 'b', options);
      expect(s.editor.value).toBe('a FS-12h');
      expect(patchOf(s, 'a FS+1w')).toEqual({ dependency: [{ taskId: 'a', lag: 7 }] });
    }
  });
});
