// ─────────────────────────────────────────────────────────────
//  Tests — arrow window index: `query` returns exactly the links a
//  brute-force filter (and today's painter loop) returns, in the same
//  order, while touching O(log n + k) entries.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import type { GanttDependency, GanttFlatRow, GanttTask, RowGeometry } from '../types';
import {
  arrowLinks,
  buildArrowIndex,
  indexArrowLinks,
  type ArrowIndexProbe,
  type ArrowLink,
} from '../render/arrow-index';
import { taskDependencies } from '../render/columns';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const task = (id: string, dependency?: GanttTask['dependency']): GanttTask => ({
  id,
  name: id,
  start: new Date(2026, 0, 1),
  end: new Date(2026, 0, 2),
  ...(dependency !== undefined && { dependency }),
});

/** Row geometries for `tasks` in order, with the given row heights. */
function geometries(tasks: readonly GanttTask[], height: (i: number) => number): RowGeometry[] {
  let y = 0;
  return tasks.map((t, i) => {
    const h = height(i);
    const row = { task: t, visibleIndex: i, barType: 'task' } as GanttFlatRow;
    const geo: RowGeometry = { row, y, height: h, barX: 0, barWidth: 10, progressWidth: 0 };
    y += h;
    return geo;
  });
}

const byId = (geos: readonly RowGeometry[]) => new Map(geos.map(g => [g.row.task.id, g]));
const brute = (links: readonly ArrowLink[], top: number, bottom: number) =>
  links.filter(l => l.y0 <= bottom && l.y1 >= top);

/**
 * `n` rows with random heights; links in every `dependency` shape, plus links to rows that do not
 * exist, until exactly `links` valid links exist.
 */
function randomChart(seed: number, rows: number, links: number) {
  const rand = rng(seed);
  const int = (n: number) => Math.floor(rand() * n);
  const deps: GanttDependency[][] = Array.from({ length: rows }, () => []);
  for (let made = 0; made < links; made++) {
    const to = int(rows);
    // Mostly short links (neighbouring rows), some long ones across the chart
    const from = rand() < 0.8 ? Math.min(rows - 1, Math.max(0, to + int(11) - 5)) : int(rows);
    const types = ['FS', 'SS', 'FF', 'SF', undefined] as const;
    const type = types[int(types.length)];
    deps[to]?.push({ taskId: `t${from}`, ...(type !== undefined && { type }), ...(rand() < 0.2 && { lag: 2 }) });
  }
  const tasks = deps.map((list, i) => {
    const withMissing = rand() < 0.05 ? [...list, { taskId: 'missing' }] : list;
    const only = withMissing[0];
    // Exercise every `dependency` shape: none, a string, one object, an array
    if (withMissing.length === 0) return task(`t${i}`);
    if (withMissing.length === 1 && only && only.type === undefined && only.lag === undefined && rand() < 0.5)
      return task(`t${i}`, only.taskId);
    if (withMissing.length === 1 && only) return task(`t${i}`, only);
    return task(`t${i}`, withMissing);
  });
  const geos = geometries(tasks, () => 20 + int(41));
  return { tasks, geos, totalHeight: geos.reduce((h, g) => h + g.height, 0), rand };
}

describe('buildArrowIndex', () => {
  const N = 2000;
  const { tasks, geos, totalHeight, rand } = randomChart(7, 1500, N);
  const index = buildArrowIndex(tasks, byId(geos));

  it('indexes every link between rendered rows', () => {
    expect(index.size).toBe(N);
    expect(index.links).toHaveLength(N);
    expect(new Set(index.links.map(l => l.key)).size).toBe(N);
  });

  it('query equals a brute-force filter over 2k random links, in the same order', () => {
    const windows: [number, number][] = [
      [-Infinity, Infinity],
      [-500, -1],
      [totalHeight + 1, totalHeight + 500],
      [0, 0],
      [totalHeight, totalHeight],
    ];
    // Edges exactly on link ends (closed intervals)
    for (const l of index.links.slice(0, 50)) windows.push([l.y1, l.y1 + 3], [l.y0 - 3, l.y0], [l.y0, l.y0]);
    for (let i = 0; i < 1000; i++) {
      const top = rand() * (totalHeight + 400) - 200;
      const height = i % 10 === 0 ? 0 : rand() < 0.8 ? rand() * 800 : rand() * totalHeight;
      windows.push([top, top + height]);
    }
    for (const [top, bottom] of windows) expect(index.query(top, bottom)).toEqual(brute(index.links, top, bottom));
  });

  it('visits O(log n + k) entries per query (instrumented counter)', () => {
    const probe: ArrowIndexProbe = { visits: 0 };
    const counted = indexArrowLinks(index.links, probe);
    const logN = Math.ceil(Math.log2(N + 1));
    let worstSlack = 0;
    for (let i = 0; i < 1000; i++) {
      const top = rand() * totalHeight;
      const bottom = top + (rand() < 0.9 ? rand() * 900 : rand() * totalHeight);
      probe.visits = 0;
      const k = counted.query(top, bottom).length;
      // Tree path (≤ log2 n + 1 nodes, one failed comparison each) + binary search + the k hits
      expect(probe.visits).toBeLessThanOrEqual(k + 3 * logN + 3);
      worstSlack = Math.max(worstSlack, probe.visits - k);
    }
    expect(worstSlack).toBeGreaterThan(0);
    // A viewport-sized window touches its hits plus a few dozen entries, not the 2 000 a scan reads
    probe.visits = 0;
    const k = counted.query(totalHeight / 2, totalHeight / 2 + 600).length;
    expect(probe.visits - k).toBeLessThanOrEqual(3 * logN + 3);
    expect(probe.visits).toBeLessThan(N / 4);
  });

  it('matches the painter loop (rows top to bottom, then dependency order) for uniform rows', () => {
    const chart = randomChart(11, 400, 600);
    const uniform = geometries(chart.tasks, () => 36);
    const geoById = byId(uniform);
    const idx = buildArrowIndex(chart.tasks, geoById);
    // Today's loop in both painters (gantt-canvas.component.ts)
    const painted = (top: number, bottom: number) => {
      const out: string[] = [];
      for (const geo of uniform)
        for (const dep of taskDependencies(geo.row.task)) {
          const from = geoById.get(dep.taskId);
          if (!from) continue;
          if (Math.max(from.y, geo.y) + geo.height < top || Math.min(from.y, geo.y) > bottom) continue;
          out.push(`${dep.taskId}->${geo.row.task.id}`);
        }
      return out;
    };
    for (const [top, bottom] of [
      [0, 400],
      [1000, 1600],
      [7000, 7480],
      [-Infinity, Infinity],
    ] as const)
      expect(idx.query(top, bottom).map(l => `${l.from}->${l.to}`)).toEqual(painted(top, bottom));
  });
});

describe('arrowLinks', () => {
  it('reads every dependency shape through taskDependencies and skips links without both rows', () => {
    const tasks = [
      task('a'),
      task('b', 'a'),
      task('c', { taskId: 'b', type: 'SS', lag: 1 }),
      task('d', [{ taskId: 'a' }, { taskId: 'hidden' }, { taskId: 'c', type: 'FF' }]),
      task('hidden', 'a'),
    ];
    const geos = geometries(tasks.slice(0, 4), () => 30);
    const links = arrowLinks(tasks, byId(geos));
    expect(links.map(l => [l.key, l.y0, l.y1])).toEqual([
      ['a→b:FS', 0, 60],
      ['b→c:SS', 30, 90],
      ['a→d:FS', 0, 120],
      ['c→d:FF', 60, 120],
    ]);
    expect(links[1]?.dep).toEqual({ taskId: 'b', type: 'SS', lag: 1 });
  });

  it('orders links by successor row, whatever the order of `tasks`', () => {
    const tasks = [
      task('a'),
      task('b', 'a'),
      task(
        'c',
        ['b', 'a'].map(taskId => ({ taskId })),
      ),
    ];
    const geos = byId(geometries(tasks, () => 30));
    const shuffled = [tasks[2], tasks[0], tasks[1]].filter((t): t is GanttTask => !!t);
    expect(arrowLinks(shuffled, geos).map(l => l.key)).toEqual(['a→b:FS', 'b→c:FS', 'a→c:FS']);
  });

  it('spans both rows when the predecessor is below, and rows of different heights', () => {
    const tasks = [task('a', 'b'), task('b')];
    const geos = byId(geometries(tasks, i => (i === 0 ? 20 : 50)));
    expect(arrowLinks(tasks, geos).map(l => [l.y0, l.y1])).toEqual([[0, 70]]);
  });

  it('keeps keys unique when a dependency repeats', () => {
    const tasks = [
      task('a'),
      task('b', [{ taskId: 'a' }, { taskId: 'a', type: 'FS', lag: 2 }, { taskId: 'a', type: 'SS' }]),
    ];
    const keys = arrowLinks(tasks, byId(geometries(tasks, () => 30))).map(l => l.key);
    expect(keys).toEqual(['a→b:FS', 'a→b:FS#2', 'a→b:SS']);
  });
});

describe('ArrowIndex edge cases', () => {
  it('an empty index answers every query with nothing', () => {
    const idx = buildArrowIndex([], new Map());
    expect(idx.size).toBe(0);
    expect(idx.query(-Infinity, Infinity)).toEqual([]);
  });

  it('an inverted or NaN window is empty', () => {
    const tasks = [task('a'), task('b', 'a')];
    const idx = buildArrowIndex(tasks, byId(geometries(tasks, () => 30)));
    expect(idx.query(0, 60)).toHaveLength(1);
    expect(idx.query(60, 0)).toEqual([]);
    expect(idx.query(Number.NaN, 60)).toEqual([]);
  });

  it('identical spans and a single point window', () => {
    const links: ArrowLink[] = Array.from({ length: 64 }, (_, i) => ({
      key: `k${i}`,
      from: 'a',
      to: 'b',
      dep: { taskId: 'a' },
      y0: 100,
      y1: 200,
    }));
    const idx = indexArrowLinks(links);
    expect(idx.query(100, 100)).toEqual(links);
    expect(idx.query(200, 250)).toEqual(links);
    expect(idx.query(201, 250)).toEqual([]);
    expect(idx.query(0, 99.5)).toEqual([]);
  });
});
