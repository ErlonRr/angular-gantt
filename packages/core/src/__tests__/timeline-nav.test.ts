// ─────────────────────────────────────────────────────────────
//  Tests — interaction/timeline-nav.ts (bar-to-bar moves, panning)
//  (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  navigateTimeline,
  navigateTimelineKey,
  panScrollLeft,
  type TimelineNavState,
} from '../interaction/timeline-nav';
import { resolveConfig } from '../render/config';
import { buildTimeline, type TimelineModel } from '../render/timeline';
import type { ScaleCell, ScaleTier } from '../render/scales';
import { ViewMode, type GanttTask } from '../types';

const at = (row: number, rowCount = 20): TimelineNavState => ({ row, rowCount });

describe('navigateTimeline', () => {
  it('Up / Down move to the bar of the previous / next row, never wrapping', () => {
    expect(navigateTimeline(at(3), 'move.down')).toEqual({ action: 'move', row: 4 });
    expect(navigateTimeline(at(3), 'move.up')).toEqual({ action: 'move', row: 2 });
    expect(navigateTimeline(at(0), 'move.up')).toEqual({ action: 'none' });
    expect(navigateTimeline(at(19), 'move.down')).toEqual({ action: 'none' });
  });

  it('PageUp / PageDown move by pageSize (default 10), clamped', () => {
    expect(navigateTimeline(at(3), 'move.pageDown')).toEqual({ action: 'move', row: 13 });
    expect(navigateTimeline(at(15), 'move.pageDown')).toEqual({ action: 'move', row: 19 });
    expect(navigateTimeline(at(15), 'move.pageUp', { pageSize: 4 })).toEqual({ action: 'move', row: 11 });
    expect(navigateTimeline(at(2), 'move.pageUp')).toEqual({ action: 'move', row: 0 });
    expect(navigateTimeline(at(0), 'move.pageUp')).toEqual({ action: 'none' });
    expect(navigateTimeline(at(3), 'move.pageDown', { pageSize: 0 })).toEqual({ action: 'move', row: 4 });
  });

  it('Home / End go to the first / last row, with or without Ctrl', () => {
    expect(navigateTimeline(at(7), 'move.home')).toEqual({ action: 'move', row: 0 });
    expect(navigateTimeline(at(7), 'move.end')).toEqual({ action: 'move', row: 19 });
    expect(navigateTimeline(at(7), 'move.home', { toEdge: true })).toEqual({ action: 'move', row: 0 });
    expect(navigateTimeline(at(7), 'move.end', { toEdge: true })).toEqual({ action: 'move', row: 19 });
    expect(navigateTimeline(at(19), 'move.end')).toEqual({ action: 'none' });
  });

  it('Left / Right pan earlier / later', () => {
    expect(navigateTimeline(at(7), 'move.left')).toEqual({ action: 'pan', dir: -1 });
    expect(navigateTimeline(at(7), 'move.right')).toEqual({ action: 'pan', dir: 1 });
    expect(navigateTimeline(at(0, 0), 'move.right')).toEqual({ action: 'pan', dir: 1 });
  });

  it('handles no rows and a stale row', () => {
    expect(navigateTimeline(at(0, 0), 'move.down')).toEqual({ action: 'none' });
    // rows were removed: focus snaps back inside
    expect(navigateTimeline(at(30), 'move.down')).toEqual({ action: 'move', row: 19 });
    expect(navigateTimeline(at(30), 'move.up')).toEqual({ action: 'move', row: 18 });
  });
});

describe('navigateTimelineKey', () => {
  it('maps keys and returns null for keys that are not moves', () => {
    expect(navigateTimelineKey(at(5), { key: 'ArrowDown' })).toEqual({ action: 'move', row: 6 });
    expect(navigateTimelineKey(at(5), { key: 'End', ctrlKey: true })).toEqual({ action: 'move', row: 19 });
    expect(navigateTimelineKey(at(5), { key: 'PageUp' }, { pageSize: 2 })).toEqual({ action: 'move', row: 3 });
    expect(navigateTimelineKey(at(5), { key: 'ArrowLeft' })).toEqual({ action: 'pan', dir: -1 });
    expect(navigateTimelineKey(at(5), { key: 'Enter' })).toBeNull();
    expect(navigateTimelineKey(at(5), { key: ' ' })).toBeNull();
    expect(navigateTimelineKey(at(5), { key: 'F2' })).toBeNull();
    expect(navigateTimelineKey(at(5), { key: 'f' })).toBeNull();
    // Shift / Alt + arrows belong to keyboard edit (move mode)
    expect(navigateTimelineKey(at(5), { key: 'ArrowLeft', shiftKey: true })).toBeNull();
    expect(navigateTimelineKey(at(5), { key: 'ArrowRight', altKey: true })).toBeNull();
  });
});

/** A timeline whose bottom tier has cells starting at `xs` and ending at `totalWidth`. */
function cellsAt(xs: number[], totalWidth: number): Pick<TimelineModel, 'tiers' | 'totalWidth' | 'pxPerDay'> {
  const day = new Date(2026, 0, 1);
  const cells: ScaleCell[] = xs.map((x, i) => ({
    start: day,
    end: day,
    x,
    width: (xs[i + 1] ?? totalWidth) - x,
    label: '',
    isCurrent: false,
  }));
  const top: ScaleTier = { unit: 'month', step: 1, y: 0, height: 28, align: 'start', cells: [] };
  const bottom: ScaleTier = { unit: 'day', step: 1, y: 28, height: 24, align: 'center', cells };
  return { tiers: [top, bottom], totalWidth, pxPerDay: 40 };
}

describe('panScrollLeft', () => {
  // Cells every 100 px over 1000 px, viewport 300 px: scrollLeft ∈ [0, 700]
  const tl = cellsAt([0, 100, 200, 300, 400, 500, 600, 700, 800, 900], 1000);

  it('moves one cell later / earlier from an aligned position', () => {
    expect(panScrollLeft(tl, 200, 300, 1)).toBe(300);
    expect(panScrollLeft(tl, 200, 300, -1)).toBe(100);
  });

  it('from inside a cell, aligns to the next cell / to the start of the cell', () => {
    expect(panScrollLeft(tl, 250, 300, 1)).toBe(300);
    expect(panScrollLeft(tl, 250, 300, -1)).toBe(200);
  });

  it('skips a boundary less than 1 px away (fractional scroll positions never stall)', () => {
    expect(panScrollLeft(tl, 299.6, 300, 1)).toBe(400);
    expect(panScrollLeft(tl, 300.4, 300, -1)).toBe(200);
    expect(panScrollLeft(tl, 299, 300, 1)).toBe(300);
    expect(panScrollLeft(tl, 301, 300, -1)).toBe(300);
  });

  it('is clamped to [0, totalWidth − viewportWidth]', () => {
    expect(panScrollLeft(tl, 0, 300, -1)).toBe(0);
    expect(panScrollLeft(tl, 650, 300, 1)).toBe(700);
    expect(panScrollLeft(tl, 700, 300, 1)).toBe(700);
    expect(panScrollLeft(tl, 5000, 300, -1)).toBe(600);
    expect(panScrollLeft(tl, -50, 300, 1)).toBe(100);
    // the whole timeline fits: nothing to pan
    expect(panScrollLeft(tl, 0, 1200, 1)).toBe(0);
  });

  it('works with uneven cells (months) and without header cells (one day)', () => {
    const months = cellsAt([0, 310, 590, 900], 1200);
    expect(panScrollLeft(months, 0, 400, 1)).toBe(310);
    expect(panScrollLeft(months, 310, 400, 1)).toBe(590);
    expect(panScrollLeft(months, 590, 400, -1)).toBe(310);
    expect(panScrollLeft(months, 700, 400, 1)).toBe(800);
    const bare = { tiers: [], totalWidth: 1000, pxPerDay: 40 };
    expect(panScrollLeft(bare, 100, 300, 1)).toBe(140);
    expect(panScrollLeft(bare, 100, 300, -1)).toBe(60);
  });

  it('steps one day on a real day-scale timeline', () => {
    const tasks: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 3, 20) }];
    const config = resolveConfig({ viewMode: ViewMode.Day, showToday: false });
    const timeline = buildTimeline({ tasks, config, now: new Date(2026, 2, 10) });
    const cells = timeline.tiers.at(-1)?.cells ?? [];
    const third = cells[3]?.x ?? NaN;
    expect(panScrollLeft(timeline, cells[2]?.x ?? NaN, 400, 1)).toBe(third);
    expect(panScrollLeft(timeline, third, 400, -1)).toBe(cells[2]?.x);
    expect(third - (cells[2]?.x ?? 0)).toBe(Math.round(timeline.pxPerDay));
  });
});
