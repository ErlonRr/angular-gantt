// Theme → CSS custom properties, contrast tokens and the metrics geometry depends on.
import { describe, it, expect } from 'vitest';
import {
  CONTRAST_CSS_VARS,
  DarkTheme,
  LegacyDarkTheme,
  LegacyLightTheme,
  LightTheme,
  THEME_CSS_VARS,
  readableOn,
  resolveTheme,
  sameThemeMetrics,
  themeMetrics,
  themeToCss,
  todayLabelColor,
  type GanttTheme,
} from '../index';

const PALETTES: [string, Required<GanttTheme>][] = [
  ['LightTheme', LightTheme],
  ['DarkTheme', DarkTheme],
  ['LegacyLightTheme', LegacyLightTheme],
  ['LegacyDarkTheme', LegacyDarkTheme],
  [
    'light overrides',
    resolveTheme(false, {
      barColor: '#FDE68A',
      milestoneColor: '#FEF3C7',
      criticalColor: '#7F1D1D',
      barTextColor: '#F8FAFC',
      barRadius: '7px',
      fontSize: '15px',
    }),
  ],
  ['dark overrides', resolveTheme(true, { barColor: 'rgb(250, 250, 250)', barTextColor: '#000000' })],
];

describe('themeToCss', () => {
  it.each(PALETTES)('%s: the 39 theme tokens then the 4 contrast tokens, 43 unique vars', (_, theme) => {
    const css = themeToCss(theme);
    expect(css).toHaveLength(43);
    expect(THEME_CSS_VARS).toHaveLength(39);
    expect(new Set(css.map(([name]) => name)).size).toBe(43);
    THEME_CSS_VARS.forEach(([key, cssVar], i) => {
      expect(css[i]).toEqual([cssVar, theme[key]]);
    });
    expect(css.slice(39).map(([name]) => name)).toEqual([
      CONTRAST_CSS_VARS.bar,
      CONTRAST_CSS_VARS.milestone,
      CONTRAST_CSS_VARS.critical,
      CONTRAST_CSS_VARS.todayLabel,
    ]);
    for (const [name, value] of css) {
      expect(name).toMatch(/^--gantt-[a-z-]+$/);
      expect(typeof value).toBe('string');
      expect(value).not.toBe('');
    }
  });

  it.each(PALETTES)('%s: contrast tokens equal readableOn(fill, barTextColor)', (_, theme) => {
    const css = new Map(themeToCss(theme));
    expect(css.get(CONTRAST_CSS_VARS.bar)).toBe(readableOn(theme.barColor, theme.barTextColor));
    expect(css.get(CONTRAST_CSS_VARS.milestone)).toBe(readableOn(theme.milestoneColor, theme.barTextColor));
    expect(css.get(CONTRAST_CSS_VARS.critical)).toBe(readableOn(theme.criticalColor, theme.barTextColor));
    expect(css.get(CONTRAST_CSS_VARS.todayLabel)).toBe(todayLabelColor(theme));
  });

  it('switches the contrast token when the preferred text is unreadable', () => {
    const css = new Map(themeToCss(resolveTheme(false, { barColor: '#FDE68A' })));
    expect(css.get(CONTRAST_CSS_VARS.bar)).toBe('#0F172A');
    expect(new Map(themeToCss(LightTheme)).get(CONTRAST_CSS_VARS.bar)).toBe('#FFFFFF');
  });
});

describe('themeMetrics', () => {
  it('reads the bar radius, the label font size (fontSize − 1) and the bar text colour', () => {
    expect(themeMetrics(LightTheme)).toEqual({ barRadius: 4, fontPx: 12, barTextColor: '#FFFFFF' });
    expect(themeMetrics(resolveTheme(false, { barRadius: '7px', fontSize: '15px', barTextColor: '#111' }))).toEqual({
      barRadius: 7,
      fontPx: 14,
      barTextColor: '#111',
    });
  });

  it('falls back to 4px / 13px when the lengths are not numeric', () => {
    const m = themeMetrics(resolveTheme(false, { barRadius: 'auto', fontSize: 'medium' }));
    expect(m.barRadius).toBe(4);
    expect(m.fontPx).toBe(12);
  });

  it('is unchanged by a colour-only theme change', () => {
    const a = themeMetrics(LightTheme);
    expect(sameThemeMetrics(a, themeMetrics(DarkTheme))).toBe(true);
    expect(sameThemeMetrics(a, themeMetrics(resolveTheme(false, { barColor: '#000', rowBg: '#eee' })))).toBe(true);
    expect(sameThemeMetrics(a, themeMetrics(resolveTheme(false, { barRadius: '2px' })))).toBe(false);
    expect(sameThemeMetrics(a, themeMetrics(resolveTheme(false, { fontSize: '14px' })))).toBe(false);
    expect(sameThemeMetrics(a, themeMetrics(resolveTheme(false, { barTextColor: '#000' })))).toBe(false);
  });
});
