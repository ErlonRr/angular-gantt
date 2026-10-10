import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS } from '../types';
import { resolveTheme } from '../render/theme';
import { buildLegend, isLegendVisible, legendSwatch, LEGEND_SWATCH_SIZE, type LegendInput } from '../state/legend';

const theme = resolveTheme(false);

const input = (over: Partial<LegendInput> = {}): LegendInput => ({
  showToday: true,
  todayVisible: true,
  annotations: [],
  theme,
  labels: DEFAULT_LABELS,
  ...over,
});

describe('buildLegend', () => {
  it('lists the today marker and each annotation, as both painters do today', () => {
    const items = buildLegend(
      input({ annotations: [{ color: '#ff0000', label: { text: 'Release' } }, {}, { label: { text: 'Freeze' } }] }),
    );
    expect(items).toEqual([
      { key: 'today', color: theme.todayColor, label: 'Today', shape: 'line', swatch: legendSwatch('line') },
      { key: 'annotation-0', color: '#ff0000', label: 'Release', shape: 'dashed', swatch: legendSwatch('dashed') },
      {
        key: 'annotation-1',
        color: theme.arrowColor,
        label: 'Annotation',
        shape: 'dashed',
        swatch: legendSwatch('dashed'),
      },
      {
        key: 'annotation-2',
        color: theme.arrowColor,
        label: 'Freeze',
        shape: 'dashed',
        swatch: legendSwatch('dashed'),
      },
    ]);
  });

  it('omits today when it is off or outside the drawn range', () => {
    expect(buildLegend(input({ showToday: false }))).toEqual([]);
    expect(buildLegend(input({ todayVisible: false }))).toEqual([]);
  });

  it('adds a critical-path bar and a baseline strip when enabled, and nothing by default', () => {
    const items = buildLegend(input({ todayVisible: false, criticalPath: true, baseline: true }));
    expect(items).toEqual([
      {
        key: 'critical',
        color: theme.criticalColor,
        label: 'Critical path',
        shape: 'bar',
        swatch: legendSwatch('bar'),
      },
      { key: 'baseline', color: theme.baselineColor, label: 'Baseline', shape: 'strip', swatch: legendSwatch('strip') },
    ]);
    expect(buildLegend(input({ todayVisible: false, criticalPath: false, baseline: false }))).toEqual([]);
    expect(buildLegend(input({ todayVisible: false }))).toEqual([]);
  });

  it('orders today, then annotations, then critical path, then baseline', () => {
    const items = buildLegend(
      input({
        annotations: [{ label: { text: 'Release' } }, { label: { text: 'Freeze' } }],
        criticalPath: true,
        baseline: true,
      }),
    );
    expect(items.map(i => i.key)).toEqual(['today', 'annotation-0', 'annotation-1', 'critical', 'baseline']);
  });

  it('uses overridden labels', () => {
    const labels = { ...DEFAULT_LABELS, today: 'Heute', legendCritical: 'Kritischer Pfad', legendBaseline: undefined };
    const items = buildLegend(input({ labels, criticalPath: true, baseline: true }));
    expect(items.map(i => i.label)).toEqual(['Heute', 'Kritischer Pfad', 'Baseline']);
  });

  it('gives each shape one swatch geometry inside the swatch box', () => {
    for (const shape of ['line', 'dashed', 'bar', 'strip'] as const) {
      const sw = legendSwatch(shape);
      if (sw.kind === 'line') expect(sw.y2).toBeLessThanOrEqual(LEGEND_SWATCH_SIZE.height);
      else expect(sw.x + sw.width).toBeLessThanOrEqual(LEGEND_SWATCH_SIZE.width);
    }
    expect(legendSwatch('dashed')).toMatchObject({ kind: 'line', dash: '3 2' });
    expect(legendSwatch('strip')).toMatchObject({ kind: 'rect', height: 3 });
  });

  it('gives every item a unique key even with duplicate labels', () => {
    const items = buildLegend(input({ annotations: [{ label: { text: 'X' } }, { label: { text: 'X' } }] }));
    expect(new Set(items.map(i => i.key)).size).toBe(items.length);
  });
});

describe('isLegendVisible', () => {
  const items = buildLegend(input());
  it('shows when enabled, not empty, and outside the table view', () => {
    expect(isLegendVisible(true, 'split', items)).toBe(true);
    expect(isLegendVisible(true, 'chart', items)).toBe(true);
    expect(isLegendVisible(false, 'split', items)).toBe(false);
    expect(isLegendVisible(true, 'table', items)).toBe(false);
    expect(isLegendVisible(true, 'split', [])).toBe(false);
  });
});
