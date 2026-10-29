// ─────────────────────────────────────────────────────────────
//  Tests — legend placement (Phase 9, step 2.6): the in-flow strip at
//  the bottom by default, the end of the toolbar on request (bottom
//  while the toolbar is hidden), nothing when off, empty or in the
//  table view.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, type GanttView } from '../types';
import { resolveConfig } from '../render/config';
import { buildLegend, isLegendVisible, legendPlacement, type LegendPlacementInput } from '../state/legend';
import * as core from '../index';

const items = buildLegend({ showToday: true, todayVisible: true, annotations: [], labels: DEFAULT_LABELS });

const place = (over: Partial<LegendPlacementInput> = {}): ReturnType<typeof legendPlacement> =>
  legendPlacement({ showLegend: true, position: 'bottom', view: 'split', items, toolbarShown: true, ...over });

describe('legendPlacement', () => {
  it('is the bottom strip by default (resolved legend.position)', () => {
    expect(resolveConfig({}).legend.position).toBe('bottom');
    expect(place({ position: resolveConfig({}).legend.position })).toBe('bottom');
  });

  it('goes to the toolbar on request while the toolbar is shown', () => {
    const position = resolveConfig({ legend: { position: 'toolbar' } }).legend.position;
    expect(place({ position })).toBe('toolbar');
    expect(place({ position, view: 'chart' })).toBe('toolbar');
  });

  it('falls back to the bottom while the toolbar is hidden', () => {
    expect(place({ position: 'toolbar', toolbarShown: false })).toBe('bottom');
    expect(place({ position: 'bottom', toolbarShown: false })).toBe('bottom');
  });

  it('is null when off, without entries or in the table view', () => {
    expect(place({ showLegend: false })).toBeNull();
    expect(place({ showLegend: false, position: 'toolbar' })).toBeNull();
    expect(place({ items: [] })).toBeNull();
    expect(place({ view: 'table' })).toBeNull();
    expect(place({ view: 'table', position: 'toolbar' })).toBeNull();
  });

  it('agrees with isLegendVisible for every view and position', () => {
    const views: GanttView[] = ['split', 'table', 'chart'];
    for (const view of views) {
      for (const position of ['bottom', 'toolbar'] as const) {
        for (const toolbarShown of [true, false]) {
          for (const showLegend of [true, false]) {
            for (const list of [items, []]) {
              const got = place({ view, position, toolbarShown, showLegend, items: list });
              expect(got !== null).toBe(isLegendVisible(showLegend, view, list));
              if (got !== null) expect(got).toBe(position === 'toolbar' && toolbarShown ? 'toolbar' : 'bottom');
            }
          }
        }
      }
    }
  });

  it('places a critical-path-only legend too', () => {
    const critical = buildLegend({
      showToday: false,
      todayVisible: false,
      annotations: [],
      labels: DEFAULT_LABELS,
      criticalPath: true,
    });
    expect(place({ items: critical, position: 'toolbar' })).toBe('toolbar');
  });
});

describe('step 2.6 public API', () => {
  it('exports the toolbar, chart-state and legend-placement models from the package root', () => {
    for (const fn of [
      core.buildToolbar,
      core.toolbarItems,
      core.toolbarTabStop,
      core.toolbarFocusMove,
      core.resolveChartState,
      core.skeletonRows,
      core.legendPlacement,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(core.TOOLBAR_ICON_VIEWBOX).toBe('0 0 16 16');
    // + undo / redo (Phase 11), export (Phase 12), resources (Phase 14)
    expect(Object.keys(core.TOOLBAR_ICONS)).toHaveLength(13);
    expect(core.SKELETON_MAX_ROWS).toBeGreaterThan(0);
  });
});
