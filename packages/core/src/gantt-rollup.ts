// ─────────────────────────────────────────────────────────────
//  gantry · gantt-rollup.ts
//  Rollup of parent rows (`options.rollup`): progress, dates, colour
//  and status computed from the children, once for both painters.
//  `computeRollups` walks the tree bottom-up in O(n); `applyRollups`
//  gives each rolled-up parent row a copy of its task with those values
//  (the raw tasks are never changed); `rollupSegments` places a
//  collapsed parent's children inside its bar (`rollup.segments`).
// ─────────────────────────────────────────────────────────────

import type { GanttFlatRow, GanttRollupInfo, GanttTask, GanttTaskStyle, TaskStatus } from './types';
import type { DateReading, ResolvedGanttConfig, ResolvedRollupOptions } from './render/config';
import type { BarSegment } from './render/bars';
import { calendarDays } from './gantt-math';
import { normalizeTasks } from './gantt-data';
import { durationFactor } from './calendar/durations';
import { taskSpan } from './render/timeline';
import { taskStatus } from './render/columns';
import { statusPaint, themeVar } from './render/paint';

/** What `computeRollups` needs besides the tasks. */
export interface RollupContext {
  /** The instant statuses are evaluated at (the bindings' clock) */
  now: Date;
  /** How task dates are read and measured (a config, a column context; without `calendar`: calendar days) */
  dates: DateReading;
}

/** A computed parent: its info, its rolled-up task copy and the span it occupies as drawn. */
interface Rolled {
  info: GanttRollupInfo;
  copy: GanttTask;
  /** Drawn span (`taskSpan`): the rolled-up dates, or the parent's own when dates are not rolled up */
  start: Date;
  end: Date;
}

/** The task tree as `flattenTree` reads it: children by parent id and the parent ids top-down. */
interface Tree {
  /** First task of each id */
  byId: Map<string, GanttTask>;
  /** Direct children by parent id, in task order */
  childrenOf: Map<string, GanttTask[]>;
  /** Every parent id once, each before its descendants (breadth-first from the roots) */
  order: string[];
}

/**
 * The tree of `tasks`: a `parentId` that is empty, the task's own or unknown makes a root (the
 * `normalizeTasks` rule). A cycle leaves its parents unreachable from the roots; then the tree is
 * read from `normalizeTasks`, which cuts it the way `flattenTree` does.
 */
function readTree(tasks: readonly GanttTask[], repaired = false): Tree {
  const byId = new Map<string, GanttTask>();
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t);
  const childrenOf = new Map<string, GanttTask[]>();
  const queue: GanttTask[] = [];
  for (const t of tasks) {
    const p = t.parentId;
    if (!p || p === t.id || !byId.has(p)) {
      queue.push(t);
      continue;
    }
    const kids = childrenOf.get(p);
    if (kids) kids.push(t);
    else childrenOf.set(p, [t]);
  }
  // The array iterator sees the children pushed while it runs
  const order: string[] = [];
  const expanded = new Set<string>();
  for (const t of queue) {
    const kids = childrenOf.get(t.id);
    if (!kids || expanded.has(t.id)) continue;
    expanded.add(t.id);
    order.push(t.id);
    for (const k of kids) queue.push(k);
  }
  if (order.length < childrenOf.size && !repaired) return readTree(normalizeTasks(tasks as GanttTask[]), true);
  return { byId, childrenOf, order };
}

/** Rolled-up copy of each info's parent task (made by `computeRollups`, reused by `applyRollups`). */
const COPY_OF = new WeakMap<GanttRollupInfo, GanttTask>();
/** The task each rolled-up copy was made from. */
const SOURCE_OF = new WeakMap<GanttTask, GanttTask>();

const clampProgress = (p: number | undefined): number => Math.min(Math.max(p ?? 0, 0), 100);

/** Whole percent; 0 and 100 only when exact (a 99.6 % parent is not drawn complete). */
function roundProgress(p: number): number {
  const r = Math.round(p);
  if (r >= 100 && p < 100) return 99;
  if (r <= 0 && p > 0) return 1;
  return r;
}

/** Same rule as `flattenTree`'s `barType`: a custom `barType` wins over `type`. */
const isMilestone = (t: GanttTask): boolean => (t.barType ?? t.type) === 'milestone';

/** Copy of `task` carrying the rolled-up progress, dates and status of `info`. */
function makeCopy(task: GanttTask, info: GanttRollupInfo): GanttTask {
  const copy: GanttTask = { ...task, status: info.status };
  if (info.progress !== null) copy.progress = info.progress;
  if (info.start !== null && info.end !== null) {
    copy.start = info.start;
    copy.end = info.end;
    // A derived bar can't be dragged (it would snap back on the next render)
    copy.draggable = false;
  }
  SOURCE_OF.set(copy, task);
  return copy;
}

/**
 * Rolled-up values of every parent (a task with at least one child), by parent id, in task order.
 * Empty without `rollup`. The tree is read like `flattenTree` reads it (unknown, self and cyclic
 * `parentId`s make roots, as in `normalizeTasks`) and walked bottom-up without recursion, in O(n):
 *
 * - **progress** (`'duration'`): the mean of the direct children's progress (a child parent's
 *   rolled-up one), weighted by their drawn length in measured days (calendar days, or working
 *   days with a working calendar); milestones weigh 0, and with a total weight of 0 the plain mean
 *   is used. `'count'`: the plain mean. Rounded to a whole percent,
 *   0 and 100 only when exact. `false`: `null` (the parent keeps its own).
 * - **dates**: the earliest child start and the latest child end, compared as drawn (`taskSpan`, so
 *   an inclusive midnight end covers its day) and returned as the children's own values, so the
 *   parent's copy is drawn exactly over them. `dates: false`: `null`.
 * - **status**: `summaryStatus` of the children's statuses at `ctx.now` (`taskStatus`; a child
 *   parent's rolled-up one). It replaces the parent's own `status`.
 * - **color**: `'status'` → `statusPaint(status)`; a function → its result for the children and
 *   the parent's rolled-up copy (`null` when it returns nothing); `false` → `null`.
 * - **children**: the direct children in task order, a child parent as its rolled-up copy.
 *
 * Pass the tasks the rows are built from (the bindings' normalised list) so the copies in
 * `children` are the ones `applyRollups` puts on the rows.
 */
export function computeRollups(
  tasks: readonly GanttTask[],
  rollup: ResolvedRollupOptions | false,
  ctx: RollupContext,
): Map<string, GanttRollupInfo> {
  const out = new Map<string, GanttRollupInfo>();
  if (!rollup || tasks.length === 0) return out;
  const { now, dates } = ctx;
  const { byId, childrenOf, order } = readTree(tasks);
  if (order.length === 0) return out;

  // Task dates repeat a lot (days of one project): read each instant's position once, in calendar
  // days or, with working durations, in working time (the difference of two is `measureBetween`)
  const working = dates.calendar?.durations === 'working' ? dates.calendar.working : null;
  const factor = durationFactor(dates);
  const dayMemo = new Map<number, number>();
  const dayOf = (d: Date): number => {
    const t = d.getTime();
    let day = dayMemo.get(t);
    if (day === undefined) {
      // Span dates are already local: no date-only normalisation
      day = working ? working.toWorking(d) : calendarDays(d, false);
      dayMemo.set(t, day);
    }
    return day;
  };
  const byDuration = rollup.progress === 'duration';

  const rolled = new Map<string, Rolled>();
  const statuses: (TaskStatus | (string & {}))[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] ?? '';
    const parent = byId.get(id);
    const kids = childrenOf.get(id);
    if (!parent || !kids) continue;

    const children: GanttTask[] = [];
    statuses.length = 0;
    let sum = 0;
    let weightSum = 0;
    let weighted = 0;
    let min: Date | null = null;
    let max: Date | null = null;
    let first: Date = parent.start;
    // `end` may be missing in raw data (`normalizeTasks` reads it as the start)
    let last: Date = parent.end ?? parent.start;
    for (const c of kids) {
      const sub = rolled.get(c.id);
      children.push(sub?.copy ?? c);
      statuses.push(sub ? sub.info.status : taskStatus(c, now, dates));
      const span = sub ?? taskSpan(c, dates);
      if (rollup.progress) {
        const p = sub?.info.progress ?? clampProgress(c.progress);
        sum += p;
        if (byDuration && !isMilestone(c)) {
          const w = Math.max(0, (dayOf(span.end) - dayOf(span.start)) / factor);
          weightSum += w;
          weighted += w * p;
        }
      }
      if (rollup.dates) {
        if (min === null || span.start.getTime() < min.getTime()) {
          min = span.start;
          first = sub?.info.start ?? c.start;
        }
        if (max === null || span.end.getTime() > max.getTime()) {
          max = span.end;
          last = sub?.info.end ?? c.end ?? c.start;
        }
      }
    }

    const progress = rollup.progress ? roundProgress(weightSum > 0 ? weighted / weightSum : sum / kids.length) : null;
    const info: GanttRollupInfo = {
      progress,
      start: rollup.dates ? first : null,
      end: rollup.dates ? last : null,
      status: summaryStatus(statuses),
      color: null,
      children,
    };
    const copy = makeCopy(parent, info);
    COPY_OF.set(info, copy);
    const color = rollup.color;
    if (color === 'status') info.color = statusPaint(info.status);
    else if (typeof color === 'function') info.color = color(children, copy) ?? null;
    const span = min && max ? { start: min, end: max } : taskSpan(parent, dates);
    rolled.set(id, { info, copy, start: span.start, end: span.end });
  }

  for (const t of tasks) {
    const r = rolled.get(t.id);
    if (r && !out.has(t.id)) out.set(t.id, r.info);
  }
  return out;
}

/**
 * The rows with each rolled-up parent row carrying a copy of its task with the rolled-up values:
 * `progress`, `start` / `end` (with `draggable: false`) when they are rolled up, and `status`. The
 * copy is made once per info (the one in the grandparent's `children`), so an unchanged row keeps
 * its identity across calls; other rows are returned as they are. The raw tasks are untouched
 * (`rollupSource` maps a copy back). Without `rollup` or rollups, `rows` itself is returned.
 */
export function applyRollups(
  rows: GanttFlatRow[],
  rollups: ReadonlyMap<string, GanttRollupInfo>,
  rollup: ResolvedRollupOptions | false,
): GanttFlatRow[] {
  if (!rollup || rollups.size === 0) return rows;
  return rows.map(row => {
    const info = rollups.get(row.task.id);
    if (!info) return row;
    const task = rolledUpTask(row.task, info);
    return task === row.task ? row : { ...row, task };
  });
}

/**
 * The copy of `task` (or of the task an older copy was made from) for `info`: the one
 * `computeRollups` made when it has the same source, else a new one.
 */
function rolledUpTask(task: GanttTask, info: GanttRollupInfo): GanttTask {
  const source = SOURCE_OF.get(task) ?? task;
  const cached = COPY_OF.get(info);
  if (cached && (cached === task || SOURCE_OF.get(cached) === source)) return cached;
  return makeCopy(source, info);
}

/**
 * The task a rolled-up copy (`applyRollups`, `GanttRollupInfo.children`) was made from, or the task
 * itself. Bindings emit this one in events and `getSelectedTasks()`, which stay raw.
 */
export function rollupSource(task: GanttTask): GanttTask {
  return SOURCE_OF.get(task) ?? task;
}

/**
 * Summary status of a set of children: `overdue` if any is, `done` if all are, `notStarted` if
 * none has started, otherwise `inProgress`. Custom statuses count as started. No children: `notStarted`.
 */
export function summaryStatus(statuses: Iterable<TaskStatus | (string & {})>): TaskStatus {
  let count = 0;
  let done = 0;
  let notStarted = 0;
  for (const s of statuses) {
    if (s === 'overdue') return 'overdue';
    count++;
    if (s === 'done') done++;
    else if (s === 'notStarted') notStarted++;
  }
  if (count > 0 && done === count) return 'done';
  return notStarted === count ? 'notStarted' : 'inProgress';
}

// ─── Segments ─────────────────────────────────────────────────

/** Width in px of a milestone child's segment, centred on its date. */
const MILESTONE_SEGMENT_WIDTH = 2;

/** What `rollupSegments` needs besides the parent's info. */
export interface RollupSegmentsInput {
  /** Calendar date → timeline x (`TimelineModel.toX`) */
  toX: (date: Date) => number;
  cfg: Pick<ResolvedGanttConfig, 'rollup' | 'endDateMode' | 'normalizeDateOnly' | 'bar'>;
  /**
   * A child's resolved style (the bindings' style resolver on the child's row); its `color` paints
   * the segment. Default (or no colour): the theme bar colour, the milestone colour for milestones.
   */
  styleOf?: ((child: GanttTask) => Pick<GanttTaskStyle, 'color'> | null | undefined) | undefined;
  /** The parent's bar (`RowGeometry.barX` / `barWidth`): segments are clipped to it */
  bar?: { x: number; width: number } | undefined;
}

/**
 * A collapsed rolled-up parent's direct children as segments of its bar (`rollup.segments`), in
 * timeline x like the bar: each child's drawn span (at least `bar.minWidth`; milestones a 2 px
 * tick centred on their date) in its own colour, in `children` order (later ones paint over
 * earlier ones), clipped to `input.bar` when given. `null` when segments are off or none is left.
 * Bindings call it for collapsed rows only and pass the result to `computeBarVisual`.
 */
export function rollupSegments(info: GanttRollupInfo, input: RollupSegmentsInput): BarSegment[] | null {
  const { toX, cfg, styleOf, bar } = input;
  if (!cfg.rollup || !cfg.rollup.segments || info.children.length === 0) return null;
  const segments: BarSegment[] = [];
  for (const child of info.children) {
    const span = taskSpan(child, cfg);
    const milestone = isMilestone(child);
    let x = toX(span.start);
    let width: number;
    if (milestone) {
      x -= MILESTONE_SEGMENT_WIDTH / 2;
      width = MILESTONE_SEGMENT_WIDTH;
    } else {
      width = Math.max(toX(span.end) - x, cfg.bar.minWidth);
    }
    if (bar) {
      const left = Math.max(x, bar.x);
      const right = Math.min(x + width, bar.x + bar.width);
      if (right <= left) continue;
      x = left;
      width = right - left;
    }
    const paint = styleOf?.(child)?.color ?? themeVar(milestone ? 'milestoneColor' : 'barColor');
    segments.push({ x, width, paint });
  }
  return segments.length > 0 ? segments : null;
}
