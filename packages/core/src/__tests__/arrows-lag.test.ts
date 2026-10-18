// Arrow lag label font and dash, and the hatch pattern: geometry both painters used to repeat.
import { describe, it, expect } from 'vitest';
import {
  ARROW_DASH,
  DependencyType,
  HATCH_PATTERN,
  PAINTS,
  computeArrowVisual,
  resolveConfig,
  type BarVisual,
} from '../index';

const cfg = resolveConfig({});
// `computeArrowVisual` reads only the bar box and its centre line
const bar = (x: number, width: number, cy: number) => ({ x, width, cy }) as BarVisual;
const from = bar(0, 100, 20);
const to = bar(200, 80, 60);
const rows = { fromTop: 0, fromBottom: 40 };

describe('arrow lag label and dash', () => {
  it('a link without lag is solid and has no label', () => {
    const a = computeArrowVisual(from, to, { type: DependencyType.FS }, cfg, rows);
    expect(a.dashed).toBe(false);
    expect(a.dash).toBeNull();
    expect(a.lagLabel).toBeNull();
  });

  it("a lag or lead is dashed '5 3' and labelled at the font size − 2 (default 12 → 10)", () => {
    expect(ARROW_DASH).toBe('5 3');
    const lag = computeArrowVisual(from, to, { lag: 2 }, cfg, rows);
    expect(lag.dashed).toBe(true);
    expect(lag.dash).toBe('5 3');
    expect(lag.lagLabel).toEqual({ text: '+2d', x: 100 + cfg.arrows.offset + 4, y: 40, fontPx: 10 });
    const lead = computeArrowVisual(from, to, { lag: -1 }, cfg, rows, false, 13);
    expect(lead.dash).toBe(ARROW_DASH);
    expect(lead.lagLabel).toMatchObject({ text: '-1d', fontPx: 11 });
  });

  it('the font size argument changes only the label font', () => {
    const base = computeArrowVisual(from, to, { type: DependencyType.SS, lag: 3 }, cfg, rows, true);
    const big = computeArrowVisual(from, to, { type: DependencyType.SS, lag: 3 }, cfg, rows, true, 16);
    expect(big.lagLabel!.fontPx).toBe(14);
    expect({ ...big, lagLabel: { ...big.lagLabel!, fontPx: 10 } }).toEqual(base);
  });

  it('every dependency type agrees on dash and label font', () => {
    for (const type of [DependencyType.FS, DependencyType.SS, DependencyType.FF, DependencyType.SF])
      for (const lag of [0, 1, -2]) {
        const a = computeArrowVisual(from, to, { type, lag }, cfg, rows, false, 12);
        expect(a.dash).toBe(lag ? '5 3' : null);
        expect(a.dashed).toBe(lag !== 0);
        expect(a.lagLabel?.fontPx ?? null).toBe(lag ? 10 : null);
      }
  });
});

describe('hatch pattern', () => {
  it("matches the painters' pattern: 6 × 6, rotated 45°, 1.5 px line at 35 %", () => {
    expect(HATCH_PATTERN).toEqual({ size: 6, rotate: 45, strokeWidth: 1.5, strokeOpacity: 0.35 });
    expect(Object.isFrozen(HATCH_PATTERN)).toBe(true);
    expect(PAINTS.hatch).toBe('var(--gantt-text-muted)');
  });
});
