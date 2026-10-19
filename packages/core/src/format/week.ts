// ─────────────────────────────────────────────────────────────
//  gantry · format/week.ts
//  Week numbers and week-years under a week-numbering rule (ISO,
//  US, locale, or any first day and minimal days), ISO-8601 week
//  and quarter — pure calendar arithmetic on the date's local
//  fields (no time math, no DST) — and the rules of `weekNumbering`.
// ─────────────────────────────────────────────────────────────

import type { WeekNumbering, WeekRule, WeekStart } from '../types';
import { MAX_CACHE_ENTRIES, resolveFormatLocale } from './locale';

/** Days before the first of each month in a common year. */
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

/** Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 1-based ordinal day of the year of a local calendar date (Jan 1 → 1, Dec 31 → 365/366). */
export function dayOfYear(date: Date): number {
  const m = date.getMonth();
  return (DAYS_BEFORE_MONTH[m] ?? 0) + date.getDate() + (m > 1 && isLeapYear(date.getFullYear()) ? 1 : 0);
}

// ─── Week-numbering rules ─────────────────────────────────────

/** ISO-8601: weeks start on Monday, week 1 holds 4 days of the new year (its first Thursday). */
export const ISO_WEEK: Readonly<WeekRule> = Object.freeze({ firstDay: 1, minimalDays: 4 });

/** US: weeks start on Sunday, week 1 holds January 1. */
export const US_WEEK: Readonly<WeekRule> = Object.freeze({ firstDay: 0, minimalDays: 1 });

/**
 * The day that decides the year of the `rule` week holding `date`: the week's first day plus
 * 7 − `minimalDays` (the ISO Thursday, the US Saturday). A week counts in the year that holds at
 * least `minimalDays` of its days, which is the year of this day, so week 1 is the week whose
 * anchor falls on January 1–7. Out-of-range rule fields are brought into range (first day modulo
 * 7, minimal days clamped to 1–7; non-numbers read as ISO's).
 */
function weekAnchor(date: Date, rule: WeekRule): Date {
  const first = Number.isFinite(rule.firstDay) ? ((Math.trunc(rule.firstDay) % 7) + 7) % 7 : ISO_WEEK.firstDay;
  const minimal = Number.isFinite(rule.minimalDays)
    ? Math.min(7, Math.max(1, Math.trunc(rule.minimalDays)))
    : ISO_WEEK.minimalDays;
  const t = new Date(date.getTime());
  // Noon keeps `setDate` clear of DST transitions; `setDate` (unlike `new Date(y, m, d)`)
  // also keeps years 0–99 as they are.
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() - ((t.getDay() - first + 7) % 7) + 7 - minimal);
  return t;
}

/**
 * Week number (1–53) of `date` under `rule`, as `Intl.Locale#getWeekInfo()` and CLDR define it:
 * weeks start on `rule.firstDay` and week 1 is the first one holding at least `rule.minimalDays`
 * days of the year. Days before it belong to the last week of the previous year, and the days of
 * the week that becomes week 1 of the next year count as week 1 (see `weekYear`): under `US_WEEK`
 * Monday 28 December 2026 is week 1 of 2027. `ISO_WEEK` gives `isoWeek`. Reads the local calendar
 * day; the time of day is ignored.
 */
export function weekOfYear(date: Date, rule: WeekRule): number {
  return Math.floor((dayOfYear(weekAnchor(date, rule)) - 1) / 7) + 1;
}

/**
 * The year the `rule` week holding `date` counts in (see `weekOfYear`); it differs from the
 * calendar year around January 1. `ISO_WEEK` gives `isoWeekYear`.
 */
export function weekYear(date: Date, rule: WeekRule): number {
  return weekAnchor(date, rule).getFullYear();
}

// ─── ISO-8601 week, quarter ───────────────────────────────────

/** ISO-8601 week number (1–53): weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): number {
  return weekOfYear(date, ISO_WEEK);
}

/** ISO-8601 week-numbering year (differs from the calendar year around Jan 1). */
export function isoWeekYear(date: Date): number {
  return weekYear(date, ISO_WEEK);
}

/** Calendar quarter, 1–4. */
export function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

// ─── Locale rules and the chart's week ────────────────────────

/** `Intl.Locale` week data: `getWeekInfo()` (current) or the `weekInfo` getter (older engines). */
interface LocaleWeekInfo {
  /** 1 = Monday … 7 = Sunday */
  firstDay?: number;
  minimalDays?: number;
}
interface LocaleWithWeekInfo {
  getWeekInfo?: () => LocaleWeekInfo | undefined;
  weekInfo?: LocaleWeekInfo | undefined;
}

/**
 * Regions whose week 1 needs 4 days of the new year (CLDR `weekData` `minDays`; every other region
 * uses 1). Engines that implement the current Intl Locale Info proposal no longer report
 * `minimalDays`, so it is read from here.
 */
const MIN_DAYS_4_REGIONS: ReadonlySet<string> = new Set(
  'AD AN AT AX BE BG CH CZ DE DK EE ES FI FJ FO FR GB GF GG GI GP GR HU IE IM IS IT JE LI LT LU MC MQ NL NO PL PT RE RU SE SJ SK SM VA'.split(
    ' ',
  ),
);

const weekRuleCache = new Map<string, Readonly<WeekRule>>();

/**
 * The week rule of a locale (`resolveFormatLocale`: missing or invalid tags read as `'en'`): the
 * first day from `Intl.Locale#getWeekInfo()` / `weekInfo` with Sunday as 0, the minimal days from
 * the same data or, when the engine leaves them out, from the locale's region (CLDR). `ISO_WEEK`
 * where the runtime has no week data or reports values out of range.
 */
export function localeWeekRule(locale?: string): Readonly<WeekRule> {
  const tag = resolveFormatLocale(locale);
  const cached = weekRuleCache.get(tag);
  if (cached) return cached;
  let rule: Readonly<WeekRule> = ISO_WEEK;
  try {
    const loc = new Intl.Locale(tag) as Intl.Locale & LocaleWithWeekInfo;
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    const first = info?.firstDay;
    const region = info?.minimalDays === undefined ? loc.maximize().region : undefined;
    const minimal = info?.minimalDays ?? (region !== undefined && MIN_DAYS_4_REGIONS.has(region) ? 4 : 1);
    if (typeof first === 'number' && first >= 1 && first <= 7 && minimal >= 1 && minimal <= 7) {
      rule = Object.freeze({ firstDay: first % 7, minimalDays: minimal });
    }
  } catch {
    // No Intl.Locale or no week data for the tag: ISO
  }
  if (weekRuleCache.size >= MAX_CACHE_ENTRIES) weekRuleCache.clear();
  weekRuleCache.set(tag, rule);
  return rule;
}

/** A first day the timeline supports (0, 1 or 6); any other maps to Monday. */
const toWeekStart = (day: number): WeekStart => (day === 0 || day === 6 ? day : 1);

/**
 * The chart's week: the first day of its week cells (`start`) and the rule its week numbers follow.
 * `numbering` gives the rule (`'iso'`, `'us'`, `'locale'`); unset, it is `'us'` when `weekStart`
 * is 0 and `'iso'` otherwise, which keeps the output of charts that set neither. `weekStart`
 * overrides the rule's first day; a locale first day other than Sunday, Monday or Saturday maps
 * to Monday. The rule's `firstDay` is always `start`.
 */
export function resolveWeek(
  numbering: WeekNumbering | undefined,
  weekStart: WeekStart | undefined,
  locale?: string,
): { start: WeekStart; rule: Readonly<WeekRule> } {
  const kind = numbering ?? (weekStart === 0 ? 'us' : 'iso');
  const base = kind === 'us' ? US_WEEK : kind === 'locale' ? localeWeekRule(locale) : ISO_WEEK;
  const start = weekStart ?? toWeekStart(base.firstDay);
  const rule = start === base.firstDay ? base : Object.freeze({ firstDay: start, minimalDays: base.minimalDays });
  return { start, rule };
}
