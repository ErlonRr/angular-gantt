import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@gantryjs/core';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  controlEnabled,
  decodeState,
  encodeState,
  playgroundCode,
  playgroundOptions,
  withValue,
  type PlaygroundKey,
  type PlaygroundState,
} from '../playground';
import { FRAMEWORKS } from '../site';

const TODAY = new Date(2026, 9, 14);
const SECTION = PLAYGROUND_SECTIONS.find(s => s.title === 'Working calendar');
const DAYS: PlaygroundState = { ...PLAYGROUND_DEFAULTS, calendar: 'days' };
const HOURS: PlaygroundState = { ...PLAYGROUND_DEFAULTS, calendar: 'hours' };
/** Every Working calendar control away from its default. */
const CHANGED: PlaygroundState = {
  ...HOURS,
  calendarDurations: 'calendar',
  skipNonWorking: false,
  hoursPerDay: 6,
};
const SUB_KEYS: PlaygroundKey[] = ['calendarDurations', 'skipNonWorking', 'hoursPerDay'];
const control = (key: PlaygroundKey) => PLAYGROUND_SECTIONS.flatMap(s => s.controls).find(c => c.key === key)!;
const calendarOf = (s: PlaygroundState) => playgroundOptions(s, TODAY).calendar;

describe('playground: Working calendar section', () => {
  it('follows Non-working time with the switch, then one control per field', () => {
    const titles = PLAYGROUND_SECTIONS.map(s => s.title);
    expect(titles.indexOf('Working calendar')).toBe(titles.indexOf('Non-working time') + 1);
    expect(SECTION?.controls.map(c => [c.key, c.kind, c.option])).toEqual([
      ['calendar', 'segmented', 'calendar'],
      ['calendarDurations', 'segmented', 'calendar.durations'],
      ['skipNonWorking', 'check', 'calendar.skipNonWorking'],
      ['hoursPerDay', 'range', 'calendar.hoursPerDay'],
    ]);
    const calendar = control('calendar');
    expect(calendar.kind === 'segmented' && calendar.choices).toEqual([
      ['off', 'Off'],
      ['days', 'Days'],
      ['hours', 'Hours'],
    ]);
    expect(calendar.hint).toContain('1.x columns (Columns → Panel)');
    const durations = control('calendarDurations');
    expect(durations.kind === 'segmented' && durations.choices).toEqual([
      ['working', 'Working'],
      ['calendar', 'Calendar'],
    ]);
    const hours = control('hoursPerDay');
    expect(hours.kind === 'range' && [hours.min, hours.max, hours.step, hours.unit]).toEqual([4, 12, 0.5, 'h']);
  });

  it('adds None to the non-working Style select', () => {
    const style = control('nwStyle');
    expect(style.kind === 'select' && style.choices.map(([value]) => value)).toEqual([
      'shade',
      'hatch',
      'disabled',
      'none',
    ]);
    expect(style.kind === 'select' && style.choices.at(-1)).toEqual(['none', 'None']);
  });

  it('starts from the core defaults: off, and working days that skip non-working time with 8-hour days once on', () => {
    expect(PLAYGROUND_DEFAULTS.calendar).toBe('off');
    expect(resolveConfig(playgroundOptions(PLAYGROUND_DEFAULTS, TODAY)).calendar).toBeNull();
    const core = resolveConfig({ calendar: true }).calendar!;
    expect(PLAYGROUND_DEFAULTS.calendarDurations).toBe(core.durations);
    expect(PLAYGROUND_DEFAULTS.skipNonWorking).toBe(core.skipNonWorking);
    expect(PLAYGROUND_DEFAULTS.hoursPerDay).toBe(core.hoursPerDay);
    // Every default fits its control
    for (const c of SECTION?.controls ?? []) {
      expect(withValue(CHANGED, c.key, PLAYGROUND_DEFAULTS[c.key])[c.key], c.key).toBe(PLAYGROUND_DEFAULTS[c.key]);
    }
  });

  it('disables the fields while the calendar is off, the hours per day outside Hours', () => {
    expect(controlEnabled(control('calendar'), PLAYGROUND_DEFAULTS)).toBe(true);
    for (const key of SUB_KEYS) expect(controlEnabled(control(key), PLAYGROUND_DEFAULTS), `off ${key}`).toBe(false);
    for (const key of ['calendarDurations', 'skipNonWorking'] as const) {
      expect(controlEnabled(control(key), DAYS), `days ${key}`).toBe(true);
      expect(controlEnabled(control(key), HOURS), `hours ${key}`).toBe(true);
    }
    expect(controlEnabled(control('hoursPerDay'), DAYS)).toBe(false);
    expect(controlEnabled(control('hoursPerDay'), HOURS)).toBe(true);
    // The style select keeps applying with the calendar on or off
    expect(controlEnabled(control('nwStyle'), PLAYGROUND_DEFAULTS)).toBe(true);
    expect(controlEnabled(control('nwStyle'), HOURS)).toBe(true);
  });

  it('maps each choice to `calendar`: nothing while off, `true` at the defaults, else the changed fields', () => {
    expect(calendarOf(PLAYGROUND_DEFAULTS)).toBeUndefined();
    // Off leaves everything out, whatever the other fields hold
    expect(calendarOf({ ...CHANGED, calendar: 'off' })).toBeUndefined();
    expect(calendarOf(DAYS)).toBe(true);
    expect(calendarOf({ ...DAYS, calendarDurations: 'calendar' })).toEqual({ durations: 'calendar' });
    expect(calendarOf({ ...DAYS, skipNonWorking: false })).toEqual({ skipNonWorking: false });
    // The hours per day count only in Hours
    expect(calendarOf({ ...DAYS, hoursPerDay: 6 })).toBe(true);
    expect(calendarOf(HOURS)).toEqual({ unit: 'hour' });
    expect(calendarOf({ ...HOURS, hoursPerDay: 7.5 })).toEqual({ unit: 'hour', hoursPerDay: 7.5 });
    expect(calendarOf(CHANGED)).toEqual({
      unit: 'hour',
      durations: 'calendar',
      skipNonWorking: false,
      hoursPerDay: 6,
    });
  });

  it('resolves through core with the playground non-working options', () => {
    const days = resolveConfig(playgroundOptions(DAYS, TODAY)).calendar;
    expect(days).toMatchObject({
      durations: 'working',
      unit: 'day',
      skipNonWorking: true,
      hoursPerDay: 8,
      daysPerWeek: 5,
    });
    const hours = resolveConfig(playgroundOptions({ ...HOURS, hoursPerDay: 6 }, TODAY)).calendar;
    expect(hours).toMatchObject({ durations: 'working', unit: 'hour', skipNonWorking: true, hoursPerDay: 6 });
    // The playground's own working hours (9–18) are the calendar's hours
    const config = resolveConfig(playgroundOptions(HOURS, TODAY));
    expect(config.nonWorking?.workingHours?.(1)).toEqual([{ start: 9, end: 18 }]);
    expect(config.calendar?.working.hoursOn(1)).toBe(9);
    expect(config.calendar?.working.hoursOn(0)).toBe(0);
    // Weekends off the list: every weekday works
    expect(resolveConfig(playgroundOptions({ ...DAYS, weekends: false }, TODAY)).calendar?.daysPerWeek).toBe(7);
    const other = resolveConfig(playgroundOptions({ ...CHANGED, calendar: 'days' }, TODAY)).calendar;
    expect(other).toMatchObject({ durations: 'calendar', unit: 'day', skipNonWorking: false });
  });

  it('keeps the calendar when the shading style is None', () => {
    expect(playgroundOptions({ ...DAYS, nwStyle: 'none' }, TODAY).nonWorkingTime).toMatchObject({ style: 'none' });
    const config = resolveConfig(playgroundOptions({ ...DAYS, nwStyle: 'none' }, TODAY));
    expect(config.nonWorking?.style).toBe('none');
    expect(config.calendar).toMatchObject({ durations: 'working', unit: 'day' });
    expect(resolveConfig(playgroundOptions({ ...PLAYGROUND_DEFAULTS, nwStyle: 'none' }, TODAY)).calendar).toBeNull();
  });

  it('round-trips through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toEqual(['calendar', 'calendarDurations', 'skipNonWorking', 'hoursPerDay']);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    expect(decodeState(encodeState({ ...PLAYGROUND_DEFAULTS, nwStyle: 'none' })).nwStyle).toBe('none');
    const forged = btoa(
      JSON.stringify({
        calendar: 'weeks',
        calendarDurations: 'both',
        skipNonWorking: 'yes',
        hoursPerDay: 3,
      }),
    );
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
    expect(decodeState(btoa(JSON.stringify({ hoursPerDay: 13 }))).hoursPerDay).toBe(8);
    expect(decodeState(btoa(JSON.stringify({ hoursPerDay: 4.5 }))).hoursPerDay).toBe(4.5);
  });

  it('prints `calendar` only once it is on, then only the changed fields, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      expect(playgroundCode(PLAYGROUND_DEFAULTS, id, TODAY), id).not.toMatch(/\bcalendar:/);
      expect(playgroundCode({ ...CHANGED, calendar: 'off' }, id, TODAY), id).not.toMatch(/\bcalendar:/);
      expect(playgroundCode(DAYS, id, TODAY), id).toContain('calendar: true');
      expect(playgroundCode({ ...DAYS, hoursPerDay: 6 }, id, TODAY), id).toContain('calendar: true');
      expect(playgroundCode(HOURS, id, TODAY), id).toContain("calendar: { unit: 'hour' }");
      expect(playgroundCode({ ...DAYS, calendarDurations: 'calendar' }, id, TODAY), id).toContain(
        "calendar: { durations: 'calendar' }",
      );
      expect(playgroundCode({ ...DAYS, skipNonWorking: false }, id, TODAY), id).toContain(
        'calendar: { skipNonWorking: false }',
      );
      const code = playgroundCode(CHANGED, id, TODAY);
      expect(code, id).toMatch(
        /calendar: \{[\s\S]*unit: 'hour'[\s\S]*durations: 'calendar'[\s\S]*skipNonWorking: false[\s\S]*hoursPerDay: 6/,
      );
      expect(code, id).not.toContain('undefined');
      expect(playgroundCode({ ...PLAYGROUND_DEFAULTS, nwStyle: 'none' }, id, TODAY), id).toContain("style: 'none'");
    }
  });
});
