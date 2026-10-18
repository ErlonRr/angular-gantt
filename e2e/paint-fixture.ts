// Data for `paint.spec.ts` and `forced-colors.spec.ts`: a small plan that reaches every colour
// path of the canvas, the header, the task list, the legend and the tooltip, and the two drivers
// that render it (`renderFixture`). Dates are local ISO strings (no offset) relative to `NOW`,
// revived into `Date`s inside the page by both drivers (the Web Component `host.evaluate` and the
// Angular `/fixture` route), so both bindings get identical input.
import type { Chart } from './fixtures';
import { TARGETS } from '../playwright.config';

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

/**
 * `forced` is the light week with a selected bar (`visual`, off the critical path) next to the
 * critical chain, rendered with forced colours emulated (`emulateMedia({ forcedColors: 'active' })`).
 */
export type Scenario = 'light-week' | 'dark-week' | 'auto-dark' | 'hour' | 'table' | 'tooltip' | 'selected' | 'forced';

export const SCENARIOS: readonly Scenario[] = [
  'light-week',
  'dark-week',
  'auto-dark',
  'hour',
  'table',
  'tooltip',
  'selected',
  'forced',
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
    case 'forced':
      return { ...base, selected: ['visual'] };
    default:
      return base;
  }
}

/** The bindings the drivers render. */
export type Target = 'vanilla' | 'angular';

/**
 * Replace the playground's element with a fresh one (no playground listeners or state) fed by the
 * fixture, in the same fixed box as the Angular `/fixture` route (1150 × 700 at the top left), so
 * both bindings window the same rows and columns.
 */
async function renderVanilla(chart: Chart, fx: PaintFixture): Promise<void> {
  await chart.open(`http://localhost:${TARGETS.vanilla.port}/`);
  await chart.host().evaluate((old, f) => {
    const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    const revive = (v: unknown): unknown => {
      if (typeof v === 'string') return LOCAL_ISO.test(v) ? new Date(v) : v;
      if (Array.isArray(v)) return v.map(revive);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
      return v;
    };
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const byDay = new Map(f.highlight.map(h => [dayKey(new Date(h.day)), h]));
    const el = document.createElement('gantry-element') as HTMLElement & Record<string, unknown>;
    el.id = old.id;
    for (const [prop, value] of [
      ['position', 'fixed'],
      ['top', '0'],
      ['left', '0'],
      ['z-index', '100'],
      ['width', '1150px'],
      ['height', '700px'],
    ]) {
      el.style.setProperty(prop, value);
    }
    el['darkMode'] = f.darkMode;
    el['showToolbar'] = true;
    el['enableDrag'] = true;
    el['enableResize'] = true;
    el['tooltipEnabled'] = true;
    el['showLegend'] = true;
    el['tasks'] = revive(f.tasks);
    el['annotations'] = revive(f.annotations);
    el['options'] = {
      ...(revive(f.options) as object),
      highlightTime: byDay.size
        ? (start: Date, unit: string) => {
            const h = unit === 'day' ? byDay.get(dayKey(start)) : undefined;
            return h ? { color: h.color, label: h.label } : null;
          }
        : undefined,
    };
    old.replaceWith(el);
    (el['setSelectedTasks'] as (ids: string[]) => void)(f.selected);
  }, fx);
}

async function renderAngular(chart: Chart, fx: PaintFixture): Promise<void> {
  await chart.page.addInitScript(f => {
    (window as Window & { __GANTRY_FIXTURE__?: unknown }).__GANTRY_FIXTURE__ = f;
  }, fx);
  await chart.open(`http://localhost:${TARGETS.angular.port}/fixture`);
}

/**
 * Render `fx` on `target`: the Web Component in the playground page (a fresh element in a fixed
 * box), Angular in the showcase's `/fixture` route (read from `window.__GANTRY_FIXTURE__`).
 */
export function renderFixture(chart: Chart, target: Target, fx: PaintFixture): Promise<void> {
  return target === 'vanilla' ? renderVanilla(chart, fx) : renderAngular(chart, fx);
}
