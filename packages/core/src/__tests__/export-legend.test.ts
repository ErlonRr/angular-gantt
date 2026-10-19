// ─────────────────────────────────────────────────────────────
//  Tests — export/legend.ts (Phase 12, step 2.2): the legend strip of
//  an image export, laid out as both painters draw the bottom legend
//  (title, swatches and labels on 16 px lines, wrapping)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildLegendPart, EXPORT_LEGEND, type ExportLegendOptions } from '../export/legend';
import { buildLegend, legendSwatch, LEGEND_SWATCH_SIZE, type LegendItem } from '../state/legend';
import { resolveTheme } from '../render/theme';
import { estimateTextWidth } from '../render/bars';
import { DEFAULT_LABELS } from '../types';

const LIGHT = resolveTheme(false);
const DARK = resolveTheme(true);
const L = EXPORT_LEGEND;
/** Top of the first line: the top border and the padding */
const TOP = L.border + L.padY;
const LINE = L.lineHeight + L.rowGap;
const LEAD = LEGEND_SWATCH_SIZE.width + L.swatchGap;
const TITLE_W = estimateTextWidth('LEGEND', L.titleFontPx) + 6 * L.titleLetterSpacing;

const ITEMS: LegendItem[] = buildLegend({
  showToday: true,
  todayVisible: true,
  annotations: [{ color: '#ff0000', label: { text: 'Release' } }, { label: { text: 'Freeze' } }],
  labels: DEFAULT_LABELS,
  criticalPath: true,
  baseline: true,
});

const opts = (over: Partial<ExportLegendOptions> = {}): ExportLegendOptions => ({
  width: 1200,
  theme: LIGHT,
  fontPx: 12,
  ...over,
});

const itemWidth = (label: string) => LEAD + estimateTextWidth(label, L.fontPx);

describe('buildLegendPart: one line', () => {
  it('the title, then each item: swatch, 5 px, label; 14 px between them', () => {
    const legend = buildLegendPart(ITEMS, opts());
    expect(legend.y).toBe(0);
    expect(legend.height).toBe(L.border + 2 * L.padY + L.lineHeight);
    expect(legend.title).toEqual({ text: 'LEGEND', x: L.padX, y: TOP });
    let x = L.padX + TITLE_W + L.itemGap;
    for (const [i, item] of legend.items.entries()) {
      const label = ITEMS[i]?.label ?? '';
      expect(item.x).toBeCloseTo(x, 6);
      expect(item.y).toBe(TOP);
      expect(item.label).toEqual({ text: label, x: item.x + LEAD });
      x += itemWidth(label) + L.itemGap;
    }
  });

  it('swatches keep the core geometry, with the colour resolved and the dash of lines', () => {
    const [today, release, freeze, critical, baseline] = buildLegendPart(ITEMS, opts()).items;
    expect(today?.swatch).toEqual({ ...legendSwatch('line'), fill: LIGHT.todayColor, dash: null });
    expect(release?.swatch).toEqual({ ...legendSwatch('dashed'), fill: '#ff0000', dash: '3 2' });
    expect(freeze?.swatch.fill).toBe(LIGHT.arrowColor);
    expect(critical?.swatch).toEqual({ ...legendSwatch('bar'), fill: LIGHT.criticalColor, dash: null });
    expect(baseline?.swatch).toEqual({ ...legendSwatch('strip'), fill: LIGHT.baselineColor, dash: null });
  });

  it('the dark export theme resolves the dark colours; no var() is left', () => {
    const legend = buildLegendPart(ITEMS, opts({ theme: DARK }));
    expect(legend.items[0]?.swatch.fill).toBe(DARK.todayColor);
    expect(legend.items[3]?.swatch.fill).toBe(DARK.criticalColor);
    expect(JSON.stringify(legend)).not.toContain('var(');
  });

  it('no items: the title alone on one line', () => {
    const legend = buildLegendPart([], opts());
    expect(legend.items).toEqual([]);
    expect(legend.title?.text).toBe('LEGEND');
    expect(legend.height).toBe(L.border + 2 * L.padY + L.lineHeight);
  });
});

describe('buildLegendPart: title', () => {
  it('null draws no title: the first item starts at the padding', () => {
    const legend = buildLegendPart(ITEMS, opts({ title: null }));
    expect(legend.title).toBeNull();
    expect(legend.items[0]?.x).toBe(L.padX);
  });

  it('the chart label, uppercased in its locale', () => {
    expect(buildLegendPart(ITEMS, opts({ title: 'Légende', locale: 'fr' })).title?.text).toBe('LÉGENDE');
    expect(buildLegendPart(ITEMS, opts({ title: 'iz', locale: 'tr' })).title?.text).toBe('İZ');
  });
});

describe('buildLegendPart: wrapping', () => {
  it('items that do not fit move to the next line, 4 px below', () => {
    // Room for the title and two items on the first line: Freeze and Critical path fit on the
    // second, Baseline goes to a third
    const first = L.padX + TITLE_W + L.itemGap + itemWidth('Today') + L.itemGap + itemWidth('Release');
    const legend = buildLegendPart(ITEMS, opts({ width: first + L.padX + 1 }));
    expect(legend.items.map(i => i.y)).toEqual([TOP, TOP, TOP + LINE, TOP + LINE, TOP + 2 * LINE]);
    expect(legend.items.map(i => i.x)[2]).toBe(L.padX);
    expect(legend.items[3]?.x).toBeCloseTo(L.padX + itemWidth('Freeze') + L.itemGap, 6);
    expect(legend.items[4]?.x).toBe(L.padX);
    expect(legend.height).toBe(L.border + 2 * L.padY + 3 * L.lineHeight + 2 * L.rowGap);
  });

  it('every item stays inside the line, unless it is alone on it', () => {
    for (const width of [80, 160, 240, 320, 480]) {
      const legend = buildLegendPart(ITEMS, opts({ width }));
      for (const item of legend.items) {
        const w = LEAD + estimateTextWidth(item.label.text, L.fontPx);
        if (item.x > L.padX) expect(item.x + w).toBeLessThanOrEqual(width - L.padX + 1e-9);
      }
      const lines = new Set([legend.title?.y, ...legend.items.map(i => i.y)]).size;
      expect(legend.height).toBe(L.border + 2 * L.padY + lines * L.lineHeight + (lines - 1) * L.rowGap);
    }
  });

  it('a narrow strip puts every item on its own line', () => {
    const legend = buildLegendPart(ITEMS, opts({ width: 60 }));
    expect(legend.items.map(i => i.x)).toEqual(ITEMS.map(() => L.padX));
    expect(legend.items.map(i => i.y)).toEqual(ITEMS.map((_, i) => TOP + (i + 1) * LINE));
  });

  it('a label longer than a line is fitted with an ellipsis', () => {
    const label = 'A release annotation with a very long label that never fits in a narrow strip';
    const items = buildLegend({
      showToday: false,
      todayVisible: false,
      annotations: [{ label: { text: label } }],
      labels: DEFAULT_LABELS,
    });
    const legend = buildLegendPart(items, opts({ width: 200, title: null }));
    const text = legend.items[0]?.label.text ?? '';
    expect(text.endsWith('…')).toBe(true);
    expect(LEAD + estimateTextWidth(text, L.fontPx)).toBeLessThanOrEqual(200 - 2 * L.padX);
  });
});
