// ─────────────────────────────────────────────────────────────
//  Tests — editing/parse.ts: the predecessors grammar, durations and the
//  date editors' values (runs under test:tz: dates are built with
//  new Date(y, m, d, h); UTC date-only values with Date.UTC)
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  ParseError,
  endForDuration,
  formatDateInput,
  formatDurationInput,
  formatPredecessors,
  parseDateInput,
  parseDuration,
  parsePredecessors,
} from '../editing/parse';
import { isUtcDateOnly } from '../gantt-math';
import { taskSpan } from '../render/timeline';
import { DependencyType, type GanttDependency, type GanttTask } from '../types';

const day = (m: number, d: number, h = 0, min = 0) => new Date(2026, m, d, h, min);
const utc = (m: number, d: number) => new Date(Date.UTC(2026, m, d));
const task = (id: string, name = id, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name,
  start: day(9, 5),
  end: day(9, 10),
  ...extra,
});

const TASKS: GanttTask[] = [
  task('research', 'Research'),
  task('scope', 'Scope the work'),
  task('task-2', 'Build'),
  task('task', 'Task'),
  task('d1', 'Design'),
  task('d2', 'Design'),
  task('7', 'Seven'),
  task('self', 'Self'),
  task('kickoff', '  Kickoff  '),
];
const parse = (text: string) => parsePredecessors(text, { tasks: TASKS, selfId: 'self' });
const parseError = (fn: () => unknown): ParseError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ParseError) return e;
    throw e;
  }
  throw new Error('expected a ParseError');
};

const EXCLUSIVE = { endDateMode: 'exclusive', normalizeDateOnly: true } as const;
const INCLUSIVE = { endDateMode: 'inclusive', normalizeDateOnly: true } as const;
const H = 1 / 24;

describe('parsePredecessors', () => {
  it('reads nothing from empty text or bare separators', () => {
    expect(parse('')).toEqual([]);
    expect(parse('  ; ,  ;')).toEqual([]);
  });

  it('reads ids with types and lags into minimal objects, in text order', () => {
    expect(parse('research FS+2d; scope SS')).toEqual([
      { taskId: 'research', lag: 2 },
      { taskId: 'scope', type: 'SS' },
    ]);
    expect(parse('research, scope ff, 7 SF-1')).toEqual([
      { taskId: 'research' },
      { taskId: 'scope', type: 'FF' },
      { taskId: '7', type: 'SF', lag: -1 },
    ]);
  });

  it('takes lags in days (default), weeks and hours, decimals and spaces included', () => {
    expect(parse('research+2')).toEqual([{ taskId: 'research', lag: 2 }]);
    expect(parse('research FS - 1w')).toEqual([{ taskId: 'research', lag: -7 }]);
    expect(parse('research ss+4H')).toEqual([{ taskId: 'research', type: 'SS', lag: 4 * H }]);
    expect(parse('research SF +.5d')).toEqual([{ taskId: 'research', type: 'SF', lag: 0.5 }]);
    expect(parse('research FS+1.5D')).toEqual([{ taskId: 'research', lag: 1.5 }]);
    expect(parse('research FS+0d')).toEqual([{ taskId: 'research' }]);
  });

  it('resolves names: exact, then ignoring case, trimmed; ids first', () => {
    expect(parse('Scope the work FF-1w')).toEqual([{ taskId: 'scope', type: 'FF', lag: -7 }]);
    expect(parse('scope THE work')).toEqual([{ taskId: 'scope' }]);
    expect(parse('Kickoff')).toEqual([{ taskId: 'kickoff' }]);
    expect(parse('RESEARCH')).toEqual([{ taskId: 'research' }]);
    expect(parse('Build ss')).toEqual([{ taskId: 'task-2', type: 'SS' }]);
  });

  it('reads the most literal reference first: ids with dashes stay whole', () => {
    expect(parse('task-2')).toEqual([{ taskId: 'task-2' }]);
    // not an id, so the trailing `-3` is a lag on `task`
    expect(parse('task-3')).toEqual([{ taskId: 'task', lag: -3 }]);
  });

  it('accepts a type joined to the ref (numeric ids, as in MS Project)', () => {
    expect(parse('7FS+3d')).toEqual([{ taskId: '7', lag: 3 }]);
    expect(parse('7ss')).toEqual([{ taskId: '7', type: 'SS' }]);
  });

  it('returns self links and repeated entries for validation to reject', () => {
    expect(parse('self')).toEqual([{ taskId: 'self' }]);
    expect(parse('research; research')).toEqual([{ taskId: 'research' }, { taskId: 'research' }]);
  });

  it('throws ambiguous for a name shared by several tasks (ids still work)', () => {
    const e = parseError(() => parse('research; Design SS'));
    expect([e.code, e.ref]).toEqual(['ambiguous', 'Design']);
    expect(parseError(() => parse('design')).code).toBe('ambiguous');
    expect(parse('d2 SS')).toEqual([{ taskId: 'd2', type: 'SS' }]);
  });

  it('throws unknown with the name typed before the type or an obvious lag, else the entry', () => {
    const e = parseError(() => parse('research; reserch FS+2d'));
    expect([e.code, e.ref]).toEqual(['unknown', 'reserch']);
    expect(parseError(() => parse('reserch+2d')).ref).toBe('reserch');
    expect(parseError(() => parse('nothing here')).ref).toBe('nothing here');
    expect(parseError(() => parse('foo-2')).ref).toBe('foo-2');
    expect(parseError(() => parse('Address')).ref).toBe('Address');
  });

  it('throws syntax for an entry with no reference', () => {
    const e = parseError(() => parse('research; +2d'));
    expect([e.code, e.ref]).toEqual(['syntax', '+2d']);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ParseError');
  });
});

describe('formatPredecessors', () => {
  const deps = (dependency: GanttTask['dependency']) => formatPredecessors(task('x', 'x', { dependency }));

  it('writes ids, the type when it is not FS or a lag follows, and the lag', () => {
    expect(deps(undefined)).toBe('');
    expect(deps('a')).toBe('a');
    expect(deps({ taskId: 'a', type: DependencyType.FS })).toBe('a');
    expect(
      deps([
        { taskId: 'a', type: DependencyType.FS, lag: 2 },
        { taskId: 'b', type: DependencyType.SS },
      ]),
    ).toBe('a FS+2d; b SS');
    expect(deps({ taskId: 'a', lag: -0.5 })).toBe('a FS-12h');
    expect(deps({ taskId: 'a', type: DependencyType.FF, lag: 1.5 })).toBe('a FF+1.5d');
    expect(deps({ taskId: 'a', type: DependencyType.SF, lag: -7 })).toBe('a SF-7d');
    expect(deps({ taskId: 'a', lag: 1 + 4 * H })).toBe('a FS+28h');
  });

  it('is read back by parsePredecessors', () => {
    const list: GanttDependency[] = [
      { taskId: 'research', lag: 2 },
      { taskId: 'scope', type: DependencyType.SS, lag: -0.25 },
      { taskId: 'task-2', type: DependencyType.FF },
      { taskId: '7', type: DependencyType.SF, lag: 1.5 },
    ];
    const text = formatPredecessors(task('self', 'Self', { dependency: list }));
    expect(parse(text)).toEqual(list);
  });
});

describe('parseDuration', () => {
  it('reads days, weeks and hours, decimals with a point or a comma', () => {
    expect(parseDuration('5')).toBe(5);
    expect(parseDuration('5d')).toBe(5);
    expect(parseDuration(' 5 D ')).toBe(5);
    expect(parseDuration('2w')).toBe(14);
    expect(parseDuration('4h')).toBeCloseTo(4 * H, 12);
    expect(parseDuration('1.5d')).toBe(1.5);
    expect(parseDuration('1,5d')).toBe(1.5);
    expect(parseDuration('.5')).toBe(0.5);
    expect(parseDuration('0')).toBe(0);
  });

  it('throws ParseError(syntax) on anything else', () => {
    for (const text of ['', '  ', 'abc', '-2d', '5x', '5 d h', '1.2.3', '1,5,3', 'd']) {
      const e = parseError(() => parseDuration(text));
      expect([e.code, e.ref]).toEqual(['syntax', text]);
    }
  });
});

describe('formatDurationInput and endForDuration', () => {
  it('formats the drawn duration: days, hours under a day, two-decimal days, else hours', () => {
    expect(formatDurationInput(task('a'), EXCLUSIVE)).toBe('5d');
    expect(formatDurationInput({ start: day(9, 5), end: day(9, 9) }, INCLUSIVE)).toBe('5d');
    expect(formatDurationInput({ start: day(9, 5), end: day(9, 5, 6) }, EXCLUSIVE)).toBe('6h');
    expect(formatDurationInput({ start: day(9, 5), end: day(9, 6, 12) }, EXCLUSIVE)).toBe('1.5d');
    expect(formatDurationInput({ start: day(9, 5), end: day(9, 6, 4) }, EXCLUSIVE)).toBe('28h');
    expect(formatDurationInput({ start: day(9, 5, 9), end: day(9, 5, 9, 30) }, EXCLUSIVE)).toBe('0.5h');
    expect(formatDurationInput({ start: utc(9, 5), end: utc(9, 12) }, EXCLUSIVE)).toBe('7d');
    expect(formatDurationInput({ start: day(9, 5), end: day(9, 5) }, EXCLUSIVE)).toBe('0d');
  });

  it('moves a whole-day end by whole days, keeping its shape and the end mode', () => {
    expect(endForDuration(task('a'), 3, EXCLUSIVE)).toEqual(day(9, 8));
    expect(endForDuration({ start: day(9, 5), end: day(9, 9) }, 3, INCLUSIVE)).toEqual(day(9, 7));
    expect(endForDuration({ start: day(9, 5, 9), end: day(9, 10, 9) }, 2, EXCLUSIVE)).toEqual(day(9, 7, 9));
    const end = endForDuration({ start: utc(9, 5), end: utc(9, 10) }, 3, EXCLUSIVE);
    expect(end.getTime()).toBe(Date.UTC(2026, 9, 8));
    if (end.getTimezoneOffset() !== 0) expect(isUtcDateOnly(end)).toBe(true);
  });

  it('adds hours as real time from the drawn start, through the end mode', () => {
    expect(endForDuration(task('a'), 4 * H, EXCLUSIVE)).toEqual(day(9, 5, 4));
    expect(endForDuration(task('a'), 1.5, INCLUSIVE)).toEqual(day(9, 6, 12));
    // a sub-day task given whole days: the drawn end is a midnight, inclusive → the day before
    expect(endForDuration({ start: day(9, 5), end: day(9, 5, 6) }, 2, INCLUSIVE)).toEqual(day(9, 6));
    expect(endForDuration({ start: day(9, 5), end: day(9, 5, 6) }, 2, EXCLUSIVE)).toEqual(day(9, 7));
    // a UTC date-only start is read as its local day before hours are added
    expect(endForDuration({ start: utc(9, 5), end: utc(9, 6) }, 6 * H, EXCLUSIVE)).toEqual(day(9, 5, 6));
  });

  it('round-trips (format → parse → end) on every day of the year, daylight-saving days included', () => {
    const shapes: [number, number][] = [
      [0, 1],
      [9, 6],
      [3, 4 + 4 * H],
      [6, 0.5],
      [22, 3],
    ];
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= 28; d++) {
        for (const [hour, days] of shapes) {
          const start = new Date(2026, m, d, hour);
          for (const cfg of [EXCLUSIVE, INCLUSIVE]) {
            const t = { start, end: endForDuration({ start, end: start }, days, cfg) };
            const text = formatDurationInput(t, cfg);
            expect(endForDuration(t, parseDuration(text), cfg).getTime(), `${start.toString()} ${text}`).toBe(
              t.end.getTime(),
            );
            const span = taskSpan(t, cfg);
            expect(span.end.getTime()).toBeGreaterThan(span.start.getTime());
          }
        }
      }
    }
  });
});

describe('formatDateInput and parseDateInput', () => {
  it('formats local days and times (seconds dropped); UTC date-only values show their own day', () => {
    expect(formatDateInput(day(9, 5), 'date')).toBe('2026-10-05');
    expect(formatDateInput(day(9, 5), 'datetime-local')).toBe('2026-10-05T00:00');
    expect(formatDateInput(new Date(2026, 0, 9, 9, 7, 30), 'datetime-local')).toBe('2026-01-09T09:07');
    expect(formatDateInput(utc(9, 5), 'date')).toBe('2026-10-05');
    expect(formatDateInput(utc(9, 5), 'datetime-local')).toBe('2026-10-05T00:00');
  });

  it('parses a date shaped like the value it replaces', () => {
    expect(parseDateInput('2026-10-07', 'date', day(9, 5))).toEqual(day(9, 7));
    // a date input keeps the time of day
    expect(parseDateInput('2026-10-07', 'date', day(9, 5, 9, 30))).toEqual(day(9, 7, 9, 30));
    const utcDay = parseDateInput(' 2026-10-07 ', 'date', utc(9, 5));
    expect(utcDay.getTime()).toBe(Date.UTC(2026, 9, 7));
    if (utcDay.getTimezoneOffset() !== 0) expect(isUtcDateOnly(utcDay)).toBe(true);
  });

  it('parses datetime-local values: T or a space, optional seconds; a time makes a UTC date-only value local', () => {
    expect(parseDateInput('2026-10-07T14:30', 'datetime-local', day(9, 5))).toEqual(day(9, 7, 14, 30));
    expect(parseDateInput('2026-10-07 14:30:15', 'datetime-local', day(9, 5))).toEqual(
      new Date(2026, 9, 7, 14, 30, 15),
    );
    expect(parseDateInput('2026-10-07T14:30:15.250', 'datetime-local', day(9, 5))).toEqual(
      new Date(2026, 9, 7, 14, 30, 15, 250),
    );
    expect(parseDateInput('2026-10-07T14:30', 'datetime-local', utc(9, 5))).toEqual(day(9, 7, 14, 30));
    expect(parseDateInput('2026-10-07T00:00', 'datetime-local', utc(9, 5)).getTime()).toBe(Date.UTC(2026, 9, 7));
  });

  it('accepts leap days in leap years only, and old years', () => {
    expect(parseDateInput('2028-02-29', 'date', day(0, 1))).toEqual(new Date(2028, 1, 29));
    const old = parseDateInput('0099-03-01', 'date', day(0, 1));
    expect([old.getFullYear(), old.getMonth(), old.getDate()]).toEqual([99, 2, 1]);
  });

  it('throws ParseError(syntax) on empty or invalid values', () => {
    const bad: [string, 'date' | 'datetime-local'][] = [
      ['', 'date'],
      ['2026-13-01', 'date'],
      ['2026-00-10', 'date'],
      ['2026-02-29', 'date'],
      ['2026-04-31', 'date'],
      ['2026-10-07T14:30', 'date'],
      ['2026-10-07', 'datetime-local'],
      ['2026-10-07T24:00', 'datetime-local'],
      ['2026-10-07T12:60', 'datetime-local'],
      ['07/10/2026', 'date'],
    ];
    for (const [value, kind] of bad) {
      const e = parseError(() => parseDateInput(value, kind, day(9, 5)));
      expect([e.code, e.ref], `${kind} ${value}`).toEqual(['syntax', value]);
    }
  });

  it('round-trips with formatDateInput', () => {
    for (const d of [day(0, 1), day(2, 29, 2, 30), day(9, 25, 23, 59), new Date(2026, 5, 15, 12, 5)]) {
      expect(parseDateInput(formatDateInput(d, 'datetime-local'), 'datetime-local', d)).toEqual(d);
      expect(parseDateInput(formatDateInput(d, 'date'), 'date', d)).toEqual(d);
    }
    const u = utc(2, 29);
    expect(parseDateInput(formatDateInput(u, 'date'), 'date', u).getTime()).toBe(u.getTime());
  });
});
