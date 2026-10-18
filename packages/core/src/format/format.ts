// ─────────────────────────────────────────────────────────────
//  gantry · format/format.ts
//  dayjs-compatible date formatting without dayjs: format strings
//  compile once into parts, names come from Intl (see locale.ts).
// ─────────────────────────────────────────────────────────────

import { MAX_CACHE_ENTRIES, names, resolveFormatLocale } from './locale';
import { isoWeek, isoWeekYear, quarterOf } from './week';

/**
 * Supported tokens — the dayjs core set plus the `isoWeek` / `quarterOfYear` /
 * `advancedFormat` plugin tokens that need no extra locale data:
 *
 * | Token | Output | | Token | Output |
 * |---|---|---|---|---|
 * | `YYYY` `YY` | 2026 · 26 | | `H` `HH` | 0–23 · 00–23 |
 * | `M` `MM` | 1 · 01 | | `h` `hh` | 1–12 · 01–12 |
 * | `MMM` `MMMM` | Jan · January (localized) | | `k` `kk` | 1–24 · 01–24 |
 * | `D` `DD` | 1 · 01 | | `m` `mm` / `s` `ss` | minutes / seconds |
 * | `Do` | 1st · 1º · 1. (localized ordinal) | | `SSS` | milliseconds 000–999 |
 * | `d` | 0–6 (Sunday 0) | | | |
 * | `dd` `ddd` `dddd` | Su · Sun · Sunday (localized) | | `A` `a` | AM · am (localized) |
 * | `Q` | quarter 1–4 | | `Z` `ZZ` | +01:00 · +0100 |
 * | `W` `WW` | ISO week 1 · 01 | | `X` `x` | Unix seconds · milliseconds |
 * | `GGGG` | ISO week-year | | `[text]` | `text` verbatim |
 *
 * `MMM` / `MMMM` right after a day number (`D MMMM`, `Do [de] MMM`) take the locale's
 * format-context name (ru "5 января", "5 мар."). Anything else is copied as is (`w`, `gggg`,
 * `z` and a lone `Y` / `YYY` are not supported).
 */
export type FormatToken =
  | 'YYYY'
  | 'YY'
  | 'GGGG'
  | 'Q'
  | 'M'
  | 'MM'
  | 'MMM'
  | 'MMMM'
  | 'W'
  | 'WW'
  | 'D'
  | 'DD'
  | 'Do'
  | 'd'
  | 'dd'
  | 'ddd'
  | 'dddd'
  | 'H'
  | 'HH'
  | 'h'
  | 'hh'
  | 'k'
  | 'kk'
  | 'm'
  | 'mm'
  | 's'
  | 'ss'
  | 'SSS'
  | 'A'
  | 'a'
  | 'Z'
  | 'ZZ'
  | 'X'
  | 'x';

/** One piece of a compiled format: verbatim text or a token. */
export type FormatPart =
  | { readonly literal: string }
  | {
      readonly token: FormatToken;
      /** `MMM` / `MMMM` written right after a day number (`D MMMM`) — takes the locale's format-context name. */
      readonly afterDay: boolean;
    };

/** A compiled format string, reusable for any date and locale. */
export type CompiledFormat = readonly FormatPart[];

/** dayjs' `format()` default, used for an empty format string. */
export const ISO_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

// Longest alternatives first; `[…]` needs at least one character, as in dayjs (`[]` stays literal).
const TOKEN_RE =
  /\[([^\]]+)]|YYYY|YY|GGGG|Q|MMMM|MMM|MM|M|WW|W|DD|Do|D|dddd|ddd|dd|d|HH|H|hh|h|kk|k|mm|m|ss|s|SSS|A|a|ZZ|Z|X|x/g;

const compiledCache = new Map<string, CompiledFormat>();

/** Compile (and cache) a dayjs-style format string. */
export function compileFormat(format: string): CompiledFormat {
  const cached = compiledCache.get(format);
  if (cached) return cached;
  const parts: FormatPart[] = [];
  // dayjs' rule for format-context month names: `D`/`DD`/`Do`, then spaces or `[escaped]` text, then `MMM(M)`.
  let day = 'none' as 'none' | 'day' | 'separated';
  let last = 0;
  const pushLiteral = (text: string, escaped: boolean) => {
    if (!text) return;
    day = day !== 'none' && (escaped || /^\s+$/.test(text)) ? 'separated' : 'none';
    const prev = parts[parts.length - 1];
    if (prev && 'literal' in prev) parts[parts.length - 1] = { literal: prev.literal + text };
    else parts.push({ literal: text });
  };
  for (const match of format.matchAll(TOKEN_RE)) {
    const index = match.index;
    pushLiteral(format.slice(last, index), false);
    last = index + match[0].length;
    const escaped = match[1];
    if (escaped !== undefined) {
      pushLiteral(escaped, true);
      continue;
    }
    const token = match[0] as FormatToken;
    parts.push({ token, afterDay: day === 'separated' && (token === 'MMMM' || token === 'MMM') });
    day = token === 'D' || token === 'DD' || token === 'Do' ? 'day' : 'none';
  }
  pushLiteral(format.slice(last), false);
  if (compiledCache.size >= MAX_CACHE_ENTRIES) compiledCache.clear();
  compiledCache.set(format, parts);
  return parts;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** `+05:30`-style offset of the host time zone at `date` (rounded to 15 min, as dayjs). */
function zone(date: Date, colon: boolean): string {
  const offset = -Math.round(date.getTimezoneOffset() / 15) * 15;
  const abs = Math.abs(offset);
  return `${offset >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60), 2)}${colon ? ':' : ''}${pad(abs % 60, 2)}`;
}

const EN_ORDINAL: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' };
let enOrdinalRules: Intl.PluralRules | undefined;

/** Ordinal suffix by language, mirroring dayjs' locale files; other languages print the bare number, as dayjs. */
const ORDINAL_SUFFIX: Record<string, (n: number) => string> = {
  en: n => EN_ORDINAL[(enOrdinalRules ??= new Intl.PluralRules('en', { type: 'ordinal' })).select(n)] ?? 'th',
  fr: n => (n === 1 ? 'er' : ''),
  nl: n => (n === 1 || n === 8 || n >= 20 ? 'ste' : 'de'),
  sv: n => (n % 10 === 1 || n % 10 === 2 ? 'a' : 'e'),
  ca: n => (n === 1 || n === 3 ? 'r' : n === 2 ? 'n' : n === 4 ? 't' : 'è'),
  ja: () => '日',
  zh: () => '日',
  ko: () => '일',
};
for (const lang of ['es', 'gl', 'it', 'oc', 'pt']) ORDINAL_SUFFIX[lang] = () => 'º';
for (const lang of 'cs da de et fi hr hu id lt ms nb nn no pl sk sl sr th tk tr'.split(' '))
  ORDINAL_SUFFIX[lang] = () => '.';

/** `Do`: day of month as a localized ordinal ("1st", "1º", "1.", "1日"). */
function ordinal(day: number, locale: string): string {
  const suffix = ORDINAL_SUFFIX[locale.split('-')[0] ?? ''];
  return `${day}${suffix ? suffix(day) : ''}`;
}

function renderToken(date: Date, token: FormatToken, afterDay: boolean, locale: string): string {
  switch (token) {
    case 'YYYY':
      return String(date.getFullYear()).padStart(4, '0');
    case 'YY':
      return String(date.getFullYear()).slice(-2);
    case 'GGGG':
      return String(isoWeekYear(date));
    case 'Q':
      return String(quarterOf(date));
    case 'M':
      return String(date.getMonth() + 1);
    case 'MM':
      return pad(date.getMonth() + 1, 2);
    case 'MMM':
      return names(locale, afterDay ? 'monthsShortFormat' : 'monthsShort')[date.getMonth()] ?? '';
    case 'MMMM':
      return names(locale, afterDay ? 'monthsLongFormat' : 'monthsLong')[date.getMonth()] ?? '';
    case 'W':
      return String(isoWeek(date));
    case 'WW':
      return pad(isoWeek(date), 2);
    case 'D':
      return String(date.getDate());
    case 'DD':
      return pad(date.getDate(), 2);
    case 'Do':
      return ordinal(date.getDate(), locale);
    case 'd':
      return String(date.getDay());
    case 'dd':
      return names(locale, 'weekdaysMin')[date.getDay()] ?? '';
    case 'ddd':
      return names(locale, 'weekdaysShort')[date.getDay()] ?? '';
    case 'dddd':
      return names(locale, 'weekdaysLong')[date.getDay()] ?? '';
    case 'H':
      return String(date.getHours());
    case 'HH':
      return pad(date.getHours(), 2);
    case 'h':
      return String(date.getHours() % 12 || 12);
    case 'hh':
      return pad(date.getHours() % 12 || 12, 2);
    case 'k':
      return String(date.getHours() || 24);
    case 'kk':
      return pad(date.getHours() || 24, 2);
    case 'm':
      return String(date.getMinutes());
    case 'mm':
      return pad(date.getMinutes(), 2);
    case 's':
      return String(date.getSeconds());
    case 'ss':
      return pad(date.getSeconds(), 2);
    case 'SSS':
      return pad(date.getMilliseconds(), 3);
    case 'A':
      return names(locale, 'meridiem')[date.getHours() < 12 ? 0 : 1] ?? '';
    case 'a':
      return (names(locale, 'meridiem')[date.getHours() < 12 ? 0 : 1] ?? '').toLocaleLowerCase(locale);
    case 'Z':
      return zone(date, true);
    case 'ZZ':
      return zone(date, false);
    case 'X':
      return String(Math.floor(date.getTime() / 1000));
    case 'x':
      return String(date.getTime());
  }
}

/**
 * Format `date` (its local calendar fields) with a dayjs-compatible format string — see
 * `FormatToken` for the tokens. Names follow `locale` (any BCP 47 tag Intl supports, no
 * locale import needed); a missing, invalid or unsupported locale means `'en'`.
 * An empty format means `ISO_FORMAT`; an invalid date gives `'Invalid Date'`.
 */
export function formatDate(date: Date, format: string, locale?: string): string {
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  const parts = compileFormat(format || ISO_FORMAT);
  const loc = resolveFormatLocale(locale);
  let out = '';
  for (const p of parts) out += 'literal' in p ? p.literal : renderToken(date, p.token, p.afterDay, loc);
  return out;
}
