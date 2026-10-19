// Read-only layout CSS variables (phase 10, D15) and the row under a y (phase 10, 2.6).
import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  computeBarVisual,
  computeRowGeometries,
  filterVisible,
  flattenTree,
  layoutCssVars,
  reindexVisible,
  resolveBarHeight,
  resolveConfig,
  rowIndexAtY,
  type GanttOptions,
  type GanttTask,
} from '../index';

const vars = (options: GanttOptions = {}) => Object.fromEntries(layoutCssVars(resolveConfig(options)));

describe('layoutCssVars', () => {
  it('default config: 36 px rows, 60 % bars (21.6 px, no float noise)', () => {
    expect(layoutCssVars(resolveConfig({}))).toEqual([
      ['--gantt-row-height', '36px'],
      ['--gantt-bar-height', '21.6px'],
    ]);
  });

  it('writes at most 3 decimals (no floating-point noise)', () => {
    // The fallback 60 % of resolveBarHeight is 36 × 0.6 = 21.599999999999998
    expect(resolveBarHeight(undefined, 36)).not.toBe(21.6);
    expect(layoutCssVars({ rowHeight: 36, bar: { ...resolveConfig({}).bar, height: undefined as never } })).toEqual([
      ['--gantt-row-height', '36px'],
      ['--gantt-bar-height', '21.6px'],
    ]);
    expect(vars({ rowHeight: 33.33333 })['--gantt-row-height']).toBe('33.333px');
  });

  it('follows the density unless rowHeight is set', () => {
    expect(vars({ density: 'compact' })).toEqual({ '--gantt-row-height': '28px', '--gantt-bar-height': '16.8px' });
    expect(vars({ density: 'normal' })).toEqual({ '--gantt-row-height': '36px', '--gantt-bar-height': '21.6px' });
    expect(vars({ density: 'comfortable' })).toEqual({
      '--gantt-row-height': '44px',
      '--gantt-bar-height': '26.4px',
    });
    expect(vars({ density: 'compact', rowHeight: 50 })).toEqual({
      '--gantt-row-height': '50px',
      '--gantt-bar-height': '30px',
    });
  });

  it('follows bar.height: px, percentages, and the clamp of resolveBarHeight', () => {
    expect(vars({ bar: { height: 18 } })['--gantt-bar-height']).toBe('18px');
    expect(vars({ bar: { height: '50%' }, rowHeight: 41 })['--gantt-bar-height']).toBe('20.5px');
    expect(vars({ bar: { height: '33.3333%' } })['--gantt-bar-height']).toBe('12px');
    // At most rowHeight − 2, at least 4
    expect(vars({ bar: { height: 80 } })['--gantt-bar-height']).toBe('34px');
    expect(vars({ bar: { height: 1 } })['--gantt-bar-height']).toBe('4px');
  });

  it('is the height of a plain task bar in a default row (computeBarVisual)', () => {
    const tasks: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 2, 10), end: new Date(2026, 2, 14) }];
    for (const options of [
      {},
      { density: 'compact' },
      { bar: { height: '75%' }, rowHeight: 40 },
    ] satisfies GanttOptions[]) {
      const cfg = resolveConfig(options);
      const tl = buildTimeline({ tasks, config: cfg, now: new Date(2026, 2, 11) });
      const [geo] = computeRowGeometries(reindexVisible(filterVisible(flattenTree(tasks, new Set()))), tl, cfg);
      const bar = computeBarVisual({ geo: geo, cfg, toX: tl.toX });
      const v = Object.fromEntries(layoutCssVars(cfg));
      expect(parseFloat(v['--gantt-row-height'])).toBe(geo.height);
      expect(parseFloat(v['--gantt-bar-height'])).toBeCloseTo(bar.height, 3);
    }
  });

  it('only needs rowHeight and bar (a partial config works)', () => {
    expect(layoutCssVars({ rowHeight: 30, bar: resolveConfig({}).bar })).toEqual([
      ['--gantt-row-height', '30px'],
      ['--gantt-bar-height', '18px'],
    ]);
  });
});

describe('rowIndexAtY', () => {
  it('maps a timeline y to the row under it', () => {
    expect(rowIndexAtY(0, 36, 3)).toBe(0);
    expect(rowIndexAtY(35.9, 36, 3)).toBe(0);
    expect(rowIndexAtY(36, 36, 3)).toBe(1);
    expect(rowIndexAtY(107.99, 36, 3)).toBe(2);
  });

  it('is null outside the rows or for bad input', () => {
    expect(rowIndexAtY(108, 36, 3)).toBeNull();
    expect(rowIndexAtY(-0.1, 36, 3)).toBeNull();
    expect(rowIndexAtY(10, 36, 0)).toBeNull();
    expect(rowIndexAtY(Number.NaN, 36, 3)).toBeNull();
    expect(rowIndexAtY(10, 0, 3)).toBeNull();
    expect(rowIndexAtY(10, Number.NaN, 3)).toBeNull();
  });
});
