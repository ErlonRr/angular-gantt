import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS } from '../types';
import { buildLegend, isLegendVisible, legendSwatch, LEGEND_SWATCH_SIZE, type LegendInput } from '../state/legend';

const input = (over: Partial<LegendInput> = {}): LegendInput => ({
  showToday: true,
  todayVisible: true,
  annotations: [],
  labels: DEFAULT_LABELS,
  ...over,
});

describe('buildLegend', () => {
  it('lists the today marker and each annotation, as both painters do today', () => {
    const items = buildLegend(
      input({ annotations: [{ color: '#ff0000', label: { text: 'Release' } }, {}, { label: { text: 'Freeze' } }] }),
    );
    expect(items).toEqual([
      {
        key: 'today',
        paint: 'var(--gantt-today)',
        label: 'Today',
        shape: 'line',
        swatch: legendSwatch('line'),
      },
      {
        key: 'annotation-0',
        paint: '#ff0000',
        label: 'Release',
        shape: 'dashed',
        swatch: legendSwatch('dashed'),
      },
      {
        key: 'annotation-1',
        paint: 'var(--gantt-arrow)',
        label: 'Annotation',
        shape: 'dashed',
        swatch: legendSwatch('dashed'),
      },
      {
        key: 'annotation-2',
        paint: 'var(--gantt-arrow)',
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
        paint: 'var(--gantt-critical)',
        label: 'Critical path',
        shape: 'bar',
        swatch: legendSwatch('bar'),
      },
      {
        key: 'baseline',
        paint: 'var(--gantt-baseline)',
        label: 'Baseline',
        shape: 'strip',
        swatch: legendSwatch('strip'),
      },
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

  it('paints an isToday annotation like the today marker (same as its line)', () => {
    const items = buildLegend(input({ todayVisible: false, annotations: [{ isToday: true, color: '#ff0000' }] }));
    expect(items.map(i => i.paint)).toEqual(['var(--gantt-today)']);
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
