import { describe, expect, it } from 'vitest';
import { escapeXml, inlineThemeVars, num, nums, stripInvalidXml } from '../export/xml';
import { CONTRAST_CSS_VARS, LightTheme, DarkTheme, todayLabelColor } from '../render/theme';
import { readableOn } from '../render/contrast';
import { resolvePaint, statusPaint, themeVar } from '../render/paint';

describe('escapeXml', () => {
  it.each([
    ['a & b', 'a &amp; b'],
    ['<g>', '&lt;g&gt;'],
    ['say "hi"', 'say &quot;hi&quot;'],
    ["it's", 'it&apos;s'],
    ['&amp;', '&amp;amp;'],
    ['plain text', 'plain text'],
    ['', ''],
    ['tab\there', 'tab&#9;here'],
    ['line\nbreak', 'line&#10;break'],
    ['cr\rlf', 'cr&#13;lf'],
    ['ünïcödé — 日本語 😀', 'ünïcödé — 日本語 😀'],
  ])('%j → %j', (input, out) => {
    expect(escapeXml(input)).toBe(out);
  });

  it('leaves nothing that could close an attribute or open a tag', () => {
    const out = escapeXml(`"><script>alert('x')</script><a b='`);
    expect(out).not.toMatch(/[<>"']/);
  });
});

describe('stripInvalidXml', () => {
  it('drops C0 controls but keeps tab, LF and CR', () => {
    expect(stripInvalidXml('a\u0000b\u0001c\u0008d\u000Be\u000Cf\u001Fg')).toBe('abcdefg');
    expect(stripInvalidXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('keeps surrogate pairs and drops lone surrogates', () => {
    expect(stripInvalidXml('emoji 😀 ok')).toBe('emoji 😀 ok');
    expect(stripInvalidXml('a\uD83Db')).toBe('ab'); // lone high
    expect(stripInvalidXml('a\uDE00b')).toBe('ab'); // lone low
    expect(stripInvalidXml('\uD83D')).toBe(''); // high at the end
    expect(stripInvalidXml('\uDE00\uD83D')).toBe(''); // low before high: both lone
    expect(stripInvalidXml('\uD83D😀')).toBe('😀'); // a lone high, then a pair
  });

  it('drops U+FFFE and U+FFFF, keeps the rest of the BMP', () => {
    expect(stripInvalidXml('a￾b￿c�d')).toBe('abc�d');
    expect(stripInvalidXml('\u007F\u0085')).toBe('\u007F\u0085');
  });

  it('returns valid text unchanged (the same string)', () => {
    const text = 'Design review — phase 2';
    expect(stripInvalidXml(text)).toBe(text);
    expect(stripInvalidXml('')).toBe('');
  });
});

describe('num', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [-1, '-1'],
    [1.5, '1.5'],
    [1.25, '1.25'],
    [1.234, '1.23'],
    [1.235001, '1.24'],
    [2.10000000001, '2.1'],
    [100, '100'],
    [123456.789, '123456.79'],
    [-0, '0'],
    [-0.001, '0'],
    [0.004, '0'],
    [0.005, '0.01'],
    [-0.005, '-0.01'],
    [-2.5, '-2.5'],
    [-1.239, '-1.24'],
    [1e-7, '0'],
    [Number.NaN, '0'],
    [Number.POSITIVE_INFINITY, '0'],
    [Number.NEGATIVE_INFINITY, '0'],
  ])('%s → %s', (n, out) => {
    expect(num(n)).toBe(out);
  });

  it('rounds halves away from zero the same for both signs', () => {
    expect(num(0.125)).toBe('0.13');
    expect(num(-0.125)).toBe('-0.13');
  });
});

describe('nums', () => {
  it('rounds every number of a path, a point list and a dash array', () => {
    expect(nums('M10.123,20.456H30.789A4,4 0 0 1 34.001,24Z')).toBe('M10.12,20.46H30.79A4,4 0 0 1 34,24Z');
    expect(nums('1.111,2.222 3.333,4.444')).toBe('1.11,2.22 3.33,4.44');
    expect(nums('5 3')).toBe('5 3');
    expect(nums('rotate(45)')).toBe('rotate(45)');
  });

  it('reads exponents and negatives', () => {
    expect(nums('M1e-7,2.5e1L-3.456,-0.001')).toBe('M0,25L-3.46,0');
  });

  it('keeps numbers written back to back apart', () => {
    // 1.004 rounds to "1": the next ".5" (now "0.5") must not merge into "10.5"
    expect(nums('M1.004.5')).toBe('M1 0.5');
    expect(nums('M1.004.25')).toBe('M1 0.25');
    expect(nums('M1.239.256')).toBe('M1.24 0.26');
    // Nothing to round: left as is (it reads the same)
    expect(nums('M1.5.25')).toBe('M1.5.25');
    expect(nums('M2-3')).toBe('M2-3');
  });
});

describe('inlineThemeVars', () => {
  const theme = LightTheme;

  it('replaces a theme token with its colour', () => {
    expect(inlineThemeVars('<rect fill="var(--gantt-bar)"/>', theme)).toBe(`<rect fill="${theme.barColor}"/>`);
    expect(inlineThemeVars(`style="fill: ${themeVar('criticalColor')}"`, theme)).toBe(
      `style="fill: ${theme.criticalColor}"`,
    );
  });

  it('every theme token of a palette resolves (light and dark)', () => {
    for (const t of [LightTheme, DarkTheme]) {
      expect(inlineThemeVars('var(--gantt-today) var(--gantt-text-sec) var(--gantt-font)', t)).toBe(
        `${t.todayColor} ${t.textSecondary} ${t.fontFamily}`,
      );
    }
  });

  it('a known token ignores its fallback; an unknown one uses it', () => {
    expect(inlineThemeVars('var(--gantt-bar, red)', theme)).toBe(theme.barColor);
    expect(inlineThemeVars('var(--gantt-nope, #123456)', theme)).toBe('#123456');
    expect(inlineThemeVars('var( --gantt-nope ,  rgb(1, 2, 3) )', theme)).toBe('rgb(1, 2, 3)');
  });

  it('resolves nested fallbacks (the status dot paint)', () => {
    const paint = statusPaint('done');
    expect(inlineThemeVars(paint, theme)).toBe(theme.statusDone);
    expect(inlineThemeVars('var(--gantt-nope, var(--gantt-text-muted))', theme)).toBe(theme.textMuted);
  });

  it('resolves the contrast tokens like resolvePaint', () => {
    expect(inlineThemeVars(`var(${CONTRAST_CSS_VARS.bar})`, theme)).toBe(
      readableOn(theme.barColor, theme.barTextColor),
    );
    expect(inlineThemeVars(`var(${CONTRAST_CSS_VARS.critical})`, DarkTheme)).toBe(
      resolvePaint(`var(${CONTRAST_CSS_VARS.critical})`, DarkTheme),
    );
    expect(inlineThemeVars(`var(${CONTRAST_CSS_VARS.todayLabel})`, theme)).toBe(todayLabelColor(theme));
  });

  it('honours theme overrides', () => {
    expect(inlineThemeVars('var(--gantt-bar)', { ...theme, barColor: '#ABCDEF' })).toBe('#ABCDEF');
  });

  it('leaves no var( behind: other properties take their fallback, else inherit', () => {
    expect(inlineThemeVars('var(--app-accent, #f00)', theme)).toBe('#f00');
    expect(inlineThemeVars('var(--app-accent)', theme)).toBe('inherit');
    expect(inlineThemeVars('var(--gantt-nope)', theme)).toBe('inherit');
    expect(inlineThemeVars('color-mix(in srgb, var(--gantt-bar) 40%, white)', theme)).toBe(
      `color-mix(in srgb, ${theme.barColor} 40%, white)`,
    );
    expect(inlineThemeVars('var(--app-x, color-mix(in srgb, var(--gantt-bar) 40%, white))', theme)).toBe(
      `color-mix(in srgb, ${theme.barColor} 40%, white)`,
    );
  });

  it('replaces every occurrence in markup and keeps the rest byte for byte', () => {
    const markup =
      '<g><rect fill="var(--gantt-bar)" stroke="var(--gantt-border)"/><text style="fill:var(--gantt-text);font-weight:600">A</text></g>';
    expect(inlineThemeVars(markup, theme)).toBe(
      `<g><rect fill="${theme.barColor}" stroke="${theme.borderColor}"/><text style="fill:${theme.textPrimary};font-weight:600">A</text></g>`,
    );
  });

  it('leaves markup without var( alone, and words ending in "var(" too', () => {
    const plain = '<rect fill="#fff"/>';
    expect(inlineThemeVars(plain, theme)).toBe(plain);
    expect(inlineThemeVars('myvar(--gantt-bar)', theme)).toBe('myvar(--gantt-bar)');
    // An unclosed var( is left as is (no closing parenthesis to replace up to)
    expect(inlineThemeVars('var(--gantt-bar', theme)).toBe('var(--gantt-bar');
  });
});
