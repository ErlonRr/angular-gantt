// ─────────────────────────────────────────────────────────────
//  gantry · gantt-cpm.ts
//  Critical Path Method engine — pure functions, no Angular.
//
//  Supports: FS, FF, SF, SS dependency types + lag/lead.
//  Returns the Set of task IDs on the critical path.
//
//  Algorithm:
//    1. Build a DAG from task dependencies
//    2. Topological sort (Kahn's algorithm — cycle-safe)
//    3. Forward pass: compute ES (Early Start) and EF (Early Finish)
//    4. Backward pass: compute LS (Late Start) and LF (Late Finish)
//    5. Float (slack) = LS - ES ; critical if float === 0
// ─────────────────────────────────────────────────────────────

import { GanttTask, DependencyType } from './types';
import { taskDependencies } from './render/columns';
import { calendarDays } from './gantt-math';
import { taskSpan } from './render/timeline';
import type { ResolvedGanttConfig } from './render/config';

// ─── Internal graph node ──────────────────────────────────────

interface CPMNode {
  id: string;
  duration: number; // calendar days (fractional for hour-level tasks)
  es: number; // Early Start  (days from project start)
  ef: number; // Early Finish
  ls: number; // Late Start
  lf: number; // Late Finish
  float: number; // Total float (slack)
  preds: CPMEdge[];
  succs: CPMEdge[];
}

interface CPMEdge {
  fromId: string;
  toId: string;
  type: DependencyType;
  lag: number; // days (positive = delay, negative = lead)
}

// ─── Parse dependency field ───────────────────────────────────

function parseDeps(task: GanttTask): CPMEdge[] {
  return taskDependencies(task).map(dep => ({
    fromId: dep.taskId,
    toId: task.id,
    type: dep.type ?? DependencyType.FS,
    lag: dep.lag ?? 0,
  }));
}

// ─── Durations ────────────────────────────────────────────────

/** How task dates are read — the same fields as the resolved chart config. */
export type CPMOptions = Partial<Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>>;

/** Tolerance for fractional-day arithmetic (≈ 0.1 s). */
const EPS = 1e-6;

/** Rendered span of a task, read exactly like the bars are drawn. */
function spanOf(task: GanttTask, options: CPMOptions) {
  return taskSpan(task, {
    endDateMode: options.endDateMode ?? 'exclusive',
    normalizeDateOnly: options.normalizeDateOnly ?? true,
  });
}

/** Duration in calendar days of the rendered span (an inclusive end counts its last day). */
function spanDays(span: { start: Date; end: Date }): number {
  return Math.max(calendarDays(span.end, false) - calendarDays(span.start, false), 0);
}

// ─── Main entry point ─────────────────────────────────────────

export interface CPMResult {
  /** Task IDs on the critical path (float === 0) */
  criticalIds: Set<string>;
  /** Float per task ID (days) */
  floatMap: Map<string, number>;
  /** Warning messages (cycles, missing predecessors) */
  warnings: string[];
}

/**
 * Run CPM analysis on a task array.
 *
 * @param tasks    Array of GanttTask with dependency fields set.
 *                 Missing predecessors are silently ignored (with a warning).
 * @param options  `endDateMode` / `normalizeDateOnly` as in the chart config, so an
 *                 inclusive end counts its last day (defaults: exclusive, normalised).
 */
export function computeCriticalPath(tasks: GanttTask[], options: CPMOptions = {}): CPMResult {
  const warnings: string[] = [];

  if (!tasks.length) {
    return { criticalIds: new Set(), floatMap: new Map(), warnings };
  }

  // ── 1. Build nodes ──────────────────────────────────────────
  const nodeMap = new Map<string, CPMNode>();

  for (const t of tasks) {
    const duration = spanDays(spanOf(t, options));
    nodeMap.set(t.id, {
      id: t.id,
      duration,
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      float: 0,
      preds: [],
      succs: [],
    });
  }

  // ── 2. Build edges ──────────────────────────────────────────
  const allEdges: CPMEdge[] = [];

  for (const t of tasks) {
    for (const edge of parseDeps(t)) {
      if (!nodeMap.has(edge.fromId)) {
        warnings.push(`Predecessor '${edge.fromId}' of task '${t.id}' not found — skipped.`);
        continue;
      }
      allEdges.push(edge);
      nodeMap.get(edge.fromId)!.succs.push(edge);
      nodeMap.get(edge.toId)!.preds.push(edge);
    }
  }

  // ── 3. Topological sort (Kahn's) ────────────────────────────
  const inDegree = new Map<string, number>();
  for (const [id] of nodeMap) inDegree.set(id, 0);
  for (const e of allEdges) inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topoOrder.push(id);
    const node = nodeMap.get(id)!;
    for (const e of node.succs) {
      const deg = inDegree.get(e.toId)! - 1;
      inDegree.set(e.toId, deg);
      if (deg === 0) queue.push(e.toId);
    }
  }

  if (topoOrder.length < nodeMap.size) {
    warnings.push('Cycle detected in dependencies — critical path may be incomplete.');
    // Continue with partial order (cycle nodes will have float = 0 accidentally)
  }

  // ── 4. Forward pass (ES / EF) ───────────────────────────────
  for (const id of topoOrder) {
    const node = nodeMap.get(id)!;
    let es = 0;

    for (const e of node.preds) {
      const pred = nodeMap.get(e.fromId);
      if (!pred) continue;

      let constraintES: number;
      switch (e.type) {
        case DependencyType.FS:
          constraintES = pred.ef + e.lag;
          break;
        case DependencyType.FF:
          constraintES = pred.ef + e.lag - node.duration;
          break;
        case DependencyType.SS:
          constraintES = pred.es + e.lag;
          break;
        case DependencyType.SF:
          constraintES = pred.es + e.lag - node.duration;
          break;
        default:
          constraintES = pred.ef + e.lag;
      }

      if (constraintES > es) es = constraintES;
    }

    node.es = Math.max(0, es);
    node.ef = node.es + node.duration;
  }

  // ── 5. Backward pass (LS / LF) ──────────────────────────────
  // Project end = max EF across all nodes
  let projectEnd = 0;
  for (const [, n] of nodeMap) {
    if (n.ef > projectEnd) projectEnd = n.ef;
  }

  // Initialize LF for all leaf nodes
  for (const [, n] of nodeMap) {
    n.lf = projectEnd;
    n.ls = projectEnd - n.duration;
  }

  // Reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const node = nodeMap.get(id)!;

    for (const e of node.succs) {
      const succ = nodeMap.get(e.toId);
      if (!succ) continue;

      let constraintLF: number;
      switch (e.type) {
        case DependencyType.FS:
          constraintLF = succ.ls - e.lag;
          break;
        case DependencyType.FF:
          constraintLF = succ.lf - e.lag;
          break;
        case DependencyType.SS:
          constraintLF = succ.ls - e.lag + node.duration;
          break;
        case DependencyType.SF:
          constraintLF = succ.lf - e.lag + node.duration;
          break;
        default:
          constraintLF = succ.ls - e.lag;
      }

      if (constraintLF < node.lf) {
        node.lf = constraintLF;
        node.ls = node.lf - node.duration;
      }
    }
  }

  // ── 6. Float & critical path ─────────────────────────────────
  const criticalIds = new Set<string>();
  const floatMap = new Map<string, number>();

  for (const [id, node] of nodeMap) {
    const float = node.ls - node.es;
    node.float = Math.abs(float) < EPS ? 0 : float;
    floatMap.set(id, node.float);
    if (node.float <= 0) criticalIds.add(id);
  }

  return { criticalIds, floatMap, warnings };
}

// ─── Utility: find longest path (no dependencies needed) ─────

/**
 * Returns the IDs of tasks forming the longest chain
 * (by total duration days). Useful as a simple fallback
 * when no dependency data is available.
 */
export function longestChain(tasks: GanttTask[], options: CPMOptions = {}): string[] {
  if (!tasks.length) return [];

  const sorted = tasks
    .map(task => ({ id: task.id, ...spanOf(task, options) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const dp = new Map<string, number>(); // taskId → cumulative days
  const prev = new Map<string, string>(); // taskId → predecessor

  for (const t of sorted) {
    const dur = spanDays(t);
    let best = dur;
    let bestPred: string | undefined;

    for (const p of sorted) {
      if (p.id === t.id) continue;
      if (p.end <= t.start) {
        const candidate = (dp.get(p.id) ?? 0) + dur;
        if (candidate > best + EPS) {
          best = candidate;
          bestPred = p.id;
        }
      }
    }

    dp.set(t.id, best);
    if (bestPred) prev.set(t.id, bestPred);
  }

  // Trace back from node with max dp
  let cursor = [...dp.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const chain: string[] = [];
  while (cursor) {
    chain.unshift(cursor);
    cursor = prev.get(cursor) ?? '';
  }

  return chain;
}
