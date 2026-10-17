// Data for `paint.spec.ts`: a small plan that reaches every colour path of the canvas, the
// header, the task list, the legend and the tooltip. Dates are local ISO strings (no offset)
// relative to `NOW`, revived into `Date`s inside the page by both drivers (the Web Component
// `host.evaluate` and the Angular `/fixture` route), so both bindings get identical input.

/** `NOW` (2026-10-14, a Wednesday) as a calendar day; offsets below are in days from it. */
const BASE = { y: 2026, m: 9, d: 14 } as const;

/** Local date-time string `offset` calendar days from `NOW`, at `hour` (no offset: the page's local time). */
export function day(offset: number, hour = 0): string {
  // Calendar arithmetic on a UTC date: the runner's time zone never moves the day
  const iso = new Date(Date.UTC(BASE.y, BASE.m, BASE.d + offset)).toISOString().slice(0, 10);
  return `${iso}T${String(hour).padStart(2, '0')}:00:00`;
}

/** A task as JSON: the `GanttTask` shape with ISO strings for its dates. */
export interface FixtureTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress?: number;
  type?: 'task' | 'milestone' | 'group';
  parentId?: string;
  dependency?: string | { taskId: string; type?: 'FS' | 'SS' | 'FF' | 'SF'; lag?: number }[];
  barColor?: string;
  progressColor?: string;
  textColor?: string;
  rowColor?: string;
  baseline?: { start: string; end: string };
  status?: string;
}

/** A day shaded through `options.highlightTime` (functions don't cross into the page, so it travels as data). */
export interface FixtureHighlight {
  day: string;
  color?: string;
  label?: string;
}

/**
 * What both drivers apply. The Angular `/fixture` route reads it from `window.__GANTRY_FIXTURE__`;
 * the Web Component gets it through `host.evaluate`. Every string matching a local ISO date-time
 * is revived into a `Date`; `highlight` becomes `options.highlightTime`.
 */
export interface PaintFixture {
  tasks: FixtureTask[];
  options: Record<string, unknown>;
  annotations: Record<string, unknown>[];
  highlight: FixtureHighlight[];
  darkMode: boolean | 'auto';
  selected: string[];
}

/**
 * Critical chain (durations, see gantt-cpm): research → api → frontend → qa → release (22 days).
 * The design branch (research → wireframes → visual → signoff → frontend, 12 days to signoff vs
 * 13 through api) has slack, so its explicit colours are painted as given, not as critical.
 * NOW is a Wednesday: day 3–4 and 10–11 are weekends.
 */
export const PAINT_TASKS: FixtureTask[] = [
  { id: 'design', name: 'Design', type: 'group', start: day(-6), end: day(6), progress: 60 },
  {
    id: 'research',
    name: 'Research',
    parentId: 'design',
    start: day(-6),
    end: day(-1),
    progress: 100,
    baseline: { start: day(-7), end: day(-3) },
  },
  {
    id: 'wireframes',
    name: 'Wireframes',
    parentId: 'design',
    start: day(-1),
    end: day(3),
    progress: 40,
    dependency: 'research',
    // Light explicit bar: the label must switch to the dark readable colour
    barColor: '#FDE68A',
    progressColor: '#B45309',
    baseline: { start: day(-2), end: day(2) },
  },
  {
    id: 'visual',
    name: 'Visual design',
    parentId: 'design',
    start: day(4),
    end: day(6),
    progress: 0,
    dependency: [{ taskId: 'wireframes', type: 'FS', lag: 1 }],
    rowColor: '#ECFEFF',
    status: 'notStarted',
  },
  {
    id: 'signoff',
    name: 'Design sign-off',
    parentId: 'design',
    type: 'milestone',
    start: day(6),
    end: day(6),
    dependency: 'visual',
  },
  { id: 'build', name: 'Build', type: 'group', start: day(-1), end: day(16), progress: 20 },
  {
    id: 'api',
    name: 'API',
    parentId: 'build',
    start: day(-1),
    end: day(7),
    progress: 30,
    dependency: 'research',
    // An explicit label colour wins over the critical one
    textColor: '#FEF3C7',
    status: 'overdue',
    baseline: { start: day(-3), end: day(4) },
  },
  {
    id: 'frontend',
    name: 'Frontend',
    parentId: 'build',
    start: day(7),
    end: day(13),
    progress: 0,
    dependency: ['api', 'signoff'].map(taskId => ({ taskId })),
    // Critical wins over an explicit colour
    barColor: '#0F766E',
  },
  {
    id: 'qa',
    name: 'QA',
    parentId: 'build',
    start: day(13),
    end: day(16),
    dependency: 'frontend',
    status: 'Blocked',
  },
  { id: 'release', name: 'Release', type: 'milestone', start: day(16), end: day(16), dependency: 'qa' },
  {
    id: 'docs',
    name: 'Docs',
    start: day(-4),
    end: day(3),
    progress: 10,
    dependency: [{ taskId: 'research', type: 'SS', lag: 2 }],
    // Dark explicit bar: light label
    barColor: '#1E3A8A',
    status: 'inProgress',
  },
  { id: 'retro', name: 'Retro', start: day(-5), end: day(-3), progress: 100, status: 'done' },
];

/** A short plan for the Hour view (one band per off-hours / intensive range stays readable). */
export const PAINT_HOUR_TASKS: FixtureTask[] = [
  { id: 'h-prep', name: 'Prep', start: day(0, 8), end: day(0, 13), progress: 50 },
  { id: 'h-run', name: 'Run', start: day(0, 14), end: day(1, 11), progress: 10, dependency: 'h-prep' },
  { id: 'h-check', name: 'Check', type: 'milestone', start: day(1, 15), end: day(1, 15), dependency: 'h-run' },
];

export const PAINT_ANNOTATIONS: Record<string, unknown>[] = [
  { x1: day(-3), label: { text: 'Kickoff' } },
  { x1: day(12), x2: day(14), color: '#8B5CF6', opacity: 0.15, label: { text: 'Freeze' } },
];

/** Custom non-working days through `highlightTime`: one with the default colour, one explicit. */
export const PAINT_HIGHLIGHT: FixtureHighlight[] = [
  { day: day(1), label: 'Offsite' },
  { day: day(13), color: '#E0F2FE', label: 'Training' },
];

export const PAINT_OPTIONS: Record<string, unknown> = {
  viewMode: 'Week',
  rowHeight: 36,
  baseline: true,
  criticalPath: true,
  showToday: true,
  initialScroll: false,
  panel: { columns: ['name', 'status', 'start', 'progress'] },
  nonWorkingTime: {
    weekends: true,
    holidays: [
      { start: day(5), label: 'Holiday' },
      { start: day(7), end: day(8), color: '#FCE7F3', label: 'Company days' },
    ],
    workingHours: { start: 9, end: 18 },
    intensiveHours: [
      { start: 10, end: 12, label: 'Focus' },
      { start: 14, end: 15, color: '#DCFCE7', label: 'Review' },
    ],
  },
};

export type Scenario = 'light-week' | 'dark-week' | 'auto-dark' | 'hour' | 'table' | 'tooltip' | 'selected';

export const SCENARIOS: readonly Scenario[] = [
  'light-week',
  'dark-week',
  'auto-dark',
  'hour',
  'table',
  'tooltip',
  'selected',
];

/** The fixture each scenario renders. */
export function paintFixture(scenario: Scenario): PaintFixture {
  const base: PaintFixture = {
    tasks: PAINT_TASKS,
    options: PAINT_OPTIONS,
    annotations: PAINT_ANNOTATIONS,
    highlight: PAINT_HIGHLIGHT,
    darkMode: false,
    selected: [],
  };
  switch (scenario) {
    case 'dark-week':
      return { ...base, darkMode: true };
    case 'auto-dark':
      return { ...base, darkMode: 'auto' };
    case 'hour':
      return { ...base, tasks: PAINT_HOUR_TASKS, annotations: [], options: { ...PAINT_OPTIONS, viewMode: 'Hour' } };
    case 'table':
      return { ...base, options: { ...PAINT_OPTIONS, view: 'table' } };
    case 'selected':
      return { ...base, selected: ['visual'] };
    default:
      return base;
  }
}
