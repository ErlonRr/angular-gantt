// ─────────────────────────────────────────────────────────────
//  gantry · render/arrow-index.ts
//  Which dependency arrows cross a vertical window. Every link spans
//  the rows of its two tasks; a static interval tree over those spans,
//  built once per (dependencies, geometries), answers a window query in
//  O(log n + k) instead of scanning every link on every scroll.
// ─────────────────────────────────────────────────────────────

import { DependencyType, type GanttDependency, type GanttTask, type RowGeometry } from '../types';
import { taskDependencies } from './columns';

/** A dependency between two rendered rows. */
export interface ArrowLink {
  /** `${from}→${to}:${type}`, unique in the index (a repeated link gets `#2`, `#3`…) */
  key: string;
  /** Predecessor task id */
  from: string;
  /** Successor task id (the task that declares the dependency) */
  to: string;
  dep: GanttDependency;
  /** Top of the higher of the two rows */
  y0: number;
  /** Bottom of the lower of the two rows (`y + height`) */
  y1: number;
}

export interface ArrowIndex {
  /** Number of links */
  readonly size: number;
  /** Every link, in drawing order: successor rows top to bottom, then each task's dependency order */
  readonly links: readonly ArrowLink[];
  /** Links whose span meets `[top, bottom]` (edges included), in drawing order. */
  query(top: number, bottom: number): ArrowLink[];
}

/** Test hook: counts the tree nodes, list entries and search steps a query touches. */
export interface ArrowIndexProbe {
  visits: number;
}

/**
 * The dependency links between the rows in `geoById` (links to a task without a row, such as a
 * collapsed child, are left out), indexed by their vertical span. Dependencies are read with
 * `taskDependencies`; the order is the one painters draw arrows in.
 */
export function buildArrowIndex(tasks: readonly GanttTask[], geoById: ReadonlyMap<string, RowGeometry>): ArrowIndex {
  return indexArrowLinks(arrowLinks(tasks, geoById));
}

/** The links `buildArrowIndex` indexes, in drawing order. */
export function arrowLinks(tasks: readonly GanttTask[], geoById: ReadonlyMap<string, RowGeometry>): ArrowLink[] {
  const found: { toY: number; link: Omit<ArrowLink, 'key'> }[] = [];
  for (const task of tasks) {
    const to = geoById.get(task.id);
    if (!to) continue;
    for (const dep of taskDependencies(task)) {
      const from = geoById.get(dep.taskId);
      if (!from) continue;
      found.push({
        toY: to.y,
        link: {
          from: dep.taskId,
          to: task.id,
          dep,
          y0: Math.min(from.y, to.y),
          y1: Math.max(from.y + from.height, to.y + to.height),
        },
      });
    }
  }
  // Row order (stable: a task's dependencies keep their order), whatever order `tasks` is in
  found.sort((a, b) => a.toY - b.toY);

  const seen = new Map<string, number>();
  return found.map(({ link }) => {
    const base = `${link.from}→${link.to}:${link.dep.type ?? DependencyType.FS}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { key: n === 1 ? base : `${base}#${n}`, ...link };
  });
}

interface TreeNode {
  center: number;
  /** Links whose span contains `center`, by ascending `y0` */
  byStart: number[];
  /** The same links by descending `y1` */
  byEnd: number[];
  /** Links entirely above `center` */
  left: TreeNode | null;
  /** Links entirely below `center` */
  right: TreeNode | null;
}

/**
 * Index `links` (kept in the given order) in a centred interval tree. `probe`, when given,
 * counts the work of every query.
 */
export function indexArrowLinks(links: readonly ArrowLink[], probe?: ArrowIndexProbe): ArrowIndex {
  const n = links.length;
  const y0 = new Float64Array(n);
  const y1 = new Float64Array(n);
  links.forEach((l, i) => {
    y0[i] = l.y0;
    y1[i] = l.y1;
  });
  const lo = (i: number) => y0[i] ?? 0;
  const hi = (i: number) => y1[i] ?? 0;

  // Every link by ascending y0 (also the links that start inside a window) and by ascending y1
  const starts = links.map((_, i) => i).sort((a, b) => lo(a) - lo(b) || a - b);
  const ends = links.map((_, i) => i).sort((a, b) => hi(a) - hi(b) || a - b);

  // `byY0` / `byY1`: the same links in both orders. Stable partitions keep both sorted, so the
  // build is O(n log n). The median endpoint as centre leaves at most half the links on either
  // side: depth ≤ log2 n + 1.
  const build = (byY0: readonly number[], byY1: readonly number[]): TreeNode | null => {
    const m = byY0.length;
    if (!m) return null;
    // The (m+1)-th smallest of the 2m endpoints: merge the two sorted orders
    let center = 0;
    for (let a = 0, b = 0, taken = 0; taken <= m; taken++) {
      const s = byY0[a];
      const e = byY1[b];
      if (e === undefined || (s !== undefined && lo(s) <= hi(e))) {
        center = lo(s ?? 0);
        a++;
      } else {
        center = hi(e);
        b++;
      }
    }
    const side = (i: number): 0 | 1 | 2 => (hi(i) < center ? 0 : lo(i) > center ? 2 : 1);
    const split = (ids: readonly number[]) => {
      const parts: [number[], number[], number[]] = [[], [], []];
      for (const i of ids) parts[side(i)].push(i);
      return parts;
    };
    const [leftY0, hereY0, rightY0] = split(byY0);
    const [leftY1, hereY1, rightY1] = split(byY1);
    return {
      center,
      byStart: hereY0,
      byEnd: hereY1.reverse(),
      left: build(leftY0, leftY1),
      right: build(rightY0, rightY1),
    };
  };
  const root = build(starts, ends);

  const visit = (): void => {
    if (probe) probe.visits++;
  };

  const query = (top: number, bottom: number): ArrowLink[] => {
    if (!(top <= bottom)) return [];
    const hits: number[] = [];

    // 1. Links whose span contains `top` (a stabbing query: one root-to-leaf path)
    let node = root;
    while (node) {
      visit();
      if (top < node.center) {
        for (const i of node.byStart) {
          visit();
          if (lo(i) > top) break;
          hits.push(i);
        }
        node = node.left;
      } else if (top > node.center) {
        for (const i of node.byEnd) {
          visit();
          if (hi(i) < top) break;
          hits.push(i);
        }
        node = node.right;
      } else {
        for (const i of node.byStart) {
          visit();
          hits.push(i);
        }
        break;
      }
    }

    // 2. Links that start below `top` and no lower than `bottom` (disjoint from 1.)
    let a = 0;
    let b = n;
    while (a < b) {
      visit();
      const mid = (a + b) >>> 1;
      if (lo(starts[mid] ?? 0) > top) b = mid;
      else a = mid + 1;
    }
    for (let k = a; k < n; k++) {
      visit();
      const i = starts[k] ?? 0;
      if (lo(i) > bottom) break;
      hits.push(i);
    }

    hits.sort((p, q) => p - q);
    return hits.map(i => links[i] as ArrowLink);
  };

  return { size: n, links, query };
}
