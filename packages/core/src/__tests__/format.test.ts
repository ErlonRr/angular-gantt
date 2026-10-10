// ─────────────────────────────────────────────────────────────
//  Tests — format/: dayjs-compatible formatDate, ISO week, quarter
//  Differential against dayjs (devDependency, test-only) over every
//  token × ~40 dates × en / it / de / fr / es / ja, plus targeted
//  ru / pl / ca / el cases and name-table invariants over ~20 locales.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isoWeekPlugin from 'dayjs/plugin/isoWeek.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import 'dayjs/locale/it.js';
import 'dayjs/locale/de.js';
import 'dayjs/locale/fr.js';
import 'dayjs/locale/es.js';
import 'dayjs/locale/ja.js';
import 'dayjs/locale/ru.js';
import 'dayjs/locale/pl.js';
import 'dayjs/locale/el.js';

import {
  formatDate,
  resolveFormatLocale,
  dateNames,
  isoWeek,
  isoWeekYear,
  quarterOf,
  dayOfYear,
  isLeapYear,
  ISO_FORMAT,
} from '../format';
import { compileFormat } from '../format/format';

dayjs.extend(isoWeekPlugin);
dayjs.extend(quarterOfYear);
dayjs.extend(advancedFormat);

const viaDayjs = (d: Date, fmt: string, locale: string) =>
  (locale === 'en' ? dayjs(d) : dayjs(d).locale(locale)).format(fmt);

// ─── Fixtures ─────────────────────────────────────────────────

/** ~40 local dates: ISO-week year boundaries, leap days, DST transition days (US, EU, Lord Howe), clock edges. */
const DATES: Date[] = [
  // ISO week-year boundaries (2020 has 53 weeks; 2009 starts on Dec 29 2008)
  new Date(2020, 11, 27, 9),
  new Date(2020, 11, 28),
  new Date(2020, 11, 31, 23, 59, 59, 999),
  new Date(2021, 0, 1),
  new Date(2021, 0, 3, 12, 30),
  new Date(2021, 0, 4, 8, 5, 3),
  new Date(2008, 11, 29),
  new Date(2010, 0, 3, 18),
  new Date(2015, 11, 31),
  new Date(2016, 0, 1, 0, 0, 1),
  new Date(2024, 11, 30, 11, 59),
  new Date(2025, 0, 1, 12),
  new Date(2026, 11, 28, 6),
  new Date(2027, 0, 1, 1),
  new Date(2027, 0, 3, 23),
  new Date(2027, 0, 4, 10, 10, 10, 10),
  // Leap days and their neighbours
  new Date(2024, 1, 28, 13),
  new Date(2024, 1, 29, 7, 45),
  new Date(2024, 2, 1),
  new Date(2000, 1, 29, 20),
  new Date(2100, 1, 28, 15),
  new Date(2100, 2, 1, 4),
  new Date(2023, 2, 1),
  // DST transition days (the 02:30 of spring-forward does not exist in some zones — any local result is fine)
  new Date(2026, 2, 8),
  new Date(2026, 2, 8, 2, 30),
  new Date(2026, 2, 8, 12),
  new Date(2026, 10, 1, 1, 30),
  new Date(2026, 2, 29, 0),
  new Date(2026, 2, 29, 3, 15),
  new Date(2026, 9, 25, 2, 30),
  new Date(2026, 3, 5, 1, 45),
  new Date(2026, 9, 4, 2, 15),
  // Every month / weekday / quarter and clock edges
  new Date(2026, 1, 9, 12),
  new Date(2026, 3, 14, 0, 0, 0, 5),
  new Date(2026, 4, 20, 11, 59, 59),
  new Date(2026, 5, 30, 12, 0, 1),
  new Date(2026, 6, 4, 16, 20),
  new Date(2026, 7, 13, 21, 9),
  new Date(2026, 8, 17, 9, 9, 9),
  new Date(2026, 9, 10, 10),
  new Date(1999, 11, 31, 23, 59),
];

const LOCALES = ['en', 'it', 'de', 'fr', 'es', 'ja'] as const;
type Locale = (typeof LOCALES)[number];

/** Tokens whose output is a number, offset or ordinal day — identical to dayjs in every tested locale and zone. */
const NUMERIC_TOKENS = [
  'YYYY',
  'YY',
  'GGGG',
  'Q',
  'M',
  'MM',
  'W',
  'WW',
  'D',
  'DD',
  'Do',
  'd',
  'H',
  'HH',
  'h',
  'hh',
  'k',
  'kk',
  'm',
  'mm',
  's',
  'ss',
  'SSS',
  'Z',
  'ZZ',
  'X',
  'x',
] as const;

/** Tokens whose output is a localized name. */
const NAME_TOKENS = ['MMM', 'MMMM', 'dd', 'ddd', 'dddd', 'A', 'a'] as const;
type NameToken = (typeof NAME_TOKENS)[number];

/** Which entry of a name table a date selects for a name token. */
const nameIndex = (token: NameToken, d: Date) =>
  token === 'MMM' || token === 'MMMM'
    ? d.getMonth()
    : token === 'A' || token === 'a'
      ? d.getHours() < 12
        ? 0
        : 1
      : d.getDay();

/**
 * Where Intl (CLDR) and dayjs' hand-written locale files legitimately disagree. Both sides are
 * spelled out so a change in either (ICU update, dayjs locale fix) shows up here.
 * Every (locale, token) not listed must match dayjs exactly.
 */
const KNOWN_DIFFERENCES: Partial<Record<Locale, Partial<Record<NameToken, { ours: string[]; dayjs: string[] }>>>> = {
  de: {
    // CLDR stand-alone abbreviations have no dots and 3 letters; dayjs uses the format-context ones.
    MMM: {
      ours: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
      dayjs: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
    },
    ddd: {
      ours: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
      dayjs: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'],
    },
  },
  es: {
    // CLDR abbreviates September as "sept" and weekdays without a dot.
    MMM: {
      ours: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
      dayjs: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    },
    ddd: {
      ours: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
      dayjs: ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'],
    },
    // dayjs' es locale has no meridiem, so it falls back to English; CLDR has Spanish day periods.
    A: { ours: ['a. m.', 'p. m.'], dayjs: ['AM', 'PM'] },
    a: { ours: ['a. m.', 'p. m.'], dayjs: ['am', 'pm'] },
  },
};

// ─── ISO week, quarter ────────────────────────────────────────

describe('isoWeek / isoWeekYear / quarterOf', () => {
  it('match dayjs for every day of 2014–2031', () => {
    const mismatches: string[] = [];
    for (let y = 2014; y <= 2031; y++) {
      for (let doy = 0; doy < (isLeapYear(y) ? 366 : 365); doy++) {
        const d = new Date(y, 0, 1 + doy);
        const ref = dayjs(d);
        if (isoWeek(d) !== ref.isoWeek() || isoWeekYear(d) !== ref.isoWeekYear() || quarterOf(d) !== ref.quarter()) {
          mismatches.push(d.toDateString());
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('known ISO weeks around year boundaries', () => {
    expect(isoWeek(new Date(2020, 11, 31))).toBe(53);
    expect(isoWeek(new Date(2021, 0, 3))).toBe(53);
    expect(isoWeekYear(new Date(2021, 0, 3))).toBe(2020);
    expect(isoWeek(new Date(2021, 0, 4))).toBe(1);
    expect(isoWeek(new Date(2008, 11, 29))).toBe(1);
    expect(isoWeekYear(new Date(2008, 11, 29))).toBe(2009);
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1);
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
  });

  it('ignores the time of day, also on DST transition days', () => {
    for (const h of [0, 1, 2, 3, 12, 23]) {
      expect(isoWeek(new Date(2026, 2, 29, h))).toBe(13);
      expect(isoWeek(new Date(2026, 2, 8, h))).toBe(10);
      expect(isoWeek(new Date(2026, 9, 4, h))).toBe(40);
    }
  });

  it('dayOfYear / isLeapYear', () => {
    expect(dayOfYear(new Date(2024, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2024, 1, 29))).toBe(60);
    expect(dayOfYear(new Date(2024, 11, 31))).toBe(366);
    expect(dayOfYear(new Date(2100, 11, 31))).toBe(365);
    expect([1900, 2000, 2023, 2024, 2100].map(isLeapYear)).toEqual([false, true, false, true, false]);
  });

  it('quarters', () => {
    expect([0, 2, 3, 5, 6, 8, 9, 11].map(m => quarterOf(new Date(2026, m, 15)))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

// ─── Differential: every token × every date × every locale ────

describe('formatDate vs dayjs', () => {
  it('fixture covers every month, weekday and both day periods', () => {
    expect(new Set(DATES.map(d => d.getMonth())).size).toBe(12);
    expect(new Set(DATES.map(d => d.getDay())).size).toBe(7);
    expect(new Set(DATES.map(d => d.getHours() < 12)).size).toBe(2);
  });

  it.each(LOCALES)('numeric tokens match exactly (%s)', locale => {
    for (const token of NUMERIC_TOKENS) {
      for (const d of DATES)
        expect(`${token} ${formatDate(d, token, locale)}`).toBe(`${token} ${viaDayjs(d, token, locale)}`);
    }
  });

  it.each(LOCALES)('name tokens match, or differ exactly as documented (%s)', locale => {
    for (const token of NAME_TOKENS) {
      const known = KNOWN_DIFFERENCES[locale]?.[token];
      for (const d of DATES) {
        const ours = formatDate(d, token, locale);
        const theirs = viaDayjs(d, token, locale);
        if (known) {
          const i = nameIndex(token, d);
          expect(`${token} ${ours}`).toBe(`${token} ${known.ours[i]}`);
          expect(`${token} ${theirs}`).toBe(`${token} ${known.dayjs[i]}`);
        } else {
          expect(`${token} ${ours}`).toBe(`${token} ${theirs}`);
        }
      }
    }
  });

  it('English names match exactly', () => {
    const d = (m: number, day: number, h = 9) => new Date(2021, m, day, h);
    expect(formatDate(d(8, 5), 'MMM MMMM dd ddd dddd A a')).toBe('Sep September Su Sun Sunday AM am');
    expect(formatDate(d(4, 5, 15), 'MMM MMMM dd ddd dddd A a', 'en')).toBe('May May We Wed Wednesday PM pm');
  });

  const COMPOSITE = [
    'MMM D, YYYY',
    'MMM Do',
    'Do MMMM YYYY',
    'dddd, MMMM Do',
    'D MMM',
    'D MMMM YYYY',
    'dddd D MMMM',
    'MMM YYYY',
    'MMMM YYYY',
    'ddd DD/MM',
    'DD.MM.YYYY HH:mm:ss.SSS',
    'h:mm A',
    'hh:mm a',
    '[W]W',
    '[Week] WW, GGGG',
    'Q[Q] YYYY',
    '[Q]Q',
    'YYYY-MM-DDTHH:mm:ssZ',
    'YYYYMMDD[T]HHmmssZZ',
    'kk:mm',
    'X x',
    '[YYYY] [MMM] [today]',
    'MMMMM DDD dddddd',
    'D/M/YY H:m:s',
    'SS ZZZ',
    '[] [unclosed',
    'Hello, [it is] dddd!',
  ];

  it('composite formats match dayjs in en, it, fr and ja', () => {
    for (const locale of ['en', 'it', 'fr', 'ja']) {
      for (const fmt of COMPOSITE) {
        for (const d of DATES)
          expect(`${locale} ${fmt} → ${formatDate(d, fmt, locale)}`).toBe(
            `${locale} ${fmt} → ${viaDayjs(d, fmt, locale)}`,
          );
      }
    }
  });

  it('composite formats without names match dayjs in every locale', () => {
    const numeric = COMPOSITE.filter(f => !/MMM|ddd?d?|[Aa]/.test(f.replace(/\[[^\]]+]/g, '')));
    expect(numeric.length).toBeGreaterThan(8);
    for (const locale of LOCALES) {
      for (const fmt of numeric) {
        for (const d of DATES) expect(formatDate(d, fmt, locale)).toBe(viaDayjs(d, fmt, locale));
      }
    }
  });

  it('format-context month names after a day number (ru, pl genitive) match dayjs', () => {
    for (const locale of ['ru', 'pl']) {
      for (let m = 0; m < 12; m++) {
        const d = new Date(2026, m, 1);
        for (const fmt of ['D MMMM', 'DD MMMM YYYY', 'MMMM', 'MMMM D', 'MMMM YYYY']) {
          expect(formatDate(d, fmt, locale)).toBe(viaDayjs(d, fmt, locale));
        }
      }
    }
    // ru's dayjs rule also accepts [escaped] text between day and month (pl's only "D MMMM"); ours follows ru's
    expect(formatDate(new Date(2026, 0, 5), 'D [-] MMMM', 'ru')).toBe(
      viaDayjs(new Date(2026, 0, 5), 'D [-] MMMM', 'ru'),
    );
    expect(formatDate(new Date(2026, 0, 5), 'D MMMM', 'ru')).toBe('5 января');
    expect(formatDate(new Date(2026, 0, 5), 'MMMM', 'ru')).toBe('январь');
    // dayjs needs a separator between the day and the month: "DMMMM" is stand-alone
    expect(formatDate(new Date(2026, 0, 5), 'DMMMM', 'ru')).toBe('5январь');
  });

  it('format-context short months after a day number (ru "5 мар.") match dayjs, June / July as documented', () => {
    // CLDR abbreviates the genitive June / July ("июн.", "июл."); dayjs writes them out ("июня", "июля")
    const ours = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
    const theirs = ours.map((name, m) => (m === 5 ? 'июня' : m === 6 ? 'июля' : name));
    for (let m = 0; m < 12; m++) {
      for (const day of [1, 5, 28]) {
        const d = new Date(2026, m, day);
        for (const [fmt, prefix] of [
          ['D MMM', `${day} `],
          ['DD MMM YYYY', `${String(day).padStart(2, '0')} `],
        ] as const) {
          const suffix = fmt === 'DD MMM YYYY' ? ' 2026' : '';
          expect(formatDate(d, fmt, 'ru')).toBe(`${prefix}${ours[m]}${suffix}`);
          expect(viaDayjs(d, fmt, 'ru')).toBe(`${prefix}${theirs[m]}${suffix}`);
        }
        // stand-alone MMM is unaffected
        for (const fmt of ['MMM', 'MMM D']) expect(formatDate(d, fmt, 'ru')).toBe(viaDayjs(d, fmt, 'ru'));
        // the Hour-zoom header (CLDR's short weekdays are "чт", dayjs' "чтв")
        expect(formatDate(d, 'ddd D MMM', 'ru')).toBe(`${formatDate(d, 'ddd', 'ru')} ${day} ${ours[m]}`);
      }
    }
    expect(formatDate(new Date(2026, 2, 5), 'D MMM', 'ru')).toBe('5 мар.');
    expect(formatDate(new Date(2026, 2, 5), 'MMM', 'ru')).toBe('март');
    // `Do` counts as a day number too (dayjs' ru rule says so, but advancedFormat hides it, giving "5 январь")
    expect(formatDate(new Date(2026, 0, 5), 'Do MMMM', 'ru')).toBe('5 января');
    expect(viaDayjs(new Date(2026, 0, 5), 'Do MMMM', 'ru')).toBe('5 январь');
    expect(compileFormat('Do MMM')).toEqual([
      { token: 'Do', afterDay: false },
      { literal: ' ' },
      { token: 'MMM', afterDay: true },
    ]);
  });

  it('keeps stand-alone month names where the format context is numeric (ja) or for other locales unchanged', () => {
    expect(formatDate(new Date(2026, 2, 5), 'D MMMM', 'ja')).toBe('5 3月');
    expect(formatDate(new Date(2026, 2, 5), 'D MMMM', 'it')).toBe('5 marzo');
    // CLDR's Catalan format context includes the preposition ("de gener", "d’abril"): it is
    // dropped, so the idiomatic 'D [de] MMMM' does not print "de de gener"
    expect(formatDate(new Date(2026, 0, 5), 'D [de] MMMM [de] YYYY', 'ca')).toBe('5 de gener de 2026');
    expect(formatDate(new Date(2026, 0, 5), 'D [de] MMM', 'ca')).toBe('5 de gen.');
    expect(formatDate(new Date(2026, 3, 5), 'D MMMM', 'ca')).toBe('5 abril');
    expect(formatDate(new Date(2026, 3, 5), 'MMMM', 'ca')).toBe('abril');
  });

  it('stand-alone month names are nominative (el), the format context genitive', () => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 5);
      expect(formatDate(d, 'MMMM YYYY', 'el')).toBe(viaDayjs(d, 'MMMM YYYY', 'el'));
    }
    expect(formatDate(new Date(2026, 8, 5), 'MMMM YYYY', 'el')).toBe('Σεπτέμβριος 2026');
    expect(formatDate(new Date(2026, 8, 5), 'D MMMM', 'el')).toBe('5 Σεπτεμβρίου');
  });

  it.each(LOCALES)('Do matches dayjs on every day of the month (%s)', locale => {
    for (let day = 1; day <= 31; day++) {
      const d = new Date(2026, 0, day);
      expect(formatDate(d, 'Do', locale)).toBe(viaDayjs(d, 'Do', locale));
    }
  });

  it('Do: English ordinals, localized suffixes, the bare number elsewhere', () => {
    const days = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(day => new Date(2026, 0, day));
    const ord = (locale: string) => days.map(d => formatDate(d, 'Do', locale)).join(' ');
    expect(ord('en')).toBe('1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 31st');
    expect(ord('en-GB')).toBe(ord('en'));
    expect(ord('pt-BR')).toBe('1º 2º 3º 4º 11º 12º 13º 21º 22º 23º 31º');
    expect(ord('ko')).toBe('1일 2일 3일 4일 11일 12일 13일 21일 22일 23일 31일');
    expect(ord('ru')).toBe('1 2 3 4 11 12 13 21 22 23 31');
    expect(formatDate(new Date(2026, 2, 1), 'MMM Do')).toBe('Mar 1st');
  });
});

// ─── Behaviour without a dayjs counterpart ────────────────────

describe('formatDate', () => {
  const d = new Date(2026, 2, 5, 14, 7, 9, 42);

  it('escapes [text], keeps unknown characters and an empty [] as is', () => {
    expect(formatDate(d, '[YYYY] YYYY')).toBe('YYYY 2026');
    expect(formatDate(d, '[]-[')).toBe('[]-[');
    expect(formatDate(d, 'YYYY/MM/DD @ HH.mm')).toBe('2026/03/05 @ 14.07');
  });

  it('a lone Y stays literal, YYY is YY + Y (dayjs prints the zone offset there — a quirk not reproduced)', () => {
    expect(formatDate(d, 'YYYYY')).toBe('2026Y');
    expect(formatDate(d, 'YYY')).toBe('26Y');
    expect(dayjs(d).format('YYY')).toBe(formatDate(d, 'ZZ'));
  });

  it('an empty format means the ISO format, as dayjs', () => {
    expect(formatDate(d, '')).toBe(formatDate(d, ISO_FORMAT));
    expect(formatDate(d, '')).toBe(dayjs(d).format(''));
  });

  it('an invalid date gives "Invalid Date"', () => {
    expect(formatDate(new Date(Number.NaN), 'YYYY')).toBe('Invalid Date');
  });

  it('pads years below 1000 to four digits', () => {
    const early = new Date(2020, 5, 15);
    early.setFullYear(9);
    expect(formatDate(early, 'YYYY YY')).toBe('0009 9');
  });

  it('names contain plain spaces only, whatever the ICU version (es "a. m.")', () => {
    expect(formatDate(new Date(2026, 0, 5, 9), 'A', 'es')).toBe('a. m.');
    for (const locale of ['es', 'ca', 'fr', 'vi', 'en']) {
      for (const kind of ['monthsLong', 'monthsShort', 'weekdaysShort', 'meridiem'] as const) {
        for (const name of dateNames(locale, kind)) expect(name).not.toMatch(/[\u00A0\u202F]/);
      }
    }
  });

  it('localizes without importing locale data (any Intl locale works)', () => {
    expect(formatDate(new Date(2026, 0, 5), 'dddd D MMMM', 'pt-BR')).toBe('segunda-feira 5 janeiro');
    expect(formatDate(new Date(2026, 0, 5), 'dddd', 'nl')).toBe('maandag');
  });
});

describe('resolveFormatLocale', () => {
  it('defaults to en, canonicalizes, falls back to en for invalid or unsupported tags', () => {
    expect(resolveFormatLocale()).toBe('en');
    expect(resolveFormatLocale('')).toBe('en');
    expect(resolveFormatLocale('it')).toBe('it');
    expect(resolveFormatLocale('IT')).toBe('it');
    expect(resolveFormatLocale('pt-br')).toBe('pt-BR');
    expect(resolveFormatLocale('zh-cn')).toBe('zh-CN');
    expect(resolveFormatLocale('not a locale!')).toBe('en');
    expect(resolveFormatLocale('qq')).toBe('en');
  });

  it('dateNames resolves the locale like formatDate (never the host locale, never throws)', () => {
    expect(dateNames('qq', 'monthsLong')[0]).toBe('January');
    expect(dateNames('not a locale!', 'weekdaysLong')[1]).toBe('Monday');
    expect(dateNames(undefined, 'monthsShort')[0]).toBe('Jan');
    expect(dateNames('IT', 'monthsLong')).toBe(dateNames('it', 'monthsLong'));
  });

  it('formats an invalid locale in English', () => {
    const d = new Date(2026, 0, 5, 9);
    expect(formatDate(d, 'dddd MMMM A', 'not a locale!')).toBe('Monday January AM');
    expect(formatDate(d, 'dddd MMMM A', 'qq')).toBe('Monday January AM');
  });
});

describe('compileFormat / dateNames caches', () => {
  it('returns the same compiled parts for the same format string', () => {
    const a = compileFormat('D MMM YYYY');
    expect(compileFormat('D MMM YYYY')).toBe(a);
    expect(a).toEqual([
      { token: 'D', afterDay: false },
      { literal: ' ' },
      { token: 'MMM', afterDay: true },
      { literal: ' ' },
      { token: 'YYYY', afterDay: false },
    ]);
  });

  it('merges adjacent literal text and marks MMMM after a day', () => {
    expect(compileFormat('D [de] MMMM')).toEqual([
      { token: 'D', afterDay: false },
      { literal: ' de ' },
      { token: 'MMMM', afterDay: true },
    ]);
  });

  it('name tables have 12 months, 7 weekdays and 2 day periods', () => {
    expect(dateNames('en', 'monthsLong')).toHaveLength(12);
    expect(dateNames('en', 'weekdaysMin')).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
    expect(dateNames('en', 'meridiem')).toEqual(['AM', 'PM']);
    expect(dateNames('en', 'weekdaysShort')).toBe(dateNames('en', 'weekdaysShort'));
  });
});

// ─── Invariants across locales ────────────────────────────────

const INVARIANT_LOCALES = 'en it de fr es ja ar he zh-CN ko hi uk cs fi el pt-BR ru pl ca tr th vi nl sv'.split(' ');

describe('name tables', () => {
  it.each(INVARIANT_LOCALES)('hold 12 / 7 / 2 distinct, non-empty, trimmed names (%s)', locale => {
    const tables = [
      ['monthsLong', 12],
      ['monthsLongFormat', 12],
      ['monthsShort', 12],
      ['monthsShortFormat', 12],
      ['weekdaysLong', 7],
      ['weekdaysShort', 7],
      ['weekdaysMin', 7],
      ['meridiem', 2],
    ] as const;
    for (const [kind, n] of tables) {
      const list = dateNames(locale, kind);
      expect(`${kind} ${list.length}`).toBe(`${kind} ${n}`);
      expect(`${kind} ${new Set(list).size}`).toBe(`${kind} ${n}`);
      for (const name of list) {
        expect(name).not.toBe('');
        expect(name).toBe(name.trim());
        expect(name).not.toMatch(/[\u00A0\u202F]/);
      }
    }
  });

  it('weekdaysMin does not split graphemes and falls back to narrow names where two letters collide', () => {
    expect(dateNames('he', 'weekdaysMin')).toEqual(['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']);
    expect(dateNames('ar', 'weekdaysMin')).toEqual(['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']);
    expect(dateNames('hi', 'weekdaysMin')[0]).toBe('रवि');
  });
});
