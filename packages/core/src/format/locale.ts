// ─────────────────────────────────────────────────────────────
//  gantry · format/locale.ts
//  Locale resolution and month / weekday / day-period names from
//  Intl.DateTimeFormat, cached per locale and name kind.
//  Deterministic: the default locale is 'en', never the runtime's.
// ─────────────────────────────────────────────────────────────

/** Locale used when none is given or the given one is invalid or unsupported. */
export const DEFAULT_FORMAT_LOCALE = 'en';

/** The name tables `formatDate` reads. */
export type DateNameKind =
  | 'monthsLong'
  | 'monthsLongFormat'
  | 'monthsShort'
  | 'monthsShortFormat'
  | 'weekdaysLong'
  | 'weekdaysShort'
  | 'weekdaysMin'
  | 'meridiem';

/** Cap of every cache keyed by caller-supplied strings (same as the compiled-format cache). */
export const MAX_CACHE_ENTRIES = 500;

const localeCache = new Map<string, string>();

/**
 * Canonical BCP 47 tag for `locale` (`'it'`, `'pt-br'` → `'pt-BR'`), or `'en'` when it is
 * missing, malformed (`Intl.getCanonicalLocales` throws) or has no Intl date data in this
 * runtime — so the result never depends on the host's default locale.
 */
export function resolveFormatLocale(locale?: string): string {
  if (!locale) return DEFAULT_FORMAT_LOCALE;
  const cached = localeCache.get(locale);
  if (cached !== undefined) return cached;
  let resolved = DEFAULT_FORMAT_LOCALE;
  try {
    const canonical = Intl.getCanonicalLocales(locale)[0];
    if (canonical && Intl.DateTimeFormat.supportedLocalesOf([canonical]).length > 0) resolved = canonical;
  } catch {
    // RangeError: not a well-formed language tag → default locale
  }
  if (localeCache.size >= MAX_CACHE_ENTRIES) localeCache.clear();
  localeCache.set(locale, resolved);
  return resolved;
}

// Reference instants, read in UTC so the names never depend on the host time zone.
const monthRef = (m: number) => new Date(Date.UTC(2021, m, 15, 12));
/** 2021-01-03 was a Sunday: index 0 = Sunday, as `Date#getDay()`. */
const weekdayRef = (w: number) => new Date(Date.UTC(2021, 0, 3 + w, 12));

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** One cached Intl.DateTimeFormat per locale + option set (Gregorian calendar, UTC). */
function formatter(locale: string, key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `${locale}|${key}`;
  let f = formatterCache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, calendar: 'gregory', timeZone: 'UTC' });
    formatterCache.set(id, f);
  }
  return f;
}

const part = (f: Intl.DateTimeFormat, d: Date, type: Intl.DateTimeFormatPartTypes): string | undefined =>
  f.formatToParts(d).find(p => p.type === type)?.value;

/** Intl puts (narrow) no-break spaces in some names ("a. m."), with ICU-version-dependent choice: use plain spaces. */
const normalizeSpaces = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * Format-context month names (the month as written next to a day number): genitive in e.g.
 * ru / pl ("1 января", "5 мар."). A context name that is only a prefix plus the stand-alone
 * name (ca "de gener", "d’abr.") and a numeric one (ja "1月1日" → "1") give the stand-alone
 * name, so `D [de] MMMM` stays idiomatic.
 */
function formatContextMonths(locale: string, width: 'long' | 'short', standalone: readonly string[]): string[] {
  const f = formatter(locale, `DM-${width}`, { day: 'numeric', month: width });
  return range(12).map(m => {
    const alone = standalone[m] ?? '';
    const raw = part(f, monthRef(m), 'month');
    if (!raw || !/\p{L}/u.test(raw)) return alone;
    const name = normalizeSpaces(raw);
    return name !== alone && name.endsWith(alone) ? alone : name;
  });
}

/** True when `list` holds `n` distinct, non-empty names. */
const distinct = (list: readonly string[], n: number) => list.every(s => s !== '') && new Set(list).size === n;

/**
 * `dd` names: the first two graphemes of the short name without its abbreviation dot ("Su",
 * "lu", "So", "di", 日 — as dayjs derives them), unless that makes two days alike (ar / he
 * short names share a prefix); then Intl's narrow names (he "א׳", ar "ح"), then the short ones.
 */
function weekdaysMin(locale: string): readonly string[] {
  const short = names(locale, 'weekdaysShort');
  const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  const twoGraphemes = short.map(s =>
    Array.from(segmenter.segment(s.replace(/\.$/, '')), g => g.segment)
      .slice(0, 2)
      .join(''),
  );
  if (distinct(twoGraphemes, 7)) return twoGraphemes;
  const f = formatter(locale, 'W-narrow', { weekday: 'narrow' });
  const narrow = range(7).map(w => normalizeSpaces(f.format(weekdayRef(w))));
  return distinct(narrow, 7) ? narrow : short;
}

function buildNames(locale: string, kind: DateNameKind): readonly string[] {
  switch (kind) {
    case 'monthsLong': {
      // Nominative: the month part of "September 2026" (el {month:'long'} alone is genitive);
      // locales writing it as a number there (ja "2026年9月") use {month:'long'}.
      const withYear = formatter(locale, 'YM-long', { year: 'numeric', month: 'long' });
      const alone = formatter(locale, 'M-long', { month: 'long' });
      return range(12).map(m => {
        const name = part(withYear, monthRef(m), 'month');
        return normalizeSpaces(name && /\p{L}/u.test(name) ? name : alone.format(monthRef(m)));
      });
    }
    case 'monthsLongFormat':
      return formatContextMonths(locale, 'long', names(locale, 'monthsLong'));
    case 'monthsShort': {
      const f = formatter(locale, 'M-short', { month: 'short' });
      return range(12).map(m => normalizeSpaces(f.format(monthRef(m))));
    }
    case 'monthsShortFormat':
      return formatContextMonths(locale, 'short', names(locale, 'monthsShort'));
    case 'weekdaysLong': {
      const f = formatter(locale, 'W-long', { weekday: 'long' });
      return range(7).map(w => normalizeSpaces(f.format(weekdayRef(w))));
    }
    case 'weekdaysShort': {
      const f = formatter(locale, 'W-short', { weekday: 'short' });
      return range(7).map(w => normalizeSpaces(f.format(weekdayRef(w))));
    }
    case 'weekdaysMin':
      return weekdaysMin(locale);
    case 'meridiem': {
      const f = formatter(locale, 'h12', { hour: 'numeric', hour12: true });
      return [0, 12].map(h =>
        normalizeSpaces(part(f, new Date(Date.UTC(2021, 0, 1, h)), 'dayPeriod') ?? (h < 12 ? 'AM' : 'PM')),
      );
    }
  }
}

const namesCache = new Map<string, readonly string[]>();

/**
 * Cached name table of an already resolved locale (see `resolveFormatLocale`) — internal;
 * the public entry point is `dateNames`.
 */
export function names(locale: string, kind: DateNameKind): readonly string[] {
  const id = `${locale}|${kind}`;
  let list = namesCache.get(id);
  if (!list) {
    list = buildNames(locale, kind);
    namesCache.set(id, list);
  }
  return list;
}

/**
 * Localized name table: 12 months (January first), 7 weekdays (Sunday first) or 2 day
 * periods (AM, PM). `locale` resolves as in `formatDate` — missing, malformed or unsupported
 * means `'en'`. Spaces are plain (no NBSP), whatever the runtime's ICU version.
 */
export function dateNames(locale: string | undefined, kind: DateNameKind): readonly string[] {
  return names(resolveFormatLocale(locale), kind);
}
