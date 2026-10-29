// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 step 2.2: durations on display. The Duration
//  column (text, sort, width), the Variance column, the tooltip's
//  duration / float / variance rows, the drag readout and the CSV
//  `duration` / `variance` values read the chart's date reading:
//  working days or hours with a working calendar, calendar days
//  without one (byte-identical to the calendar-day code they replace,
//  checked on seeded spans). October 2026: Monday the 12th, Friday
//  the 16th, Saturday the 17th, Wednesday the 21st a holiday.
//  Dates are built with `new Date(y, m, d, …)`: run under `pnpm test:tz`.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABELS,
  DEFAULT_TOOLTIP_LABELS,
  baselineVarianceDays,
  buildBuiltinColumns,
  buildColumnContext,
  buildTooltipModel,
  calendarDays,
  computeCellVisual,
  createExportSource,
  csvCellValue,
  durationColumnWidth,
  durationLabel,
  exportChartCsv,
  flattenTree,
  formatDragReadout,
  formatFloat,
  measureVariance,
  normalizeTasks,
  resolveConfig,
  taskDurationLabel,
  taskSpan,
  type ColumnContext,
  type ColumnDef,
  type GanttFlatRow,
  type GanttLabels,
  type GanttOptions,
  type GanttTask,
  type ResolvedGanttConfig,
} from '../index';

/** Local date in October 2026 (day, hour, minute). */
const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const NOW = oct(14, 10);
const LUNCH = [
  { start: 8, end: 12 },
  { start: 13, end: 17 },
];
const HOLIDAYS = { holidays: [oct(21)] };

/** No calendar: calendar days, as before Phase 13. */
const NONE = resolveConfig({});
/** Mon–Fri working days, the 21st a holiday. */
const DAY = resolveConfig({ calendar: true, nonWorkingTime: HOLIDAYS });
/** Working hours 8–12 / 13–17 (8 h a day), the 21st a holiday. */
const HOUR = resolveConfig({ calendar: { unit: 'hour' }, nonWorkingTime: { ...HOLIDAYS, workingHours: LUNCH } });
/** The same hours counted in 6-hour days. */
const HOUR6 = resolveConfig({
  calendar: { unit: 'hour', hoursPerDay: 6 },
  nonWorkingTime: { ...HOLIDAYS, workingHours: LUNCH },
});
/** A calendar that skips non-working time on edits but measures calendar days. */
const CALDAYS = resolveConfig({ calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS });
const INCLUSIVE = resolveConfig({ endDateMode: 'inclusive' });

const task = (id: string, start: Date, end: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start,
  end,
  ...extra,
});

const FRI_TUE = task('fri-tue', oct(16), oct(20)); // 4 calendar days, Friday + Monday = 2 working days
const OVER_HOLIDAY = task('holiday', oct(19), oct(23)); // 4 calendar days, the holiday is not worked: 3
const WEEKEND = task('weekend', oct(17), oct(19)); // 2 calendar days, no working time
const SIX_HOURS = task('six', oct(12, 8), oct(12, 14)); // 4 h + 1 h of work
const OVERNIGHT = task('night', oct(12, 8), oct(13, 10)); // 8 h + 2 h of work

const columnSortValue = (col: ColumnDef, row: GanttFlatRow, ctx: ColumnContext): unknown => col.sortValue!(row, ctx);
const rowOf = (t: GanttTask): GanttFlatRow => flattenTree(normalizeTasks([t]))[0];
const ctxOf = (config: ResolvedGanttConfig, tasks: GanttTask[] = []): ColumnContext =>
  buildColumnContext({ tasks, config, now: NOW });
const builtin = (key: string, labels: GanttLabels = DEFAULT_LABELS): ColumnDef =>
  buildBuiltinColumns(labels, 'en-US').find(c => c.key === key)!;

const durationText = (t: GanttTask, config: ResolvedGanttConfig, labels: GanttLabels = DEFAULT_LABELS): string =>
  builtin('duration', labels).render!(rowOf(t), ctxOf(config, [t]));
const durationSort = (t: GanttTask, config: ResolvedGanttConfig): unknown =>
  columnSortValue(builtin('duration'), rowOf(t), ctxOf(config, [t]));

/** A seeded generator (LCG) of spans: whole days and times, 1 hour to 30 days long. */
function seededTasks(count: number): GanttTask[] {
  let s = 20261012;
  const next = (n: number): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s % n;
  };
  return Array.from({ length: count }, (_, i) => {
    const wholeDay = next(3) === 0;
    const start = new Date(2026, 9, 1 + next(40), wholeDay ? 0 : next(24), wholeDay ? 0 : next(2) * 30);
    const end = wholeDay
      ? new Date(2026, start.getMonth(), start.getDate() + next(30))
      : new Date(2026, start.getMonth(), start.getDate(), start.getHours() + 1 + next(24 * 30), start.getMinutes());
    return task(
      `s${i}`,
      start,
      end,
      next(2) ? { baseline: { start, end: new Date(+end - next(72) * 3_600_000) } } : {},
    );
  });
}

describe('buildColumnContext', () => {
  it('copies the calendar of the date reading; none reads null', () => {
    expect(ctxOf(DAY).calendar).toBe(DAY.calendar);
    expect(ctxOf(HOUR).calendar).toBe(HOUR.calendar);
    expect(ctxOf(NONE).calendar).toBeNull();
    expect(buildColumnContext({ tasks: [], now: NOW }).calendar).toBeNull();
    expect(buildColumnContext({ tasks: [], now: NOW, config: null }).calendar).toBeNull();
    expect(
      buildColumnContext({ tasks: [], now: NOW, config: { endDateMode: 'inclusive', normalizeDateOnly: false } }),
    ).toMatchObject({ endDateMode: 'inclusive', normalizeDateOnly: false, calendar: null });
  });
});

describe('Duration column', () => {
  it('counts working days with a day calendar, in the text and in the sort value', () => {
    expect(durationText(FRI_TUE, DAY)).toBe('2 days');
    expect(durationSort(FRI_TUE, DAY)).toBe(2);
    expect(durationText(OVER_HOLIDAY, DAY)).toBe('3 days');
    expect(durationSort(OVER_HOLIDAY, DAY)).toBe(3);
    expect(durationText(WEEKEND, DAY)).toBe('0 days');
    expect(durationSort(WEEKEND, DAY)).toBe(0);
    expect(durationText(SIX_HOURS, DAY)).toBe('0.25 days');
    expect(durationSort(SIX_HOURS, DAY)).toBe(0.25);
  });

  it('never reads weeks with working durations: a working week is not 7 days', () => {
    const month = task('month', oct(5), oct(30)); // 25 calendar days, 18 working days (the 21st is off)
    expect(durationText(month, DAY)).toBe('18 days');
    expect(durationText(month, NONE)).toBe('3w 4d');
  });

  it('reads hours under one working day and days of `hoursPerDay` hours with an hour calendar', () => {
    expect(durationText(SIX_HOURS, HOUR)).toBe('5 hours');
    expect(durationSort(SIX_HOURS, HOUR)).toBe(5 / 8);
    expect(durationText(OVERNIGHT, HOUR)).toBe('1.25 days');
    expect(durationSort(OVERNIGHT, HOUR)).toBe(1.25);
    expect(durationText(FRI_TUE, HOUR)).toBe('2 days');
    expect(durationText(WEEKEND, HOUR)).toBe('0 days');
    expect(durationText(oneHour(), HOUR)).toBe('1 hour');
  });

  it('measures days of `hoursPerDay` hours', () => {
    expect(durationText(SIX_HOURS, HOUR6)).toBe('5 hours');
    expect(durationText(OVERNIGHT, HOUR6)).toBe('1.67 days'); // 10 h of 6
    expect(durationSort(OVERNIGHT, HOUR6)).toBeCloseTo(10 / 6, 10);
    expect(durationText(task('day', oct(12, 8), oct(13, 8)), HOUR6)).toBe('1.33 days'); // 8 h of 6
  });

  it('keeps calendar days with `durations: "calendar"`', () => {
    expect(durationText(FRI_TUE, CALDAYS)).toBe(durationText(FRI_TUE, NONE));
    expect(durationText(FRI_TUE, CALDAYS)).toBe('4 days');
    expect(durationSort(FRI_TUE, CALDAYS)).toBe(4);
    expect(durationText(task('month', oct(5), oct(30)), CALDAYS)).toBe('3w 4d');
  });

  it('counts an inclusive end’s last day, like the bar', () => {
    const inclusiveDay = resolveConfig({ endDateMode: 'inclusive', calendar: true, nonWorkingTime: HOLIDAYS });
    expect(durationText(task('fri-mon', oct(16), oct(19)), inclusiveDay)).toBe('2 days');
    expect(durationText(task('sat-sun', oct(17), oct(18)), inclusiveDay)).toBe('0 days');
    expect(durationText(task('one', oct(15), oct(15)), inclusiveDay)).toBe('1 day');
  });

  it('formats through the labels', () => {
    const labels: GanttLabels = {
      ...DEFAULT_LABELS,
      durationDay: 'un giorno',
      durationDays: n => `${n} giorni`,
      durationHours: h => `${h} ore`,
    };
    expect(durationText(FRI_TUE, DAY, labels)).toBe('2 giorni');
    expect(durationText(SIX_HOURS, HOUR, labels)).toBe('5 ore');
    expect(durationText(task('d', oct(12), oct(13)), DAY, labels)).toBe('un giorno');
  });

  it('is the same text as taskDurationLabel (the tooltip’s and the readout’s)', () => {
    for (const t of [FRI_TUE, OVER_HOLIDAY, WEEKEND, SIX_HOURS, OVERNIGHT]) {
      for (const config of [NONE, DAY, HOUR, HOUR6, CALDAYS]) {
        expect(durationText(t, config)).toBe(taskDurationLabel(t, config, DEFAULT_LABELS));
      }
    }
  });

  it('sorts by the measured days', () => {
    const tasks = [FRI_TUE, OVER_HOLIDAY, WEEKEND];
    const col = builtin('duration');
    const ctx = ctxOf(DAY, tasks);
    const sorted = [...tasks].sort(
      (a, b) => (columnSortValue(col, rowOf(a), ctx) as number) - (columnSortValue(col, rowOf(b), ctx) as number),
    );
    expect(sorted.map(t => t.id)).toEqual(['weekend', 'fri-tue', 'holiday']);
    // In calendar days the other two tie (4 days each) and keep their order
    const byCalendar = [...tasks].sort(
      (a, b) =>
        (columnSortValue(col, rowOf(a), ctxOf(NONE, tasks)) as number) -
        (columnSortValue(col, rowOf(b), ctxOf(NONE, tasks)) as number),
    );
    expect(byCalendar.map(t => t.id)).toEqual(['weekend', 'fri-tue', 'holiday']);
  });
});

describe('Duration column width', () => {
  it('keeps the English default of 96', () => {
    expect(builtin('duration').width).toBe(96);
    expect(builtin('duration', { ...DEFAULT_LABELS, durationHours: h => `${h} hours` }).width).toBe(96);
  });

  it('keeps durationColumnWidth to the day and week texts', () => {
    expect(durationColumnWidth(DEFAULT_LABELS)).toBeLessThan(96);
  });

  it('does not depend on the hours text: the width is the same with and without a calendar', () => {
    const labels: GanttLabels = { ...DEFAULT_LABELS, durationHours: h => `${h} horas de trabajo efectivo y más` };
    expect(builtin('duration', labels).width).toBe(builtin('duration').width);
    expect(builtin('duration', labels).width).toBe(96);
  });
});

describe('Variance column', () => {
  const late = task('late', oct(14), oct(20), { baseline: { start: oct(14), end: oct(15) } });
  const early = task('early', oct(14), oct(15), { baseline: { start: oct(14), end: oct(20) } });
  const varianceText = (t: GanttTask, config: ResolvedGanttConfig): unknown =>
    columnSortValue(builtin('variance'), rowOf(t), ctxOf(config, [t]));

  it('is the finish variance in working days, signed', () => {
    // Thursday 15 → Tuesday 20: Thursday, Friday and Monday are worked
    expect(varianceText(late, DAY)).toBe(3);
    expect(varianceText(late, NONE)).toBe(5);
    expect(varianceText(early, DAY)).toBe(-3);
    expect(varianceText(early, NONE)).toBe(-5);
    expect(varianceText(late, CALDAYS)).toBe(5);
  });

  it('is in days of `hoursPerDay` hours with an hour calendar, rounded to 0.1', () => {
    const t = task('hours', oct(12, 8), oct(13, 10, 30), { baseline: { start: oct(12, 8), end: oct(12, 16, 30) } });
    // 16:30 → next day 10:30 is 0.5 h + 2.5 h of work: 3 / 8 = 0.375 → 0.4
    expect(varianceText(t, HOUR)).toBe(0.4);
    // 3 / 6 = 0.5
    expect(varianceText(t, HOUR6)).toBe(0.5);
  });

  it('is null (sorts last) without a baseline; measureVariance is null too', () => {
    expect(varianceText(FRI_TUE, DAY)).toBeNull();
    expect(measureVariance(FRI_TUE, DAY)).toBeNull();
    expect(measureVariance(late, DAY)).toBe(3);
  });
});

describe('tooltip', () => {
  const model = (
    t: GanttTask,
    config: ResolvedGanttConfig,
    extra: Partial<Parameters<typeof buildTooltipModel>[0]> = {},
  ) =>
    buildTooltipModel({
      task: t,
      config,
      labels: DEFAULT_LABELS,
      dateFormat: 'YYYY-MM-DD',
      now: NOW,
      ...extra,
    });
  const row = (m: ReturnType<typeof model>, kind: string) => m.rows.find(r => r.kind === kind)?.value;

  it('shows the duration in working time', () => {
    expect(row(model(FRI_TUE, NONE), 'duration')).toBe('4 days');
    expect(row(model(FRI_TUE, DAY), 'duration')).toBe('2 days');
    expect(row(model(SIX_HOURS, HOUR), 'duration')).toBe('5 hours');
    expect(row(model(FRI_TUE, CALDAYS), 'duration')).toBe('4 days');
  });

  it('shows the float in measured days, in hours under one working day of an hour calendar', () => {
    const floatDays = (days: number) => new Map([[FRI_TUE.id, days]]);
    expect(row(model(FRI_TUE, DAY, { floatDays: floatDays(1.5) }), 'float')).toBe('1.5d');
    expect(row(model(FRI_TUE, DAY, { floatDays: floatDays(0.5) }), 'float')).toBe('0.5d');
    expect(row(model(FRI_TUE, HOUR, { floatDays: floatDays(0.5) }), 'float')).toBe('4h');
    expect(row(model(FRI_TUE, HOUR6, { floatDays: floatDays(0.5) }), 'float')).toBe('3h');
    expect(row(model(FRI_TUE, HOUR, { floatDays: floatDays(2) }), 'float')).toBe('2d');
    expect(row(model(FRI_TUE, HOUR, { floatDays: floatDays(0) }), 'float')).toBe('0d');
    expect(row(model(FRI_TUE, NONE, { floatDays: floatDays(0.5) }), 'float')).toBe('0.5d');
    expect(row(model(FRI_TUE, CALDAYS, { floatDays: floatDays(0.5) }), 'float')).toBe('0.5d');
  });

  it('takes the float labels from the chart’s labels', () => {
    const labels: GanttLabels = { ...DEFAULT_LABELS, ttFloatHours: h => `${h} ore`, ttFloatDays: d => `${d} giorni` };
    const floatDays = new Map([[FRI_TUE.id, 0.5]]);
    expect(row(model(FRI_TUE, HOUR, { floatDays, labels }), 'float')).toBe('4 ore');
    expect(row(model(FRI_TUE, DAY, { floatDays, labels }), 'float')).toBe('0.5 giorni');
    expect(DEFAULT_TOOLTIP_LABELS.ttFloatHours(4)).toBe('4h');
  });

  it('leaves the float out of a group', () => {
    const floatDays = new Map([[FRI_TUE.id, 1]]);
    expect(row(model({ ...FRI_TUE, type: 'group' }, HOUR, { floatDays }), 'float')).toBeUndefined();
  });

  it('words the variance in working days', () => {
    const late = task('late', oct(14), oct(20), { baseline: { start: oct(14), end: oct(15) } });
    const withBaseline = (c: GanttOptions) => resolveConfig({ baseline: true, ...c });
    expect(model(late, withBaseline({})).baselineVariance).toBe('+5d');
    // Thursday 15 → Tuesday 20 skips the weekend
    expect(model(late, withBaseline({ calendar: true })).baselineVariance).toBe('+3d');
    expect(model(late, { ...CALDAYS, baseline: true }).baselineVariance).toBe('+5d');
    expect(baselineVarianceDays(late, DAY)).toBe(3);
    expect(baselineVarianceDays(late, NONE)).toBe(5);
    expect(baselineVarianceDays(FRI_TUE, DAY)).toBeNull();
  });
});

describe('drag readout', () => {
  const readout = (range: { start: Date; end: Date }, config: ResolvedGanttConfig, unit: 'day' | 'hour' = 'day') =>
    formatDragReadout(range, { labels: DEFAULT_LABELS, dates: config, unit });

  it('shows the working duration', () => {
    expect(readout({ start: oct(16), end: oct(20) }, NONE)).toBe('16 Oct – 20 Oct · 4 days');
    expect(readout({ start: oct(16), end: oct(20) }, DAY)).toBe('16 Oct – 20 Oct · 2 days');
    expect(readout({ start: oct(19), end: oct(23) }, DAY)).toBe('19 Oct – 23 Oct · 3 days');
    expect(readout({ start: oct(16), end: oct(20) }, CALDAYS)).toBe('16 Oct – 20 Oct · 4 days');
  });

  it('shows hours on hour scales', () => {
    expect(readout({ start: oct(12, 8), end: oct(12, 14) }, HOUR, 'hour')).toBe('12 Oct 08:00 – 14:00 · 5 hours');
    expect(readout({ start: oct(12, 8), end: oct(13, 10) }, HOUR, 'hour')).toBe(
      '12 Oct 08:00 – 13 Oct 10:00 · 1.25 days',
    );
  });
});

describe('without a calendar: byte-identical to the calendar-day code', () => {
  const tasks = seededTasks(300);
  const calendarOff: [string, ResolvedGanttConfig][] = [
    ['exclusive', NONE],
    ['inclusive', INCLUSIVE],
  ];
  const oldDuration = (t: GanttTask, config: ResolvedGanttConfig): string => {
    const s = taskSpan(t, config);
    return durationLabel(s.start, s.end, DEFAULT_LABELS);
  };

  it.each(calendarOff)('taskDurationLabel and the Duration column (%s end)', (_, config) => {
    const ctx = ctxOf(config, tasks);
    const col = builtin('duration');
    for (const t of tasks) {
      expect(taskDurationLabel(t, config, DEFAULT_LABELS)).toBe(oldDuration(t, config));
      expect(col.render!(rowOf(t), ctx)).toBe(oldDuration(t, config));
      const s = taskSpan(t, config);
      expect(columnSortValue(col, rowOf(t), ctx)).toBe(calendarDays(s.end, false) - calendarDays(s.start, false));
    }
  });

  it.each(calendarOff)('the Variance column and baselineVarianceDays (%s end)', (_, config) => {
    const ctx = ctxOf(config, tasks);
    const col = builtin('variance');
    for (const t of tasks) {
      const expected = t.baseline
        ? Math.round(
            (calendarDays(taskSpan(t, config).end, false) - calendarDays(taskSpan(t.baseline, config).end, false)) * 10,
          ) / 10
        : null;
      expect(columnSortValue(col, rowOf(t), ctx)).toBe(expected);
      expect(baselineVarianceDays(t, config)).toBe(expected === null ? null : expected || 0);
    }
  });

  it.each(calendarOff)('the tooltip rows and the readout (%s end)', (_, config) => {
    for (const t of tasks.slice(0, 120)) {
      const m = buildTooltipModel({
        task: t,
        config: { ...config, baseline: true },
        labels: DEFAULT_LABELS,
        dateFormat: 'YYYY-MM-DD',
        now: NOW,
        floatDays: new Map([[t.id, 1.26]]),
      });
      expect(m.rows.find(r => r.kind === 'duration')?.value).toBe(oldDuration(t, config));
      expect(m.rows.find(r => r.kind === 'float')?.value).toBe('1.3d');
      const text = formatDragReadout(t, { labels: DEFAULT_LABELS, dates: config, unit: 'hour' });
      expect(text.endsWith(` · ${oldDuration(t, config)}`)).toBe(true);
    }
  });

  it('keeps every measure when the calendar only skips non-working time (durations: "calendar")', () => {
    const ctx = ctxOf(CALDAYS, tasks);
    const plain = ctxOf(NONE, tasks);
    for (const t of tasks.slice(0, 120)) {
      for (const key of ['duration', 'variance']) {
        const col = builtin(key);
        expect(col.render!(rowOf(t), ctx)).toBe(col.render!(rowOf(t), plain));
        expect(columnSortValue(col, rowOf(t), ctx)).toBe(columnSortValue(col, rowOf(t), plain));
      }
    }
  });

  it('formatFloat without a calendar is the days label rounded to 0.1', () => {
    for (const days of [0, 0.04, -0.04, 0.5, 1.26, 3, 12.345]) {
      expect(formatFloat(days, NONE)).toBe(DEFAULT_LABELS.ttFloatDays(Math.round(days * 10) / 10 || 0));
    }
  });
});

// ─── CSV ──────────────────────────────────────────────────────

describe('CSV export', () => {
  const PLAN: GanttTask[] = [
    task('a', oct(16), oct(20), { name: 'Fri to Tue', baseline: { start: oct(16), end: oct(16) } }),
    task('b', oct(19), oct(23), { name: 'Over the holiday' }),
    task('c', oct(12, 8), oct(13, 10), { name: 'Overnight' }),
    task('d', oct(14), oct(16, 12), { name: 'Half a day more' }),
  ];
  /** [duration, variance] by task name (the rows come out in start order) */
  const csv = (options: GanttOptions, values: 'data' | 'display' = 'data'): Record<string, string[]> =>
    Object.fromEntries(
      exportChartCsv(createExportSource({ tasks: PLAN, options, now: NOW }), {
        columns: ['name', 'duration', 'variance'],
        values,
      })
        .split('\r\n')
        .slice(1)
        .map(line => {
          const [name, ...rest] = line.split(',');
          return [name, rest];
        }),
    );

  it('writes calendar days without a calendar (data and display)', () => {
    expect(csv({})).toEqual({
      'Fri to Tue': ['4', '4'],
      'Over the holiday': ['4', ''],
      Overnight: ['1.08', ''],
      'Half a day more': ['2.5', ''],
    });
    expect(csv({}, 'display')).toEqual({
      'Fri to Tue': ['4 days', "'+4d"],
      'Over the holiday': ['4 days', ''],
      Overnight: ['2 days', ''],
      'Half a day more': ['3 days', ''],
    });
  });

  it('writes working days with a day calendar', () => {
    const options: GanttOptions = { calendar: true, nonWorkingTime: HOLIDAYS };
    expect(csv(options)).toEqual({
      'Fri to Tue': ['2', '2'],
      'Over the holiday': ['3', ''],
      Overnight: ['1.08', ''],
      'Half a day more': ['2.5', ''],
    });
    expect(csv(options, 'display')).toEqual({
      'Fri to Tue': ['2 days', "'+2d"],
      'Over the holiday': ['3 days', ''],
      Overnight: ['1.08 days', ''],
      'Half a day more': ['2.5 days', ''],
    });
  });

  it('writes days of `hoursPerDay` hours with an hour calendar, to at most 2 decimals', () => {
    const options: GanttOptions = {
      calendar: { unit: 'hour', hoursPerDay: 6 },
      nonWorkingTime: { ...HOLIDAYS, workingHours: LUNCH },
    };
    const data = csv(options);
    expect(data['Overnight'][0]).toBe('1.67'); // 10 working hours of 6
    expect(data['Fri to Tue']).toEqual(['2.67', '2.67']); // Friday and Monday: 16 working hours of 6
    expect(data['Over the holiday'][0]).toBe('4'); // Monday, Tuesday and Thursday: 24 hours of 6
    expect(csv(options, 'display')['Overnight'][0]).toBe('1.67 days');
  });

  it('keeps calendar days with `durations: "calendar"`', () => {
    expect(csv({ calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS })).toEqual(csv({}));
  });

  describe('predecessor lags', () => {
    const LINKED: GanttTask[] = [
      task('a', oct(12), oct(14), { name: 'First' }),
      task('b', oct(16), oct(20), { name: 'Later', dependency: [{ taskId: 'a', type: 'FS', lag: 1.5 }] }),
      task('c', oct(19), oct(22), {
        name: 'Third',
        dependency: [{ taskId: 'a', type: 'SS', lag: -0.5 }, { taskId: 'b' }],
      }),
    ];
    const lags = (options: GanttOptions, key: 'predecessors' | 'dependency'): Record<string, string> =>
      Object.fromEntries(
        exportChartCsv(createExportSource({ tasks: LINKED, options, now: NOW }), { columns: ['name', key] })
          .split('\r\n')
          .slice(1)
          .map(line => line.split(',') as [string, string]),
      );
    const hours = (hoursPerDay?: number): GanttOptions => ({
      calendar: { unit: 'hour', ...(hoursPerDay ? { hoursPerDay } : {}) },
      nonWorkingTime: { workingHours: LUNCH },
    });

    it('writes the lags in calendar units without a calendar', () => {
      for (const key of ['predecessors', 'dependency'] as const) {
        expect(lags({}, key)).toEqual({ First: '', Later: 'a FS+1.5d', Third: 'a SS-12h; b' });
      }
    });

    it('writes the lags in working days and hours with a working calendar', () => {
      for (const key of ['predecessors', 'dependency'] as const) {
        // A day calendar counts 24-hour days, as calendar time does
        expect(lags({ calendar: true }, key)).toEqual(lags({}, key));
        expect(lags(hours(), key)).toEqual({ First: '', Later: 'a FS+12h', Third: 'a SS-4h; b' });
        expect(lags(hours(6), key)).toEqual({ First: '', Later: 'a FS+9h', Third: 'a SS-3h; b' });
      }
    });

    it('keeps calendar units with `durations: "calendar"`', () => {
      const options: GanttOptions = { calendar: { durations: 'calendar', unit: 'hour' } };
      expect(lags(options, 'predecessors')).toEqual(lags({}, 'predecessors'));
      expect(lags(options, 'dependency')).toEqual(lags({}, 'dependency'));
    });
  });

  it('puts the chart’s calendar in the column context', () => {
    const source = createExportSource({ tasks: PLAN, options: { calendar: true, nonWorkingTime: HOLIDAYS }, now: NOW });
    expect(source.columnCtx.calendar).toBe(source.config.calendar);
    expect(source.columnCtx.calendar?.durations).toBe('working');
    expect(createExportSource({ tasks: PLAN, now: NOW }).columnCtx.calendar).toBeNull();
  });

  it('csvCellValue uses the context’s calendar', () => {
    const col = builtin('duration');
    expect(csvCellValue(col, rowOf(FRI_TUE), ctxOf(DAY), 'data')).toBe('2');
    expect(csvCellValue(col, rowOf(FRI_TUE), ctxOf(NONE), 'data')).toBe('4');
    expect(csvCellValue(col, rowOf(FRI_TUE), ctxOf(DAY), 'display')).toBe('2 days');
    expect(csvCellValue(builtin('variance'), rowOf(FRI_TUE), ctxOf(DAY), 'data')).toBe('');
  });

  it('writes nothing for dates that are not valid', () => {
    const bad = task('bad', new Date(NaN), oct(20));
    expect(csvCellValue(builtin('duration'), rowOf(bad), ctxOf(DAY), 'data')).toBe('');
    expect(csvCellValue(builtin('variance'), rowOf(bad), ctxOf(DAY), 'data')).toBe('');
  });

  it('shows the cell text of the same row as the Duration column', () => {
    const ctx = ctxOf(HOUR, [SIX_HOURS]);
    expect(computeCellVisual(builtin('duration'), rowOf(SIX_HOURS), ctx).text).toBe('5 hours');
  });
});

function oneHour(): GanttTask {
  return task('hour', oct(12, 9), oct(12, 10));
}
