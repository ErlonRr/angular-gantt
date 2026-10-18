// ─────────────────────────────────────────────────────────────
//  Tests — zoom gestures and the fit-to-screen level (render/zoom.ts)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  FIT_MARGIN,
  PINCH_ZOOM_RATIO,
  WHEEL_LINE_DELTA,
  WHEEL_PAGE_DELTA,
  WHEEL_ZOOM_DELTA,
  fitMargin,
  fitZoomLevel,
  initialWheelZoomState,
  pinchZoomSteps,
  wheelZoom,
  type WheelZoomState,
} from '../render/zoom';
import { fitScrollLeft, anchoredScrollLeft } from '../render/viewport';
import { DEFAULT_ZOOM_LEVELS, zoomStep } from '../render/scales';
import { buildTimeline } from '../render/timeline';
import { resolveConfig } from '../render/config';
import type { GanttTask, GanttZoomLevel } from '../types';

const PIXEL = 0;
const LINE = 1;
const PAGE = 2;

/** Feed a list of `deltaY`s through `wheelZoom`; the total steps and the final state. */
const feed = (deltas: number[], mode = PIXEL, from: WheelZoomState = initialWheelZoomState()) => {
  let state = from;
  let steps = 0;
  for (const d of deltas) {
    const r = wheelZoom(state, d, mode);
    state = r.state;
    steps += r.steps;
  }
  return { state, steps };
};

describe('zoom constants', () => {
  it('match the plan (D16)', () => {
    expect(WHEEL_ZOOM_DELTA).toBe(100);
    expect(PINCH_ZOOM_RATIO).toBe(1.25);
    expect(FIT_MARGIN).toBe(32);
    // A Firefox notch (3 lines) and a page are one level each
    expect(Math.trunc((3 * WHEEL_LINE_DELTA) / WHEEL_ZOOM_DELTA)).toBe(1);
    expect(WHEEL_PAGE_DELTA).toBe(WHEEL_ZOOM_DELTA);
  });
});

// ─── wheelZoom ────────────────────────────────────────────────

describe('wheelZoom', () => {
  it('zooms one level per 100 px; negative deltaY zooms in', () => {
    expect(wheelZoom(initialWheelZoomState(), -100, PIXEL)).toEqual({ state: { delta: 0 }, steps: 1 });
    expect(wheelZoom(initialWheelZoomState(), 100, PIXEL)).toEqual({ state: { delta: 0 }, steps: -1 });
    expect(wheelZoom(initialWheelZoomState(), -120, PIXEL)).toEqual({ state: { delta: -20 }, steps: 1 });
  });

  it('accumulates small deltas (trackpad pinch arrives as many small Ctrl+wheel events)', () => {
    const a = wheelZoom(initialWheelZoomState(), -40, PIXEL);
    expect(a.steps).toBe(0);
    const b = wheelZoom(a.state, -40, PIXEL);
    expect(b.steps).toBe(0);
    const c = wheelZoom(b.state, -40, PIXEL);
    expect(c).toEqual({ state: { delta: -20 }, steps: 1 });
    // 50 events of -4.2 px = 210 px → exactly 2 steps
    const r = feed(Array.from({ length: 50 }, () => -4.2));
    expect(r.steps).toBe(2);
    expect(r.state.delta).toBeCloseTo(-10, 9);
  });

  it('turns a large delta into several steps and keeps the remainder', () => {
    expect(wheelZoom(initialWheelZoomState(), -250, PIXEL)).toEqual({ state: { delta: -50 }, steps: 2 });
    expect(wheelZoom(initialWheelZoomState(), 340, PIXEL)).toEqual({ state: { delta: 40 }, steps: -3 });
  });

  it('normalises line and page deltaMode', () => {
    // Firefox mouse wheel: 3 lines a notch
    expect(wheelZoom(initialWheelZoomState(), -3, LINE)).toEqual({ state: { delta: -20 }, steps: 1 });
    expect(feed([3, 3, 3, 3, 3], LINE).steps).toBe(-6);
    expect(wheelZoom(initialWheelZoomState(), -1, PAGE)).toEqual({ state: { delta: 0 }, steps: 1 });
    expect(wheelZoom(initialWheelZoomState(), 2, PAGE).steps).toBe(-2);
    // Unknown modes count as pixels
    expect(wheelZoom(initialWheelZoomState(), -100, 7).steps).toBe(1);
  });

  it('drops the leftover when the direction reverses', () => {
    const a = wheelZoom(initialWheelZoomState(), -60, PIXEL);
    const b = wheelZoom(a.state, 30, PIXEL);
    expect(b).toEqual({ state: { delta: 30 }, steps: 0 });
    expect(wheelZoom(b.state, 70, PIXEL)).toEqual({ state: { delta: 0 }, steps: -1 });
  });

  it('ignores zero and non-finite deltas (same state object)', () => {
    const state = { delta: -30 };
    for (const d of [0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = wheelZoom(state, d, PIXEL);
      expect(r.state).toBe(state);
      expect(r.steps).toBe(0);
    }
    // A corrupt accumulator restarts
    expect(wheelZoom({ delta: Number.NaN }, -100, PIXEL)).toEqual({ state: { delta: 0 }, steps: 1 });
  });

  it('never returns -0 and keeps the accumulator under one step', () => {
    const r = wheelZoom(initialWheelZoomState(), 50, PIXEL);
    expect(Object.is(r.steps, 0)).toBe(true);
    const s = feed([-17, -33, -71, -5, -99, -100, -1, -250]);
    expect(Math.abs(s.state.delta)).toBeLessThan(WHEEL_ZOOM_DELTA);
    expect(s.steps).toBe(Math.trunc(576 / WHEEL_ZOOM_DELTA));
  });
});

// ─── pinchZoomSteps ───────────────────────────────────────────

describe('pinchZoomSteps', () => {
  it('steps at ×1.25: spread zooms in, pinch zooms out', () => {
    expect(pinchZoomSteps(100, 100, 0)).toBe(0);
    expect(pinchZoomSteps(100, 124, 0)).toBe(0);
    expect(pinchZoomSteps(100, 125, 0)).toBe(1);
    expect(pinchZoomSteps(100, 156.25, 0)).toBe(2);
    expect(pinchZoomSteps(100, 81, 0)).toBe(0);
    expect(pinchZoomSteps(100, 80, 0)).toBe(-1);
    expect(pinchZoomSteps(100, 64, 0)).toBe(-2);
  });

  it('returns only the steps not applied yet', () => {
    expect(pinchZoomSteps(100, 125, 1)).toBe(0);
    expect(pinchZoomSteps(100, 160, 1)).toBe(1);
    expect(pinchZoomSteps(100, 64, -1)).toBe(-1);
  });

  it('does not flip between two levels on a boundary (one step of hysteresis)', () => {
    // Stepped in at ×1.25: hovering just under it stays, back at ×1 steps out
    expect(pinchZoomSteps(100, 124, 1)).toBe(0);
    expect(pinchZoomSteps(100, 101, 1)).toBe(0);
    expect(pinchZoomSteps(100, 100, 1)).toBe(-1);
    // Stepped out at ×0.8: back in only at ×1
    expect(pinchZoomSteps(100, 81, -1)).toBe(0);
    expect(pinchZoomSteps(100, 100, -1)).toBe(1);
  });

  it('adds up over a whole gesture and returns to zero', () => {
    let applied = 0;
    const move = (d: number) => {
      applied += pinchZoomSteps(100, d, applied);
    };
    for (let d = 100; d <= 300; d += 3) move(d);
    expect(applied).toBe(Math.floor(Math.log(298 / 100) / Math.log(PINCH_ZOOM_RATIO)));
    for (let d = 300; d >= 100; d -= 3) move(d);
    move(100);
    expect(applied).toBe(0);
  });

  it('takes a custom ratio', () => {
    expect(pinchZoomSteps(100, 199, 0, 2)).toBe(0);
    expect(pinchZoomSteps(100, 200, 0, 2)).toBe(1);
    expect(pinchZoomSteps(100, 25, 0, 2)).toBe(-2);
  });

  it('ignores unusable distances and ratios, and never returns -0', () => {
    for (const [d0, d] of [
      [0, 100],
      [100, 0],
      [-100, 100],
      [Number.NaN, 100],
      [100, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(pinchZoomSteps(d0, d, 0)).toBe(0);
    }
    expect(pinchZoomSteps(100, 200, 0, 1)).toBe(0);
    expect(pinchZoomSteps(100, 200, 0, Number.NaN)).toBe(0);
    expect(Object.is(pinchZoomSteps(100, 90, 0), 0)).toBe(true);
    // A non-finite `applied` counts as 0
    expect(pinchZoomSteps(100, 125, Number.NaN)).toBe(1);
  });
});

// ─── fitMargin / fitZoomLevel ─────────────────────────────────

describe('fitMargin', () => {
  it('is FIT_MARGIN, at most a quarter of the viewport, never negative', () => {
    expect(fitMargin(800)).toBe(FIT_MARGIN);
    expect(fitMargin(80)).toBe(20);
    expect(fitMargin(800, 10)).toBe(10);
    expect(fitMargin(800, -5)).toBe(0);
    expect(fitMargin(800, Number.NaN)).toBe(FIT_MARGIN);
    expect(fitMargin(0)).toBe(FIT_MARGIN);
    expect(fitMargin(Number.NaN, 12)).toBe(12);
  });
});

describe('fitZoomLevel', () => {
  const levels = DEFAULT_ZOOM_LEVELS;
  const span = (days: number, from = new Date(2026, 4, 4)) => ({
    start: from,
    end: new Date(from.getFullYear(), from.getMonth(), from.getDate() + days),
  });

  it('picks the finest built-in level whose extent plus margins fits', () => {
    // 30 days: Day 1440 px > 936; Week 600 px fits
    expect(fitZoomLevel({ levels, extent: span(30), viewportWidth: 1000 })).toBe('Week');
    // 10 days: Hour 9600 px is too wide; Day 480 px fits
    expect(fitZoomLevel({ levels, extent: span(10), viewportWidth: 1000 })).toBe('Day');
    // 12 hours at the Hour level: 480 px
    const half = { start: new Date(2026, 4, 4, 6), end: new Date(2026, 4, 4, 18) };
    expect(fitZoomLevel({ levels, extent: half, viewportWidth: 1000 })).toBe('Hour');
    // 2 years: Quarter 2920 px > 1000 - 64; Year 1460 px too; → coarsest
    expect(fitZoomLevel({ levels, extent: span(730), viewportWidth: 1000 })).toBe('Year');
    // 1 year: Year 730 px fits
    expect(fitZoomLevel({ levels, extent: span(365), viewportWidth: 1000 })).toBe('Year');
    // A milestone (zero width) fits the finest level
    expect(fitZoomLevel({ levels, extent: span(0), viewportWidth: 1000 })).toBe('Hour');
  });

  it('falls back to the coarsest level when nothing fits', () => {
    expect(fitZoomLevel({ levels, extent: span(3650), viewportWidth: 400 })).toBe('Year');
  });

  it('does not depend on the order of the levels', () => {
    const reversed = [...levels].reverse();
    for (const days of [0, 3, 10, 30, 120, 365, 3650]) {
      expect(fitZoomLevel({ levels: reversed, extent: span(days), viewportWidth: 900 })).toBe(
        fitZoomLevel({ levels, extent: span(days), viewportWidth: 900 }),
      );
    }
  });

  it('counts the margin on both sides, inclusive at the boundary', () => {
    const one: GanttZoomLevel[] = [
      { name: 'fine', pxPerDay: 10, scales: [{ unit: 'day' }] },
      { name: 'coarse', pxPerDay: 1, scales: [{ unit: 'month' }] },
    ];
    // 30 days × 10 px = 300 px + 2 × 32
    expect(fitZoomLevel({ levels: one, extent: span(30), viewportWidth: 364 })).toBe('fine');
    expect(fitZoomLevel({ levels: one, extent: span(30), viewportWidth: 363 })).toBe('coarse');
    expect(fitZoomLevel({ levels: one, extent: span(30), viewportWidth: 320, margin: 10 })).toBe('fine');
    expect(fitZoomLevel({ levels: one, extent: span(30), viewportWidth: 319, margin: 10 })).toBe('coarse');
  });

  it('caps the margin at a quarter of a narrow viewport', () => {
    const one: GanttZoomLevel[] = [
      { name: 'fine', pxPerDay: 10, scales: [{ unit: 'day' }] },
      { name: 'coarse', pxPerDay: 1, scales: [{ unit: 'month' }] },
    ];
    // 6 days = 60 px; viewport 120 → margin 30 each side → 60 px of room
    expect(fitZoomLevel({ levels: one, extent: span(6), viewportWidth: 120 })).toBe('fine');
    expect(fitZoomLevel({ levels: one, extent: span(6), viewportWidth: 119 })).toBe('coarse');
  });

  it('reads custom levels through their px per day (cellWidth too); ties keep the first', () => {
    const custom: GanttZoomLevel[] = [
      { name: 'sprint', cellWidth: 140, scales: [{ unit: 'week' }] }, // 20 px/day
      { name: 'weeks', pxPerDay: 20, scales: [{ unit: 'week' }] },
      { name: 'months', pxPerDay: 3, scales: [{ unit: 'month' }] },
      { name: 'broken', pxPerDay: 0, cellWidth: 0, scales: [{ unit: 'day' }] },
    ];
    expect(fitZoomLevel({ levels: custom, extent: span(30), viewportWidth: 1000 })).toBe('sprint');
    expect(fitZoomLevel({ levels: custom, extent: span(300), viewportWidth: 1000 })).toBe('months');
  });

  it('measures the extent in local calendar days (DST-independent)', () => {
    // 30 calendar days that contain a DST change in most zones (US March, Lord Howe April / October)
    const one: GanttZoomLevel[] = [
      { name: 'fine', pxPerDay: 960, scales: [{ unit: 'hour' }] },
      { name: 'coarse', pxPerDay: 1, scales: [{ unit: 'month' }] },
    ];
    for (const from of [new Date(2026, 2, 1), new Date(2026, 3, 1), new Date(2026, 9, 1), new Date(2026, 10, 1)]) {
      const extent = span(30, from);
      expect(fitZoomLevel({ levels: one, extent, viewportWidth: 30 * 960 + 64 })).toBe('fine');
      expect(fitZoomLevel({ levels: one, extent, viewportWidth: 30 * 960 + 63 })).toBe('coarse');
    }
  });

  it('is null with nothing to fit or no measurable viewport', () => {
    expect(fitZoomLevel({ levels, extent: null, viewportWidth: 1000 })).toBeNull();
    expect(fitZoomLevel({ levels: [], extent: span(10), viewportWidth: 1000 })).toBeNull();
    for (const viewportWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fitZoomLevel({ levels, extent: span(10), viewportWidth })).toBeNull();
    }
    const broken: GanttZoomLevel[] = [{ name: 'broken', pxPerDay: 0, cellWidth: 0, scales: [{ unit: 'day' }] }];
    expect(fitZoomLevel({ levels: broken, extent: span(10), viewportWidth: 1000 })).toBeNull();
  });
});

// ─── fitToScreen end to end ───────────────────────────────────

describe('fit to screen (fitZoomLevel → timeline at that level → fitScrollLeft)', () => {
  const now = new Date(2026, 4, 1);
  const cases: { name: string; tasks: GanttTask[]; vw: number }[] = [
    {
      name: 'a quarter',
      vw: 1000,
      tasks: [
        { id: 'a', name: 'A', start: new Date(2026, 0, 12), end: new Date(2026, 1, 20) },
        { id: 'b', name: 'B', start: new Date(2026, 1, 2), end: new Date(2026, 2, 27) },
      ],
    },
    {
      name: 'a few days across DST',
      vw: 900,
      tasks: [
        { id: 'a', name: 'A', start: new Date(2026, 2, 6), end: new Date(2026, 2, 10) },
        { id: 'b', name: 'B', start: new Date(2026, 3, 3), end: new Date(2026, 3, 7) },
      ],
    },
    {
      name: 'an afternoon',
      vw: 700,
      tasks: [{ id: 'a', name: 'A', start: new Date(2026, 9, 4, 13), end: new Date(2026, 9, 4, 17) }],
    },
    {
      name: 'date-only ISO values',
      vw: 800,
      tasks: [{ id: 'a', name: 'A', start: new Date('2026-06-01'), end: new Date('2026-06-20') }],
    },
  ];

  for (const c of cases) {
    it(`shows every task: ${c.name}`, () => {
      const current = buildTimeline({
        tasks: c.tasks,
        config: resolveConfig({ viewMode: 'Month' }),
        viewportWidth: c.vw,
        now,
      });
      const config = resolveConfig({ viewMode: 'Month' });
      const level = fitZoomLevel({ levels: config.zoomLevels, extent: current.extent, viewportWidth: c.vw });
      expect(level).not.toBeNull();
      const fitted = buildTimeline({
        tasks: c.tasks,
        config: resolveConfig({ viewMode: level! }),
        viewportWidth: c.vw,
        now,
      });
      const left = fitScrollLeft(fitted, c.vw)!;
      const extent = fitted.extent!;
      expect(fitted.toX(extent.start) - left).toBeGreaterThanOrEqual(0);
      expect(fitted.toX(extent.end) - left).toBeLessThanOrEqual(c.vw);
      // …and one level finer would not have fitted
      const finer = zoomStep(config.zoomLevels, level!, -1);
      if (finer !== level) {
        const f = buildTimeline({
          tasks: c.tasks,
          config: resolveConfig({ viewMode: finer }),
          viewportWidth: c.vw,
          now,
        });
        expect(f.toX(f.extent!.end) - f.toX(f.extent!.start) + 2 * fitMargin(c.vw)).toBeGreaterThan(c.vw);
      }
    });
  }

  it('wheel steps applied through zoomStep keep the pointer date (anchoredScrollLeft)', () => {
    const tasks = cases[0].tasks;
    const at = (viewMode: string) =>
      buildTimeline({ tasks, config: resolveConfig({ viewMode }), viewportWidth: 800, now });
    const { steps } = wheelZoom(initialWheelZoomState(), -3, LINE);
    expect(steps).toBe(1);
    const levelsList = resolveConfig().zoomLevels;
    // `steps > 0` zooms in: towards index 0 of the (finest-first) levels
    const target = zoomStep(levelsList, 'Week', steps > 0 ? -1 : 1);
    expect(target).toBe('Day');
    const prev = at('Week');
    const next = at(target);
    const pointer = 610;
    const x = anchoredScrollLeft(prev, next, 200, 800, pointer)!;
    const before = prev.toDate(200 + pointer).getTime();
    const after = next.toDate(x + pointer).getTime();
    // within half a pixel at the new level
    expect(Math.abs(after - before)).toBeLessThanOrEqual(3_600_000 * (12 / next.pxPerDay) + 1);
  });
});
