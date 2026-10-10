import { GanttTask, GanttAnnotation, TaskType, DependencyType } from './types';
import { addDays, calendarDays, clamp, taskExtent } from './gantt-math';

const d = (iso: string) => new Date(iso);

/**
 * Fixed reference plan (January–July 2026). Use `createDemoData()` for the same plan
 * moved around today — what the demo apps show.
 */
export const DEMO_TASKS: GanttTask[] = [
  {
    id: 'p1',
    name: 'Project Alpha',
    type: TaskType.Group,
    start: d('2026-01-05'),
    end: d('2026-05-30'),
    progress: 48,
    barColor: '#6366F1',
  },
  {
    id: 'p1-a',
    name: 'Discovery',
    parentId: 'p1',
    start: d('2026-01-05'),
    end: d('2026-01-31'),
    progress: 100,
    baseline: { start: d('2026-01-05'), end: d('2026-02-07') },
  },
  {
    id: 'p1-b',
    name: 'Architecture',
    parentId: 'p1',
    start: d('2026-01-20'),
    end: d('2026-02-20'),
    progress: 90,
    dependency: 'p1-a',
    baseline: { start: d('2026-01-25'), end: d('2026-02-25') },
  },
  {
    id: 'p1-b1',
    name: 'Backend',
    parentId: 'p1-b',
    start: d('2026-02-10'),
    end: d('2026-03-20'),
    progress: 65,
    dependency: 'p1-b',
  },
  {
    id: 'p1-b2',
    name: 'Frontend',
    parentId: 'p1-b',
    start: d('2026-02-20'),
    end: d('2026-04-01'),
    progress: 30,
    dependency: { taskId: 'p1-b', type: DependencyType.SS, lag: 10 },
  },
  {
    id: 'p1-c',
    name: 'QA & Testing',
    parentId: 'p1',
    start: d('2026-03-25'),
    end: d('2026-04-25'),
    progress: 0,
    dependency: [
      { taskId: 'p1-b1', type: DependencyType.FS },
      { taskId: 'p1-b2', type: DependencyType.FS },
    ],
  },
  {
    id: 'ms-p1',
    name: 'v1.0 Release',
    parentId: 'p1',
    type: TaskType.Milestone,
    start: d('2026-05-15'),
    end: d('2026-05-15'),
    progress: 0,
    dependency: 'p1-c',
    barColor: '#F59E0B',
  },
  {
    id: 'p2',
    name: 'Project Beta',
    type: TaskType.Group,
    start: d('2026-03-01'),
    end: d('2026-07-31'),
    progress: 22,
    barColor: '#10B981',
  },
  {
    id: 'p2-a',
    name: 'Research',
    parentId: 'p2',
    start: d('2026-03-01'),
    end: d('2026-03-31'),
    progress: 100,
  },
  {
    id: 'p2-b',
    name: 'Prototype',
    parentId: 'p2',
    start: d('2026-04-01'),
    end: d('2026-05-15'),
    progress: 45,
    dependency: 'p2-a',
    baseline: { start: d('2026-04-01'), end: d('2026-05-01') },
  },
  {
    id: 'p2-c',
    name: 'User testing',
    parentId: 'p2',
    start: d('2026-05-10'),
    end: d('2026-06-10'),
    progress: 5,
    dependency: 'p2-b',
  },
  {
    id: 'ms-p2',
    name: 'Beta launch',
    parentId: 'p2',
    type: TaskType.Milestone,
    start: d('2026-07-15'),
    end: d('2026-07-15'),
    progress: 0,
    dependency: 'p2-c',
    barColor: '#10B981',
  },
];

/** Annotations matching `DEMO_TASKS` (fixed 2026 dates). */
export const DEMO_ANNOTATIONS: GanttAnnotation[] = [
  {
    x1: d('2026-03-02'),
    x2: d('2026-03-06'),
    color: '#8B5CF6',
    opacity: 0.07,
    label: { text: 'Code freeze', color: '#8B5CF6', fontWeight: '600' },
  },
  {
    x1: d('2026-04-20'),
    color: '#EF4444',
    label: { text: 'Board review', color: '#EF4444' },
  },
];

// ─── Demo plans around today ──────────────────────────────────

export interface DemoAnchorOptions {
  /** Reference "today" (default: the current date). Pass a fixed date for deterministic output. */
  now?: Date;
  /** Where today falls inside the plan, 0 (start) … 1 (end). Default 0.4. */
  at?: number;
}

/**
 * Whole-week day offset that moves `[start, end]` so `now` sits `at` of the way in.
 * Multiples of 7 keep weekdays: Monday starts stay Mondays, a Mon–Fri freeze stays Mon–Fri.
 */
export function anchorOffsetDays(start: Date, end: Date, now: Date, at = 0.4): number {
  const s = calendarDays(start);
  const len = calendarDays(end) - s;
  const exact = calendarDays(now);
  const n = Math.floor(exact);
  const target = n - clamp(at, 0, 1) * len;
  let k = Math.round((target - s) / 7);
  // Rounding to whole weeks must never push "now" out of the plan (at = 0 or 1)
  if (s + k * 7 > exact) k = Math.floor((exact - s) / 7);
  else if (s + k * 7 + len < exact) k = Math.ceil((exact - len - s) / 7);
  return k * 7 || 0;
}

/** Move a task (and its baseline) by whole days; date-only values stay date-only. */
export function shiftTask<T extends GanttTask>(task: T, days: number): T {
  return {
    ...task,
    start: addDays(task.start, days),
    end: addDays(task.end ?? task.start, days),
    ...(task.baseline && {
      baseline: { ...task.baseline, start: addDays(task.baseline.start, days), end: addDays(task.baseline.end, days) },
    }),
  };
}

export function shiftAnnotation(annotation: GanttAnnotation, days: number): GanttAnnotation {
  return {
    ...annotation,
    x1: addDays(annotation.x1, days),
    ...(annotation.x2 && { x2: addDays(annotation.x2, days) }),
  };
}

/** Shift a task template (and annotations) rigidly so today lands `at` of the way into it. */
export function anchorToToday<T extends GanttTask>(
  template: readonly T[],
  { now = new Date(), at = 0.4 }: DemoAnchorOptions = {},
  annotations: readonly GanttAnnotation[] = [],
): { tasks: T[]; annotations: GanttAnnotation[]; offsetDays: number } {
  const extent = taskExtent([...template]);
  const offsetDays = extent ? anchorOffsetDays(extent.start, extent.end, now, at) : 0;
  return {
    tasks: template.map(t => shiftTask(t, offsetDays)),
    annotations: annotations.map(a => shiftAnnotation(a, offsetDays)),
    offsetDays,
  };
}

/** `DEMO_TASKS` + `DEMO_ANNOTATIONS` moved so today is about 40% into the plan. */
export function createDemoData(options?: DemoAnchorOptions): { tasks: GanttTask[]; annotations: GanttAnnotation[] } {
  const { tasks, annotations } = anchorToToday(DEMO_TASKS, options, DEMO_ANNOTATIONS);
  return { tasks, annotations };
}
