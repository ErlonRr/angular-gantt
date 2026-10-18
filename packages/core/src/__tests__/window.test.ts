// ─────────────────────────────────────────────────────────────
//  Tests — horizontal windowing over the timeline (render/window.ts)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  bandsInRange,
  computeHorizontalWindow,
  linesInRange,
  sameHorizontalWindow,
  tiersInRange,
} from '../render/window';
import { buildTimeline, type TimeBand, type TimelineModel } from '../render/timeline';
import type { ScaleCell, ScaleTier } from '../render/scales';
import { resolveConfig } from '../render/config';
import type { GanttTask } from '../types';

// ─── Synthetic models ─────────────────────────────────────────

const cell = (x: number, width: number, i = 0): ScaleCell => ({
  start: new Date(2026, 0, 1 + i),
  end: new Date(2026, 0, 2 + i),
  x,
  width,
  label: String(i),
  isCurrent: false,
});

/** `n` contiguous cells of `width` px starting at x = 0. */
const tier = (n: number, width: number, y = 0): ScaleTier => ({
  unit: 'day',
  step: 1,
  y,
  height: 28,
  align: 'center',
  cells: Array.from({ length: n }, (_, i) => cell(i * width, width, i)),
});

const band = (x: number, width: number, kind: TimeBand['kind'] = 'weekend'): TimeBand => ({
  x,
  width,
  kind,
  paint: '#eee',
});

// Brute-force references
const refCells = (cells: ScaleCell[], x0: number, x1: number) =>
  x1 > x0 ? cells.filter(c => c.x < x1 && c.x + c.width > x0) : [];
const refBands = (bands: TimeBand[], x0: number, x1: number) =>
  x1 > x0 ? bands.filter(b => b.x < x1 && b.x + b.width > x0) : [];
const refLines = (xs: number[], x0: number, x1: number) => (x1 > x0 ? xs.filter(x => x >= x0 && x <= x1) : []);
/** `firstCell` expected for a brute-force hit list. */
const refFirst = (cells: ScaleCell[], hits: ScaleCell[]) => (hits[0] ? cells.indexOf(hits[0]) : 0);

// ─── tiersInRange ─────────────────────────────────────────────

describe('tiersInRange', () => {
  const tl = { tiers: [tier(10, 70, 0), tier(70, 10, 32)] };

  it('keeps the tiers and only the intersecting cells (same objects)', () => {
    const [upper, lower] = tiersInRange(tl, 75, 145);
    expect(upper?.cells.map(c => c.x)).toEqual([70, 140]);
    expect(upper?.firstCell).toBe(1);
    expect(upper?.cells[0]).toBe(tl.tiers[0]?.cells[1]);
    expect(lower?.cells.map(c => c.x)).toEqual([70, 80, 90, 100, 110, 120, 130, 140]);
    expect(lower?.firstCell).toBe(7);
    expect({ ...upper, cells: undefined, firstCell: undefined }).toEqual({
      ...tl.tiers[0],
      cells: undefined,
      firstCell: undefined,
    });
  });

  it('does not mutate the timeline', () => {
    tiersInRange(tl, 75, 145);
    expect(tl.tiers[0]?.cells).toHaveLength(10);
  });

  it('skips cells that only touch an edge', () => {
    const [upper] = tiersInRange(tl, 140, 210);
    expect(upper?.cells.map(c => c.x)).toEqual([140]);
  });

  it('keeps a cell containing the whole range', () => {
    const [upper] = tiersInRange(tl, 141, 142);
    expect(upper?.cells.map(c => c.x)).toEqual([140]);
  });

  it('returns empty cells for empty, reversed and out-of-bounds ranges', () => {
    for (const [x0, x1] of [
      [100, 100],
      [200, 100],
      [-50, 0],
      [700, 900],
      [Number.NaN, 100],
    ] as const) {
      const out = tiersInRange(tl, x0, x1);
      expect(out).toHaveLength(2);
      expect(out.every(t => t.cells.length === 0 && t.firstCell === 0)).toBe(true);
    }
  });

  it('handles tiers without cells and timelines without tiers', () => {
    expect(tiersInRange({ tiers: [tier(0, 10)] }, 0, 100)[0]?.cells).toEqual([]);
    expect(tiersInRange({ tiers: [] }, 0, 100)).toEqual([]);
  });

  it('falls back to a linear scan for out-of-order cells', () => {
    const t = tier(5, 10);
    const cells = [t.cells[0], t.cells[3], t.cells[1], t.cells[2], t.cells[4]].filter(c => c !== undefined);
    const [out] = tiersInRange({ tiers: [{ ...t, cells }] }, 15, 35);
    expect(out?.cells.map(c => c.x)).toEqual([30, 10, 20]);
    expect(out?.firstCell).toBe(1);
  });

  it('matches a brute-force filter for many ranges', () => {
    const t = tier(200, 13);
    for (let x0 = -20; x0 < 2700; x0 += 37) {
      for (const w of [0, 1, 12, 13, 14, 250]) {
        const [out] = tiersInRange({ tiers: [t] }, x0, x0 + w);
        const ref = refCells(t.cells, x0, x0 + w);
        expect(out?.cells).toEqual(ref);
        expect(out?.firstCell).toBe(refFirst(t.cells, ref));
      }
    }
  });
});

// ─── bandsInRange ─────────────────────────────────────────────

describe('bandsInRange', () => {
  it('returns the intersecting bands of a sorted list', () => {
    const bands = [band(0, 20), band(70, 20), band(140, 20), band(210, 20)];
    expect(bandsInRange({ bands }, 80, 145)).toEqual([bands[1], bands[2]]);
    expect(bandsInRange({ bands }, 90, 140)).toEqual([]); // both edges only touch
    expect(bandsInRange({ bands }, 0, 1000)).toEqual(bands);
  });

  it('handles unsorted and overlapping bands, keeping the painting order', () => {
    // Day-level bands, then intensive hours and hour highlights appended out of order
    const bands = [
      band(0, 100, 'custom'), // a whole-day highlight
      band(0, 30, 'off-hours'),
      band(80, 20, 'off-hours'),
      band(40, 10, 'intensive'),
      band(200, 100, 'weekend'),
      band(5, 5, 'custom'),
      band(60, 5, 'custom'),
    ];
    const out = bandsInRange({ bands }, 45, 85);
    expect(out).toEqual([bands[0], bands[2], bands[3], bands[6]]);
    for (let x0 = -10; x0 < 320; x0 += 7) {
      for (const w of [0, 1, 5, 30, 400]) {
        expect(bandsInRange({ bands }, x0, x0 + w)).toEqual(refBands(bands, x0, x0 + w));
      }
    }
  });

  it('finds a wide early band that spans past later short ones', () => {
    const bands = [band(0, 1000), band(10, 5), band(20, 5), band(30, 5)];
    expect(bandsInRange({ bands }, 500, 600)).toEqual([bands[0]]);
  });

  it('returns nothing for empty inputs and ranges', () => {
    expect(bandsInRange({ bands: [] }, 0, 100)).toEqual([]);
    const bands = [band(0, 50)];
    expect(bandsInRange({ bands }, 10, 10)).toEqual([]);
    expect(bandsInRange({ bands }, 30, 10)).toEqual([]);
    expect(bandsInRange({ bands }, 50, 80)).toEqual([]);
  });
});

// ─── linesInRange ─────────────────────────────────────────────

describe('linesInRange', () => {
  const tl = { majorLines: [100, 200, 300], minorLines: [20, 40, 60, 80, 120, 140, 160, 180, 220] };

  it('keeps lines inside the range, edges included', () => {
    expect(linesInRange(tl, 100, 160)).toEqual({ major: [100], minor: [120, 140, 160] });
    expect(linesInRange(tl, 0, 1000)).toEqual({ major: tl.majorLines, minor: tl.minorLines });
  });

  it('returns nothing for a degenerate range, like the other queries', () => {
    expect(linesInRange(tl, 200, 200)).toEqual({ major: [], minor: [] });
    expect(linesInRange(tl, Number.NaN, 200)).toEqual({ major: [], minor: [] });
  });

  it('returns nothing for reversed or out-of-bounds ranges and empty lists', () => {
    expect(linesInRange(tl, 160, 100)).toEqual({ major: [], minor: [] });
    expect(linesInRange(tl, 301, 900)).toEqual({ major: [], minor: [] });
    expect(linesInRange(tl, -10, 19)).toEqual({ major: [], minor: [] });
    expect(linesInRange({ majorLines: [], minorLines: [] }, 0, 100)).toEqual({ major: [], minor: [] });
  });

  it('falls back to a linear scan for unsorted lines', () => {
    expect(linesInRange({ majorLines: [300, 100, 200], minorLines: [50, 10] }, 100, 200)).toEqual({
      major: [100, 200],
      minor: [],
    });
  });

  it('handles duplicate x values', () => {
    expect(linesInRange({ majorLines: [5, 10, 10, 10, 15], minorLines: [] }, 10, 14).major).toEqual([10, 10, 10]);
  });
});

// ─── Real timelines ───────────────────────────────────────────

describe('windowing a built timeline', () => {
  const tasks: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12) }];
  const now = new Date(2026, 2, 4);

  const check = (tl: TimelineModel) => {
    const step = Math.max(1, Math.floor(tl.totalWidth / 40));
    for (let x0 = -step; x0 <= tl.totalWidth + step; x0 += step) {
      for (const w of [0, 1, step, 3 * step + 7]) {
        const x1 = x0 + w;
        const tiers = tiersInRange(tl, x0, x1);
        tiers.forEach((t, i) => {
          const all = tl.tiers[i]?.cells ?? [];
          const ref = refCells(all, x0, x1);
          expect(t.cells).toEqual(ref);
          expect(t.firstCell).toBe(refFirst(all, ref));
        });
        expect(bandsInRange(tl, x0, x1)).toEqual(refBands(tl.bands, x0, x1));
        expect(linesInRange(tl, x0, x1)).toEqual({
          major: refLines(tl.majorLines, x0, x1),
          minor: refLines(tl.minorLines, x0, x1),
        });
      }
    }
  };

  it('Week view with weekends', () => {
    const config = resolveConfig({ viewMode: 'Week', nonWorkingTime: { weekends: [0, 6] } });
    const tl = buildTimeline({ tasks, config, now });
    expect(tl.bands.length).toBeGreaterThan(0);
    check(tl);
  });

  it('Hour view with working hours, intensive hours and hour highlights (unsorted bands)', () => {
    const config = resolveConfig({
      viewMode: 'Hour',
      nonWorkingTime: {
        weekends: [0, 6],
        workingHours: { start: 9, end: 17 },
        intensiveHours: [{ start: 10, end: 12 }],
      },
      highlightTime: (d, unit) => (unit === 'hour' && d.getHours() === 14 ? { color: '#f00' } : null),
    });
    const tl = buildTimeline({ tasks, config, now });
    const xs = tl.bands.map(b => b.x);
    expect(xs.some((x, i) => i > 0 && x < (xs[i - 1] ?? 0))).toBe(true);
    check(tl);
  });
});

// ─── computeHorizontalWindow ──────────────────────────────────

describe('computeHorizontalWindow', () => {
  it('adds half a viewport of overscan by default and clamps to the timeline', () => {
    expect(computeHorizontalWindow({ scrollLeft: 1000, viewportWidth: 800, totalWidth: 5000 })).toEqual({
      x0: 600,
      x1: 2200,
    });
    expect(computeHorizontalWindow({ scrollLeft: 0, viewportWidth: 800, totalWidth: 1000 })).toEqual({
      x0: 0,
      x1: 1000,
    });
  });

  it('honours an explicit overscan and snaps outwards to the quantum', () => {
    expect(computeHorizontalWindow({ scrollLeft: 1030, viewportWidth: 800, totalWidth: 5000, overscan: 0 })).toEqual({
      x0: 1030,
      x1: 1830,
    });
    expect(
      computeHorizontalWindow({ scrollLeft: 1030, viewportWidth: 800, totalWidth: 5000, overscan: 0, quantum: 256 }),
    ).toEqual({ x0: 1024, x1: 2048 });
  });

  it('never produces a reversed range', () => {
    const w = computeHorizontalWindow({ scrollLeft: 9000, viewportWidth: 800, totalWidth: 5000, overscan: 0 });
    expect(w).toEqual({ x0: 5000, x1: 5000 });
    expect(computeHorizontalWindow({ scrollLeft: 0, viewportWidth: 800, totalWidth: 0 })).toEqual({ x0: 0, x1: 0 });
  });

  it('mounts the whole timeline while the viewport has no measurable width', () => {
    for (const viewportWidth of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeHorizontalWindow({ scrollLeft: 1000, viewportWidth, totalWidth: 5000 })).toEqual({
        x0: 0,
        x1: 5000,
      });
    }
    expect(computeHorizontalWindow({ scrollLeft: 0, viewportWidth: 0, totalWidth: Number.NaN })).toEqual({
      x0: 0,
      x1: 0,
    });
  });

  it('sanitises non-finite scroll, overscan and quantum', () => {
    expect(computeHorizontalWindow({ scrollLeft: Number.NaN, viewportWidth: 800, totalWidth: 5000 })).toEqual({
      x0: 0,
      x1: 1200,
    });
    // NaN overscan → default (half the viewport); NaN / negative quantum → no snapping
    expect(
      computeHorizontalWindow({
        scrollLeft: 1030,
        viewportWidth: 800,
        totalWidth: 5000,
        overscan: Number.NaN,
        quantum: Number.NaN,
      }),
    ).toEqual({ x0: 630, x1: 2230 });
    expect(
      computeHorizontalWindow({ scrollLeft: 1030, viewportWidth: 800, totalWidth: 5000, overscan: 0, quantum: -256 }),
    ).toEqual({ x0: 1030, x1: 1830 });
  });

  it('windows an unmeasured viewport with fallbackWidth when one is given (SSR)', () => {
    for (const viewportWidth of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        computeHorizontalWindow({ scrollLeft: 1000, viewportWidth, totalWidth: 5000, fallbackWidth: 800 }),
      ).toEqual({ x0: 600, x1: 2200 });
    }
    // Same overscan and quantum rules as a measured viewport
    expect(
      computeHorizontalWindow({
        scrollLeft: 1030,
        viewportWidth: 0,
        totalWidth: 5000,
        fallbackWidth: 800,
        overscan: 0,
        quantum: 256,
      }),
    ).toEqual({ x0: 1024, x1: 2048 });
  });

  it('ignores fallbackWidth while the viewport is measurable, and an unusable fallbackWidth', () => {
    expect(
      computeHorizontalWindow({ scrollLeft: 1000, viewportWidth: 400, totalWidth: 5000, fallbackWidth: 800 }),
    ).toEqual(computeHorizontalWindow({ scrollLeft: 1000, viewportWidth: 400, totalWidth: 5000 }));
    for (const fallbackWidth of [undefined, 0, -800, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeHorizontalWindow({ scrollLeft: 1000, viewportWidth: 0, totalWidth: 5000, fallbackWidth })).toEqual({
        x0: 0,
        x1: 5000,
      });
    }
  });

  it('keeps a quantized window equal while the scroll stays inside a chunk', () => {
    const at = (scrollLeft: number) =>
      computeHorizontalWindow({ scrollLeft, viewportWidth: 800, totalWidth: 5000, overscan: 0, quantum: 256 });
    expect(sameHorizontalWindow(at(1030), at(1100))).toBe(true);
    expect(sameHorizontalWindow(at(1030), at(1300))).toBe(false);
    expect(sameHorizontalWindow({ x0: 0, x1: 10 }, { x0: 0, x1: 11 })).toBe(false);
  });
});

// ─── Caches ───────────────────────────────────────────────────

describe('per-array caches', () => {
  it('rebuild when an array grows in place', () => {
    const bands = [band(0, 10), band(20, 10)];
    expect(bandsInRange({ bands }, 0, 100)).toHaveLength(2);
    bands.push(band(5, 10)); // out of order: needs a new index
    expect(bandsInRange({ bands }, 12, 18)).toEqual([bands[2]]);
    const minorLines = [10, 20];
    expect(linesInRange({ majorLines: [], minorLines }, 0, 100).minor).toEqual([10, 20]);
    minorLines.push(5);
    expect(linesInRange({ majorLines: [], minorLines }, 0, 100).minor).toEqual([10, 20, 5]);
  });
});

// ─── Performance ──────────────────────────────────────────────

describe('performance on 50k-cell inputs', () => {
  const N = 50_000;
  const big = {
    tiers: [tier(N / 10, 100, 0), tier(N, 10, 32)],
    bands: Array.from({ length: N }, (_, i) => band(i * 10, 5)),
    majorLines: Array.from({ length: N / 10 }, (_, i) => i * 100),
    minorLines: Array.from({ length: N }, (_, i) => i * 10 + 5),
  };
  // Unsorted bands: every 7th band moved to the end
  const shuffled = {
    bands: [...big.bands.filter((_, i) => i % 7 !== 0), ...big.bands.filter((_, i) => i % 7 === 0)],
  };

  const time = (fn: () => void) => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it('answers a viewport query in under 25 ms', () => {
    // Warm up the JIT and the per-array checks / band indexes (built once per array)
    tiersInRange(big, 0, 1);
    linesInRange(big, 0, 1);
    bandsInRange(big, 0, 1);
    bandsInRange(shuffled, 0, 1);
    const ms = Math.min(
      ...[0, 1, 2].map(() =>
        time(() => {
          const x0 = 250_000;
          const x1 = x0 + 1600;
          const tiers = tiersInRange(big, x0, x1);
          const bands = bandsInRange(big, x0, x1);
          const bands2 = bandsInRange(shuffled, x0, x1);
          const lines = linesInRange(big, x0, x1);
          expect(tiers[1]?.cells).toHaveLength(160);
          expect(bands).toHaveLength(160);
          expect(bands2).toHaveLength(160);
          expect(lines.minor).toHaveLength(160);
        }),
      ),
    );
    expect(ms).toBeLessThan(25);
  });

  it('runs the first (indexing) query on 50k items in under 250 ms', () => {
    const fresh = {
      tiers: big.tiers.map(t => ({ ...t, cells: [...t.cells] })),
      bands: [...shuffled.bands],
      majorLines: [...big.majorLines],
      minorLines: [...big.minorLines],
    };
    expect(
      time(() => {
        tiersInRange(fresh, 0, 100);
        bandsInRange(fresh, 0, 100);
        linesInRange(fresh, 0, 100);
      }),
    ).toBeLessThan(250);
  });
});
