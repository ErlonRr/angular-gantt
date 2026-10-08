// ─────────────────────────────────────────────────────────────
//  Tests — contrast helpers and the accessible default palettes
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { contrastRatio, parseColor, readableOn } from '../render/contrast';
import { LightTheme, DarkTheme, LegacyLightTheme } from '../render/theme';
import { computeBarVisual } from '../render/bars';
import { resolveConfig } from '../render/config';
import { flattenTree } from '../gantt-data';
import type { RowGeometry } from '../types';

const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0;

describe('parseColor / contrastRatio', () => {
  it('parses hex and rgb() forms', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#2563EB')).toEqual([37, 99, 235]);
    expect(parseColor('#2563EBcc')).toEqual([37, 99, 235]);
    expect(parseColor('rgb(37, 99, 235)')).toEqual([37, 99, 235]);
    expect(parseColor('rgba(37 99 235 / 50%)')).toEqual([37, 99, 235]);
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor('tomato')).toBeNull();
  });

  it('matches the WCAG reference values', () => {
    expect(ratio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(ratio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(ratio('#3B82F6', '#FFFFFF')).toBeCloseTo(3.68, 2);
    expect(contrastRatio('hsl(0 0% 0%)', '#fff')).toBeNull();
  });
});

describe('readableOn', () => {
  it('keeps the preferred colour when it is readable', () => {
    expect(readableOn('#2563EB', '#FFFFFF')).toBe('#FFFFFF');
  });

  it('switches to near-black on light fills', () => {
    expect(readableOn('#F59E0B', '#FFFFFF')).toBe('#0F172A');
    expect(readableOn('#FDE68A', '#FFFFFF')).toBe('#0F172A');
  });

  it('switches to white on dark fills', () => {
    expect(readableOn('#1E293B', '#334155')).toBe('#FFFFFF');
  });

  it('leaves unparseable colours alone', () => {
    expect(readableOn('var(--brand)', '#FFFFFF')).toBe('#FFFFFF');
  });
});

describe('default palettes (WCAG AA)', () => {
  for (const [name, theme] of [['light', LightTheme], ['dark', DarkTheme]] as const) {
    it(`${name}: bar labels ≥ 4.5:1 on bar and critical fills`, () => {
      expect(ratio(theme.barColor, theme.barTextColor)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(theme.criticalColor, theme.barTextColor)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: muted text ≥ 4.5:1 on rows and header`, () => {
      expect(ratio(theme.textMuted, theme.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(theme.textMuted, theme.headerBackground)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: bars, markers and arrows ≥ 3:1 against the background`, () => {
      for (const key of ['barColor', 'criticalColor', 'todayColor', 'arrowColor', 'selectionBorder', 'baselineColor', 'milestoneColor'] as const) {
        expect(ratio(theme[key], theme.backgroundColor), key).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('the legacy palette keeps the 1.x colours', () => {
    expect(LegacyLightTheme.barColor).toBe('#3B82F6');
    expect(LegacyLightTheme.backgroundColor).toBe(LightTheme.backgroundColor);
  });
});

describe('bar labels on custom colours', () => {
  const geoFor = (barColor?: string, textColor?: string): RowGeometry => {
    const [row] = flattenTree([{
      id: 't', name: 'Task', start: new Date(2026, 0, 1), end: new Date(2026, 0, 20), barColor, textColor,
    }]);
    return { row, y: 0, height: 40, barX: 0, barWidth: 400 } as RowGeometry;
  };
  const cfg = resolveConfig({ bar: { label: { position: 'inside' } } }, LightTheme);
  const labelOf = (geo: RowGeometry) => computeBarVisual({ geo, cfg, toX: () => 0 }).label;

  it('uses the theme text colour on the default fill', () => {
    expect(labelOf(geoFor())?.color).toBe(LightTheme.barTextColor);
  });

  it('picks a readable colour on a light custom fill', () => {
    expect(labelOf(geoFor('#FDE68A'))?.color).toBe('#0F172A');
  });

  it('never overrides an explicit text colour', () => {
    expect(labelOf(geoFor('#FDE68A', '#FFFFFF'))?.color).toBe('#FFFFFF');
  });
});
