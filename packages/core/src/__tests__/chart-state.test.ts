// ─────────────────────────────────────────────────────────────
//  Tests — chart states (Phase 9, step 2.6): precedence error >
//  loading with no rows > empty > ready, the data-source cases, busy /
//  footer flags, and the deterministic loading skeleton.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS } from '../types';
import type { LoadStateSnapshot } from '../interaction/announce';
import {
  SKELETON_INSET,
  SKELETON_MAX_ROWS,
  resolveChartState,
  skeletonRows,
  type ChartState,
  type ChartStateInput,
  type SkeletonInput,
} from '../state/chart-state';

const state = (over: Partial<ChartStateInput> = {}): ChartState =>
  resolveChartState({ loading: false, errorMessage: null, rowCount: 5, source: null, ...over });

const src = (over: Partial<LoadStateSnapshot> = {}): LoadStateSnapshot => ({
  isLoading: false,
  hasMore: true,
  loadedCount: 0,
  ...over,
});

const READY: ChartState = { kind: 'ready', busy: false, title: null, message: null, retry: null, footer: false };

describe('resolveChartState — consumer states', () => {
  it('is ready with rows and nothing else', () => {
    expect(state()).toEqual(READY);
  });

  it('shows the consumer error over everything, with an event Retry', () => {
    const error: ChartState = {
      kind: 'error',
      busy: false,
      title: DEFAULT_LABELS.errorTitle,
      message: 'Server down',
      retry: 'event',
      footer: false,
    };
    expect(state({ errorMessage: 'Server down' })).toEqual(error);
    expect(state({ errorMessage: 'Server down', loading: true, rowCount: 0 })).toEqual(error);
    expect(state({ errorMessage: 'Server down', source: src({ error: true }), rowCount: 0 })).toEqual(error);
    expect(state({ errorMessage: 'Server down', source: src({ isLoading: true }), rowCount: 3 })).toEqual(error);
  });

  it('ignores a null, undefined or blank error message', () => {
    expect(state({ errorMessage: undefined })).toEqual(READY);
    expect(state({ errorMessage: '' })).toEqual(READY);
    expect(state({ errorMessage: '  \n' })).toEqual(READY);
  });

  it('shows the skeleton while loading with no rows, and is busy', () => {
    expect(state({ loading: true, rowCount: 0 })).toEqual({
      kind: 'loading',
      busy: true,
      title: null,
      message: DEFAULT_LABELS.loading,
      retry: null,
      footer: false,
    });
  });

  it('stays ready but busy while the consumer reloads over shown rows', () => {
    expect(state({ loading: true })).toEqual({ ...READY, busy: true });
  });

  it('is empty with no rows and nothing loading', () => {
    expect(state({ rowCount: 0 })).toEqual({
      kind: 'empty',
      busy: false,
      title: null,
      message: DEFAULT_LABELS.emptyState,
      retry: null,
      footer: false,
    });
  });

  it('reads custom labels, falling back to the defaults', () => {
    const labels = { emptyState: 'Nessuna attività', errorTitle: 'Errore' };
    expect(state({ rowCount: 0, labels }).message).toBe('Nessuna attività');
    expect(state({ errorMessage: 'x', labels }).title).toBe('Errore');
    expect(state({ loading: true, rowCount: 0, labels }).message).toBe(DEFAULT_LABELS.loading);
    expect(
      state({ rowCount: 0, source: src({ error: true }), labels: { loadError: 'Pagina non caricata' } }).message,
    ).toBe('Pagina non caricata');
  });
});

describe('resolveChartState — data source', () => {
  it('shows the skeleton while the first page loads', () => {
    expect(state({ rowCount: 0, source: src({ isLoading: true }) })).toMatchObject({
      kind: 'loading',
      busy: true,
      footer: false,
    });
  });

  it('turns a failure with no rows into the error state with a data-source Retry', () => {
    expect(state({ rowCount: 0, source: src({ error: new Error('503') }) })).toEqual({
      kind: 'error',
      busy: false,
      title: DEFAULT_LABELS.errorTitle,
      message: DEFAULT_LABELS.loadError,
      retry: 'dataSource',
      footer: false,
    });
    // `error: true` (the Web Component's snapshot) counts too
    expect(state({ rowCount: 0, source: src({ error: true }) }).retry).toBe('dataSource');
  });

  it('does not count null, undefined or false as a failure', () => {
    for (const error of [null, undefined, false]) {
      expect(state({ rowCount: 0, source: src({ error, hasMore: false }) }).kind).toBe('empty');
    }
  });

  it('prefers the skeleton when a retry is loading again', () => {
    expect(state({ rowCount: 0, source: src({ isLoading: true, error: true }) }).kind).toBe('loading');
  });

  it('keeps paging in the footer once rows are shown, failures included', () => {
    expect(state({ source: src() })).toEqual({ ...READY, footer: true });
    expect(state({ source: src({ isLoading: true }) })).toEqual({ ...READY, footer: true });
    expect(state({ source: src({ error: true }) })).toEqual({ ...READY, footer: true });
    expect(state({ source: src({ hasMore: false, loadedCount: 5 }) })).toEqual({ ...READY, footer: true });
  });

  it('is empty when an exhausted data source loaded no rows', () => {
    expect(state({ rowCount: 0, source: src({ hasMore: false }) })).toMatchObject({ kind: 'empty', footer: false });
  });

  it('stays ready with its footer when a data source with no rows can still load (autoStart off)', () => {
    expect(state({ rowCount: 0, source: src({ hasMore: true }) })).toEqual({ ...READY, footer: true });
  });

  it('never renders the footer without a data source', () => {
    for (const over of [{}, { rowCount: 0 }, { loading: true }, { errorMessage: 'x' }] as Partial<ChartStateInput>[]) {
      expect(state(over).footer).toBe(false);
    }
  });

  it('follows the precedence table', () => {
    const TABLE: [string, Partial<ChartStateInput>, ChartState['kind'], ChartState['retry']][] = [
      ['error beats loading', { errorMessage: 'e', loading: true, rowCount: 0 }, 'error', 'event'],
      ['loading beats a source failure', { loading: true, rowCount: 0, source: src({ error: true }) }, 'loading', null],
      [
        'source failure beats empty',
        { rowCount: 0, source: src({ error: true, hasMore: false }) },
        'error',
        'dataSource',
      ],
      ['empty beats ready', { rowCount: 0 }, 'empty', null],
      ['rows are ready', { rowCount: 1, source: src({ error: true }) }, 'ready', null],
    ];
    for (const [, over, kind, retry] of TABLE) {
      const s = state(over);
      expect([s.kind, s.retry]).toEqual([kind, retry]);
      // Only the error state has a title and a Retry
      expect(s.title !== null).toBe(kind === 'error');
      expect(s.retry !== null).toBe(kind === 'error');
    }
  });
});

describe('skeletonRows', () => {
  const base: SkeletonInput = { viewportHeight: 400, rowHeight: 36, panelWidth: 300, timelineWidth: 800 };

  it('fills the viewport with rows of the row height', () => {
    const rows = skeletonRows(base);
    expect(rows).toHaveLength(Math.ceil(400 / 36));
    rows.forEach((r, i) => {
      expect(r.key).toBe(i);
      expect(r.y).toBe(i * 36);
      expect(r.height).toBe(36);
    });
  });

  it('pins the first rows (deterministic widths)', () => {
    const rows = skeletonRows(base).slice(0, 3);
    expect(rows).toEqual([
      {
        key: 0,
        y: 0,
        height: 36,
        name: { x: 12, y: 13, width: 199, height: 10 },
        bar: { x: 332, y: 10, width: 176, height: 16 },
      },
      {
        key: 1,
        y: 36,
        height: 36,
        name: { x: 12, y: 13, width: 138, height: 10 },
        bar: { x: 412, y: 10, width: 144, height: 16 },
      },
      {
        key: 2,
        y: 72,
        height: 36,
        name: { x: 12, y: 13, width: 177, height: 10 },
        bar: { x: 508, y: 10, width: 240, height: 16 },
      },
    ]);
    expect(skeletonRows(base)).toEqual(skeletonRows({ ...base }));
  });

  it('keeps names inside the panel and bars inside the visible timeline, in whole pixels', () => {
    for (const r of skeletonRows({ viewportHeight: 1000, rowHeight: 44, panelWidth: 257, timelineWidth: 613 })) {
      const { name, bar } = r;
      expect(name).not.toBeNull();
      expect(bar).not.toBeNull();
      expect(name!.x).toBe(SKELETON_INSET);
      expect(name!.x + name!.width).toBeLessThanOrEqual(257 - SKELETON_INSET);
      expect(bar!.x).toBeGreaterThanOrEqual(257);
      expect(bar!.x + bar!.width).toBeLessThanOrEqual(257 + 613);
      for (const b of [name!, bar!]) {
        for (const v of [b.x, b.y, b.width, b.height]) expect(Number.isInteger(v)).toBe(true);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height).toBeLessThanOrEqual(44);
      }
    }
  });

  it('varies the widths from row to row and repeats the pattern', () => {
    const rows = skeletonRows({ ...base, viewportHeight: 36 * 16 });
    const widths = rows.map(r => r.name!.width);
    expect(new Set(widths.slice(0, 8)).size).toBeGreaterThan(4);
    expect(widths.slice(8)).toEqual(widths.slice(0, 8));
    expect(rows.slice(8).map(r => r.bar)).toEqual(rows.slice(0, 8).map(r => r.bar));
  });

  it('draws no bar in the table view and no name in the chart view', () => {
    const table = skeletonRows({ ...base, panelWidth: 1100, timelineWidth: 0 });
    expect(table.every(r => r.bar === null && r.name !== null)).toBe(true);
    const chart = skeletonRows({ ...base, panelWidth: 0, timelineWidth: 1100 });
    expect(chart.every(r => r.name === null && r.bar !== null)).toBe(true);
    expect(chart[0].bar!.x).toBe(Math.round(1100 * 0.04));
    // A panel too narrow for a placeholder
    expect(skeletonRows({ ...base, panelWidth: 30 }).every(r => r.name === null)).toBe(true);
  });

  it('caps very tall viewports and returns nothing without room or row height', () => {
    expect(skeletonRows({ ...base, viewportHeight: 100_000 })).toHaveLength(SKELETON_MAX_ROWS);
    expect(skeletonRows({ ...base, viewportHeight: 0 })).toEqual([]);
    expect(skeletonRows({ ...base, rowHeight: 0 })).toEqual([]);
    expect(skeletonRows({ ...base, viewportHeight: Number.NaN })).toEqual([]);
    // A partial last row still gets a placeholder
    expect(skeletonRows({ ...base, viewportHeight: 37 })).toHaveLength(2);
  });

  it('scales the blocks with the row height', () => {
    const [compact] = skeletonRows({ ...base, rowHeight: 24 });
    const [tall] = skeletonRows({ ...base, rowHeight: 56 });
    expect(compact.bar!.height).toBe(11);
    expect(compact.name!.height).toBe(7);
    expect(tall.bar!.height).toBe(25);
    expect(tall.name!.height).toBe(10);
    expect(tall.bar!.y).toBe(Math.round((56 - 25) / 2));
  });
});
