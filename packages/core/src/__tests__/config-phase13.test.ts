// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 contract (step 1.0): the `calendar` option and its
//  resolved defaults, the default working hours of an hour calendar,
//  `nonWorkingTime.style: 'none'`, the calendar key and the date-reading
//  cut-off, degenerate weeks, `createWorkingCalendar`, the new labels,
//  and the calendar modules at the package root. `calendar` unset keeps
//  the resolved config of Phase 12 (D18).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import * as core from '../index';
import {
  DEFAULT_HOURS_PER_DAY,
  DEFAULT_LABELS,
  DEFAULT_WORKING_HOURS,
  createWorkingCalendar,
  dateReadingOf,
  resolveCalendar,
  resolveConfig,
  resolveNonWorking,
  sameDateReading,
  type DateReading,
  type GanttCalendarOptions,
  type GanttCalendarUnit,
  type GanttDurationMode,
  type GanttOptions,
  type GanttValidateContext,
  type ResolvedCalendar,
  type WorkingCalendar,
} from '../index';

const keyOf = (options: GanttOptions): string | null => resolveConfig(options).calendar?.key ?? null;

describe('calendar: defaults (D2, D18)', () => {
  it('is off unless set: `calendar: null` and the Phase 12 non-working time', () => {
    const cfg = resolveConfig({});
    expect(cfg.calendar).toBeNull();
    expect(resolveConfig({ calendar: false }).calendar).toBeNull();
    expect(resolveConfig({ calendar: undefined }).calendar).toBeNull();
    const nw = cfg.nonWorking!;
    expect([...nw.weekends].sort()).toEqual([0, 6]);
    expect(nw.workingHours).toBeNull();
    expect(nw.holidays).toEqual([]);
    expect(nw.style).toBe('shade');
    expect(nw.showInHeader).toBe(true);
    expect(nw.minPxPerDay).toBe(12);
    expect(resolveConfig({ nonWorkingTime: false }).nonWorking).toBeNull();
  });

  it('resolves `true` as `{}`: working days, skipping, 8 hours a day, Mon–Fri', () => {
    const cal = resolveConfig({ calendar: true }).calendar!;
    expect(cal).toMatchObject({
      durations: 'working',
      unit: 'day',
      skipNonWorking: true,
      hoursPerDay: DEFAULT_HOURS_PER_DAY,
      daysPerWeek: 5,
    });
    expect(DEFAULT_HOURS_PER_DAY).toBe(8);
    expect(cal.working.unit).toBe('day');
    expect(typeof cal.key).toBe('string');
    expect(resolveConfig({ calendar: {} }).calendar).toMatchObject({ durations: 'working', unit: 'day' });
  });

  it('keeps set fields and reads unknown values as the defaults', () => {
    const cal = resolveConfig({
      calendar: { durations: 'calendar', unit: 'hour', skipNonWorking: false, hoursPerDay: 7.5 },
    }).calendar!;
    expect(cal).toMatchObject({ durations: 'calendar', unit: 'hour', skipNonWorking: false, hoursPerDay: 7.5 });
    const loose = { durations: 'elapsed', unit: 'minute' } as unknown as GanttCalendarOptions;
    expect(resolveConfig({ calendar: loose }).calendar).toMatchObject({ durations: 'working', unit: 'day' });
    // Only `false` turns skipping off
    const skip = { skipNonWorking: 0 } as unknown as GanttCalendarOptions;
    expect(resolveConfig({ calendar: skip }).calendar!.skipNonWorking).toBe(true);
    // Truthy non-objects (untyped callers) leave it off
    expect(resolveConfig({ calendar: 'yes' as unknown as boolean }).calendar).toBeNull();
  });

  it('accepts hoursPerDay in (0, 24], else 8', () => {
    const hpd = (n: unknown) => resolveConfig({ calendar: { hoursPerDay: n as number } }).calendar!.hoursPerDay;
    expect(hpd(24)).toBe(24);
    expect(hpd(0.5)).toBe(0.5);
    expect(hpd(6)).toBe(6);
    for (const bad of [0, -1, 24.5, NaN, Infinity, '8', null]) expect(hpd(bad)).toBe(8);
  });
});

describe('calendar: working hours (D4)', () => {
  it('injects 09:00–17:00 only for an hour calendar without its own hours', () => {
    expect(DEFAULT_WORKING_HOURS).toEqual([{ start: 9, end: 17 }]);
    expect(Object.isFrozen(DEFAULT_WORKING_HOURS)).toBe(true);
    const hour = resolveConfig({ calendar: { unit: 'hour' } });
    expect(hour.nonWorking!.workingHours!(1)).toEqual([{ start: 9, end: 17 }]);
    expect(hour.nonWorking!.workingHours!(6)).toEqual([{ start: 9, end: 17 }]);
    expect(hour.calendar!.working.hoursOn(1)).toBe(8);
    expect(hour.calendar!.working.hoursOn(0)).toBe(0);

    // A day calendar, no calendar, or hours of its own: unchanged
    expect(resolveConfig({ calendar: true }).nonWorking!.workingHours).toBeNull();
    expect(resolveConfig({ calendar: { unit: 'day' } }).nonWorking!.workingHours).toBeNull();
    const own = resolveConfig({
      calendar: { unit: 'hour' },
      nonWorkingTime: { workingHours: [{ start: 8, end: 12 }] },
    });
    expect(own.nonWorking!.workingHours!(2)).toEqual([{ start: 8, end: 12 }]);
    expect(own.calendar!.working.hoursOn(2)).toBe(4);
  });

  it('keeps an empty hours list as no working hours (a degenerate week)', () => {
    const cfg = resolveConfig({ calendar: { unit: 'hour' }, nonWorkingTime: { workingHours: [] } });
    expect(cfg.nonWorking!.workingHours!(1)).toEqual([]);
    expect(cfg.calendar).toBeNull();
  });

  it('`resolveNonWorking` takes the default hours as a second argument', () => {
    expect(resolveNonWorking(undefined)!.workingHours).toBeNull();
    expect(resolveNonWorking(undefined, null)!.workingHours).toBeNull();
    expect(resolveNonWorking({}, DEFAULT_WORKING_HOURS)!.workingHours!(3)).toEqual([{ start: 9, end: 17 }]);
    expect(resolveNonWorking({ workingHours: { start: 7, end: 15 } }, DEFAULT_WORKING_HOURS)!.workingHours!(3)).toEqual(
      [{ start: 7, end: 15 }],
    );
    expect(resolveNonWorking(false, DEFAULT_WORKING_HOURS)).toBeNull();
  });

  it('with `nonWorkingTime: false` every day works, every hour with `unit: hour`', () => {
    const day = resolveConfig({ calendar: true, nonWorkingTime: false }).calendar!;
    expect(day.daysPerWeek).toBe(7);
    const hour = resolveConfig({ calendar: { unit: 'hour' }, nonWorkingTime: false }).calendar!;
    expect(hour.daysPerWeek).toBe(7);
    expect(hour.working.hoursOn(0)).toBe(24);
    expect(hour.working.hoursOn(3)).toBe(24);
  });
});

describe('nonWorkingTime.style', () => {
  it("resolves 'none' and reads unknown values as 'shade'", () => {
    expect(resolveConfig({ nonWorkingTime: { style: 'none' } }).nonWorking!.style).toBe('none');
    for (const style of ['shade', 'hatch', 'disabled'] as const) {
      expect(resolveConfig({ nonWorkingTime: { style } }).nonWorking!.style).toBe(style);
    }
    const odd = { style: 'stripes' } as unknown as GanttOptions['nonWorkingTime'];
    expect(resolveConfig({ nonWorkingTime: odd }).nonWorking!.style).toBe('shade');
  });

  it("keeps the calendar's working time with 'none'", () => {
    const cal = resolveConfig({ calendar: true, nonWorkingTime: { style: 'none' } }).calendar!;
    expect(cal.daysPerWeek).toBe(5);
    expect(cal.key).toBe(keyOf({ calendar: true }));
  });
});

describe('calendar: degenerate weeks (D3)', () => {
  it('turns the calendar off when no weekday has working time', () => {
    expect(keyOf({ calendar: true, nonWorkingTime: { weekends: [0, 1, 2, 3, 4, 5, 6] } })).toBeNull();
    expect(keyOf({ calendar: { unit: 'hour' }, nonWorkingTime: { workingHours: { start: 9, end: 9 } } })).toBeNull();
    expect(keyOf({ calendar: { unit: 'hour' }, nonWorkingTime: { workingHours: {} } })).toBeNull();
    // Hours only on the weekend days
    expect(
      keyOf({ calendar: { unit: 'hour' }, nonWorkingTime: { workingHours: { 0: [{ start: 9, end: 12 }] } } }),
    ).toBeNull();
  });

  it('counts the weekdays with working time (`daysPerWeek`)', () => {
    expect(resolveConfig({ calendar: true, nonWorkingTime: { weekends: [0] } }).calendar!.daysPerWeek).toBe(6);
    expect(resolveConfig({ calendar: true, nonWorkingTime: { weekends: false } }).calendar!.daysPerWeek).toBe(7);
    const map = { 1: [{ start: 8, end: 12 }], 2: [{ start: 8, end: 12 }], 5: [{ start: 8, end: 12 }] };
    expect(
      resolveConfig({ calendar: { unit: 'hour' }, nonWorkingTime: { workingHours: map } }).calendar!.daysPerWeek,
    ).toBe(3);
    // A day calendar ignores the hours: every weekday that isn't a weekend works
    expect(resolveConfig({ calendar: true, nonWorkingTime: { workingHours: map } }).calendar!.daysPerWeek).toBe(5);
  });
});

describe('calendar: key and date reading (D20)', () => {
  const holiday = new Date(2026, 9, 21);

  it('is stable for equal options and changes with every measure', () => {
    const base: GanttOptions = { calendar: true, nonWorkingTime: { holidays: [holiday] } };
    const key = keyOf(base)!;
    expect(keyOf({ calendar: {}, nonWorkingTime: { holidays: [new Date(2026, 9, 21)] } })).toBe(key);
    const variants: GanttOptions[] = [
      { ...base, calendar: { durations: 'calendar' } },
      { ...base, calendar: { skipNonWorking: false } },
      { ...base, calendar: { unit: 'hour' } },
      { ...base, nonWorkingTime: { holidays: [new Date(2026, 9, 22)] } },
      { ...base, nonWorkingTime: { holidays: [holiday], weekends: [0] } },
      { calendar: true },
    ];
    const keys = variants.map(keyOf);
    for (const k of keys) expect(k).not.toBe(key);
    expect(new Set(keys).size).toBe(keys.length);
    // Hours per day and the hours of an hour calendar
    const hour: GanttOptions = { calendar: { unit: 'hour' } };
    expect(keyOf({ calendar: { unit: 'hour', hoursPerDay: 6 } })).not.toBe(keyOf(hour));
    expect(keyOf({ ...hour, nonWorkingTime: { workingHours: { start: 8, end: 16 } } })).not.toBe(keyOf(hour));
  });

  it('ignores what does not change a measure', () => {
    const key = keyOf({ calendar: true, nonWorkingTime: { holidays: [holiday] } });
    expect(
      keyOf({
        calendar: true,
        labels: { durationDay: '1 Tag' },
        viewMode: 'Month',
        nonWorkingTime: { holidays: [{ start: holiday, label: 'Founders’ day', color: '#c00' }], style: 'hatch' },
      }),
    ).toBe(key);
    // A holiday on a weekend changes nothing (D30), and overlapping holidays count once
    expect(keyOf({ calendar: true, nonWorkingTime: { holidays: [new Date(2026, 9, 17)] } })).toBe(
      keyOf({ calendar: true }),
    );
    expect(
      keyOf({
        calendar: true,
        nonWorkingTime: { holidays: [holiday, { start: new Date(2026, 9, 20), end: holiday }] },
      }),
    ).toBe(keyOf({ calendar: true, nonWorkingTime: { holidays: [{ start: new Date(2026, 9, 20), end: holiday }] } }));
    // A day calendar ignores working hours
    expect(keyOf({ calendar: true, nonWorkingTime: { workingHours: { start: 8, end: 12 } } })).toBe(
      keyOf({ calendar: true }),
    );
    // Overlapping and touching hour ranges merge
    expect(
      keyOf({
        calendar: { unit: 'hour' },
        nonWorkingTime: {
          workingHours: [
            { start: 13, end: 17 },
            { start: 8, end: 12 },
            { start: 11, end: 13 },
          ],
        },
      }),
    ).toBe(keyOf({ calendar: { unit: 'hour' }, nonWorkingTime: { workingHours: { start: 8, end: 17 } } }));
  });

  it('`dateReadingOf` keeps the three reading fields', () => {
    const cfg = resolveConfig({ calendar: true, endDateMode: 'inclusive' });
    expect(dateReadingOf(cfg)).toEqual({ endDateMode: 'inclusive', normalizeDateOnly: true, calendar: cfg.calendar });
    expect(dateReadingOf({ endDateMode: 'exclusive', normalizeDateOnly: false })).toEqual({
      endDateMode: 'exclusive',
      normalizeDateOnly: false,
      calendar: null,
    });
  });

  it('`sameDateReading` compares the modes and the calendar keys', () => {
    const a = resolveConfig({ calendar: true, viewMode: 'Day' });
    const b = resolveConfig({ calendar: true, viewMode: 'Month', labels: { ttStart: 'Inizio' } });
    expect(a.calendar).not.toBe(b.calendar);
    expect(sameDateReading(a, b)).toBe(true);
    expect(sameDateReading(a, a)).toBe(true);
    expect(sameDateReading(dateReadingOf(a), b)).toBe(true);
    const off = resolveConfig({});
    expect(sameDateReading(off, { endDateMode: 'exclusive', normalizeDateOnly: true })).toBe(true);
    expect(sameDateReading(off, { endDateMode: 'exclusive', normalizeDateOnly: true, calendar: undefined })).toBe(true);
    expect(sameDateReading(off, a)).toBe(false);
    expect(sameDateReading(off, resolveConfig({ endDateMode: 'inclusive' }))).toBe(false);
    expect(sameDateReading(off, resolveConfig({ normalizeDateOnly: false }))).toBe(false);
    expect(sameDateReading(a, resolveConfig({ calendar: { durations: 'calendar' } }))).toBe(false);
  });
});

describe('createWorkingCalendar', () => {
  it('reads an unset calendar as `true` and resolves like the chart', () => {
    const cal = createWorkingCalendar()!;
    expect(cal.unit).toBe('day');
    expect(cal.hoursOn(1)).toBe(24);
    expect(cal.hoursOn(6)).toBe(0);
    expect(createWorkingCalendar({ calendar: false })!.unit).toBe('day');
    const hour = createWorkingCalendar({ calendar: { unit: 'hour' } })!;
    expect(hour.hoursOn(1)).toBe(8);
    expect(hour.addWorking(new Date(2026, 9, 12, 9), 8)).toEqual(new Date(2026, 9, 12, 17));
    expect(createWorkingCalendar({ nonWorkingTime: false })!.hoursOn(0)).toBe(24);
    expect(createWorkingCalendar({ nonWorkingTime: { weekends: [0, 1, 2, 3, 4, 5, 6] } })).toBeNull();
  });

  it('counts the holidays of `nonWorkingTime`', () => {
    const cal = createWorkingCalendar({ nonWorkingTime: { holidays: [new Date(2026, 11, 25)] } })!;
    // Thursday 24 Dec + 1 working day ends after it; Friday is the holiday
    expect(cal.addWorking(new Date(2026, 11, 24), 1)).toEqual(new Date(2026, 11, 25));
    expect(cal.addWorking(new Date(2026, 11, 24), 2)).toEqual(new Date(2026, 11, 29));
    expect(cal.isWorkingDay(new Date(2026, 11, 25))).toBe(false);
  });
});

describe('labels: Phase 13', () => {
  it('adds `durationHours` and `ttFloatHours`', () => {
    expect(DEFAULT_LABELS.durationHours(1)).toBe('1 hour');
    expect(DEFAULT_LABELS.durationHours(6)).toBe('6 hours');
    expect(DEFAULT_LABELS.durationHours(7.5)).toBe('7.5 hours');
    expect(DEFAULT_LABELS.ttFloatHours(4)).toBe('4h');
    expect(DEFAULT_LABELS.ttFloatHours(2.5)).toBe('2.5h');
  });
});

describe('types and package root', () => {
  it('exports the calendar API', () => {
    for (const name of [
      'DEFAULT_HOURS_PER_DAY',
      'DEFAULT_WORKING_HOURS',
      'resolveCalendar',
      'createWorkingCalendar',
      'dateReadingOf',
      'sameDateReading',
      'buildWorkingCalendar',
      'measuresWorkingTime',
      'durationFactor',
      'measureBetween',
      'spanDuration',
      'taskDuration',
      'addDayAmount',
      'addDuration',
      'formatDuration',
      'formatFloat',
      'taskDateLike',
      'snapTaskStart',
      'snapTaskEnd',
      'followTaskEnd',
      'editCalendar',
    ]) {
      expect(core, name).toHaveProperty(name);
    }
    // Internal helpers stay out of the root
    expect(core).not.toHaveProperty('workingTimeKey');
    expect(core).not.toHaveProperty('mergeHourRanges');
  });

  it('types the option, the resolved calendar and the contexts', () => {
    expectTypeOf<GanttOptions['calendar']>().toEqualTypeOf<boolean | GanttCalendarOptions | undefined>();
    expectTypeOf<GanttCalendarOptions['durations']>().toEqualTypeOf<GanttDurationMode | undefined>();
    expectTypeOf<GanttCalendarOptions['unit']>().toEqualTypeOf<GanttCalendarUnit | undefined>();
    expectTypeOf<core.ResolvedGanttConfig['calendar']>().toEqualTypeOf<ResolvedCalendar | null>();
    expectTypeOf<core.ResolvedNonWorking['style']>().toEqualTypeOf<'shade' | 'hatch' | 'disabled' | 'none'>();
    expectTypeOf<GanttValidateContext['calendar']>().toEqualTypeOf<WorkingCalendar | null | undefined>();
    expectTypeOf<core.ColumnContext>().toExtend<DateReading>();
    expectTypeOf<core.ResolvedGanttConfig>().toExtend<DateReading>();
    expectTypeOf<core.DragTiming['dates']>().toEqualTypeOf<DateReading | undefined>();
    expectTypeOf<core.DragTiming['calendar']>().toEqualTypeOf<core.EditCalendar | null | undefined>();
    expectTypeOf(resolveCalendar).parameters.toEqualTypeOf<
      [GanttOptions['calendar'], core.ResolvedNonWorking | null]
    >();
  });
});
