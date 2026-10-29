// Data for `paint.spec.ts` and `forced-colors.spec.ts`: a small plan that reaches every colour
// path of the canvas, the header, the task list, the legend and the tooltip, and the two drivers
// that render it (`renderFixture`). Dates are local ISO strings (no offset) relative to `NOW`,
// revived into `Date`s inside the page by both drivers (the Web Component `host.evaluate` and the
// Angular `/fixture` route), so both bindings get identical input.
import { expect } from '@playwright/test';
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
  /** `GanttTaskStyle` (colours, height, radius, label, className) */
  style?: Record<string, unknown>;
  collapsed?: boolean;
  /** A custom bar type (`'e2e-custom'`: the harness's custom bar, see `GanttSetup.customBars`) */
  barType?: string;
  /** The resources the task is assigned to (Phase 14): an id, or an id with the percent of a full-time person */
  resources?: (string | { resourceId: string; units?: number })[];
}

/** A resource of the `resources` property (Phase 14); `capacity` in percent of one person, default 100. */
export interface FixtureResource {
  id: string;
  name: string;
  capacity?: number;
  group?: string;
  color?: string;
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
  /** The `resources` property (Phase 14) */
  resources?: FixtureResource[];
  options: Record<string, unknown>;
  annotations: Record<string, unknown>[];
  highlight: FixtureHighlight[];
  darkMode: boolean | 'auto';
  selected: string[];
  /** The chart's box in px. Default: 1150 × 700 */
  box?: { width: number; height: number };
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

/** The `resources` scenario's people: Bo works half time, Cy and Di are the Eng team. */
export const PAINT_RESOURCES: FixtureResource[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
];

/**
 * Who does what in the `resources` scenario: Ana's Research and Wireframes meet API (200 % for two days),
 * Bo is over his 50 % on Docs, the Eng team builds Frontend, Visual design and QA have nobody.
 */
const PAINT_ASSIGNMENTS: Record<string, FixtureTask['resources']> = {
  research: ['ana'],
  wireframes: ['ana'],
  api: [{ resourceId: 'ana', units: 100 }, 'cy'],
  docs: [{ resourceId: 'bo', units: 100 }],
  retro: ['bo'],
  frontend: ['cy', 'di'],
};

export const PAINT_RESOURCE_TASKS: FixtureTask[] = PAINT_TASKS.map(t =>
  PAINT_ASSIGNMENTS[t.id] ? { ...t, resources: PAINT_ASSIGNMENTS[t.id] } : t,
);

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
 * The `styled` scenario (Gantry 2 phase 10): every layer of the style cascade (kind, `parent`,
 * `levels`, the rolled-up status colour, flat fields, `task.style`), a collapsed parent drawn as
 * its children's segments, straight arrows and compact rows. Critical path off: it would repaint
 * the fills the cascade resolves. NOW is a Wednesday: day 3–4 and 10–11 are weekends.
 */
export const STYLED_TASKS: FixtureTask[] = [
  // Expanded parent: its colour is the rolled-up status of its children (one overdue → overdue)
  { id: 'design', name: 'Design', type: 'group', start: day(-6), end: day(6) },
  { id: 'research', name: 'Research', parentId: 'design', start: day(-6), end: day(-2), progress: 100 },
  {
    id: 'wireframes',
    name: 'Wireframes',
    parentId: 'design',
    start: day(-2),
    end: day(2),
    progress: 40,
    dependency: 'research',
    status: 'overdue',
    // task.style wins over every layer below it, the flat barColor included
    barColor: '#0F766E',
    style: { color: '#FDE68A', progressColor: '#B45309', textColor: '#78350F', radius: 8 },
  },
  {
    id: 'visual',
    name: 'Visual design',
    parentId: 'design',
    start: day(2),
    end: day(6),
    dependency: 'wireframes',
    // A flat field over the level style; task.style adds a row colour, a height and a class
    progressColor: '#7C2D12',
    style: { rowColor: '#ECFEFF', height: '60%', label: 'right', className: 'fixture-visual' },
  },
  // Collapsed parent: rolled-up dates and status, its children drawn as segments in their own colours
  { id: 'build', name: 'Build', type: 'group', collapsed: true, start: day(1), end: day(16) },
  { id: 'api', name: 'API', parentId: 'build', start: day(1), end: day(7), progress: 60, status: 'inProgress' },
  {
    id: 'frontend',
    name: 'Frontend',
    parentId: 'build',
    start: day(7),
    end: day(12),
    dependency: 'api',
    style: { color: '#0EA5E9' },
  },
  { id: 'qa', name: 'QA', parentId: 'build', start: day(12), end: day(16), dependency: 'frontend' },
  { id: 'release', name: 'Release', type: 'milestone', start: day(17), end: day(17), dependency: 'build' },
  {
    id: 'docs',
    name: 'Docs',
    start: day(-4),
    end: day(5),
    progress: 20,
    dependency: [{ taskId: 'research', type: 'SS', lag: 2 }],
    style: { color: '#1E3A8A', rowColor: '#FEF3C7' },
  },
];

export const STYLED_OPTIONS: Record<string, unknown> = {
  viewMode: 'Week',
  initialScroll: false,
  showToday: true,
  density: 'compact',
  arrows: { routing: 'straight' },
  rollup: { color: 'status', segments: true },
  styles: {
    task: { color: '#6366F1', radius: 2 },
    group: { progressColor: '#1F2937' },
    milestone: { color: '#DB2777' },
    parent: { textColor: '#FFFFFF', className: 'fixture-parent' },
    levels: [{ rowColor: '#F8FAFC' }, { color: '#64748B', progressColor: '#334155' }],
  },
  panel: { columns: ['name', 'status', 'start', 'progress'] },
  nonWorkingTime: { weekends: true },
};

/**
 * `forced` is the light week with a selected bar (`visual`, off the critical path) next to the
 * critical chain, rendered with forced colours emulated (`emulateMedia({ forcedColors: 'active' })`).
 * `styled` renders `STYLED_TASKS` / `STYLED_OPTIONS`; `narrow` the light week in a 600 × 600 box,
 * below the responsive breakpoint (640 px): the timeline alone and the toolbar's More button.
 * `editing` (phase 11) is the light week with `editing: true` (the toolbar's history group, the
 * cells' `aria-readonly`); paint.spec.ts then selects a link, opens an invalid cell editor and
 * hovers a bar (its grips, progress grip and link connectors). Hover opens no tooltip there.
 * `export` (phase 12) is the light week with `toolbar.export: true`; paint.spec.ts opens the
 * toolbar's Export menu by keyboard (the export group, its open button and the menu's items).
 * `calendar` (phase 13) is the light week with a working calendar (`calendar: true`), the critical
 * path, `nonWorkingTime: { style: 'none' }` (the definition stays, no weekend, holiday or off-hours
 * band is painted) and a Duration column. Its records hold no weekend, holiday or off-hours band:
 * the only `gantt-band` / `g-band` keys left are the two `highlightTime` days of the shared fixture,
 * which `style: 'none'` keeps painting.
 * `resources` (phase 14) is the light week in the resource view (`rows: 'resources'`, the toolbar's
 * Rows toggle, the Capacity and Peak load columns): the task list of resource rows and the
 * `load` layer (bars, the part over capacity, its hatch and the dashed capacity line) with a person
 * over capacity, a team and the Unassigned row. The canvas has no bars, arrows or critical path.
 */
export type Scenario =
  | 'light-week'
  | 'dark-week'
  | 'auto-dark'
  | 'hour'
  | 'table'
  | 'tooltip'
  | 'selected'
  | 'forced'
  | 'styled'
  | 'narrow'
  | 'editing'
  | 'export'
  | 'calendar'
  | 'resources';

export const SCENARIOS: readonly Scenario[] = [
  'light-week',
  'dark-week',
  'auto-dark',
  'hour',
  'table',
  'tooltip',
  'selected',
  'forced',
  'styled',
  'narrow',
  'editing',
  'export',
  'calendar',
  'resources',
];

/** The `narrow` scenario's box */
export const NARROW_BOX = { width: 600, height: 600 } as const;

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
    case 'styled':
      return { ...base, tasks: STYLED_TASKS, options: STYLED_OPTIONS, annotations: [], highlight: [] };
    case 'narrow':
      return { ...base, box: NARROW_BOX };
    case 'editing':
      return { ...base, options: { ...PAINT_OPTIONS, editing: true, tooltip: { trigger: 'focus' } } };
    case 'export':
      return { ...base, options: { ...PAINT_OPTIONS, toolbar: { export: true } } };
    case 'calendar':
      return {
        ...base,
        options: {
          ...PAINT_OPTIONS,
          calendar: true,
          criticalPath: true,
          nonWorkingTime: { style: 'none' },
          panel: { columns: ['name', 'duration'] },
        },
      };
    case 'resources':
      return {
        ...base,
        tasks: PAINT_RESOURCE_TASKS,
        resources: PAINT_RESOURCES,
        options: {
          ...PAINT_OPTIONS,
          rows: 'resources',
          toolbar: { rowsToggle: true },
          panel: { columns: ['name', 'capacity', 'load'] },
        },
      };
    default:
      return base;
  }
}

/** The bindings the drivers render. */
export type Target = 'vanilla' | 'angular';

/**
 * Replace the playground's element with a fresh one (no playground listeners or state) fed by the
 * fixture, in the same fixed box as the Angular `/fixture` route (1150 × 700 at the top left, or
 * the fixture's `box`), so both bindings window the same rows and columns.
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
      ['width', `${f.box?.width ?? 1150}px`],
      ['height', `${f.box?.height ?? 700}px`],
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
    if (f.resources) el['resources'] = f.resources;
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
  await chart.page.goto(`http://localhost:${TARGETS.angular.port}/fixture`);
  // Attached, not visible: below the responsive breakpoint (`narrow`) the task list is hidden
  await expect(chart.get('.gantt-tl-row').first()).toBeAttached();
}

/**
 * Render `fx` on `target`: the Web Component in the playground page (a fresh element in a fixed
 * box), Angular in the showcase's `/fixture` route (read from `window.__GANTRY_FIXTURE__`).
 */
export function renderFixture(chart: Chart, target: Target, fx: PaintFixture): Promise<void> {
  return target === 'vanilla' ? renderVanilla(chart, fx) : renderAngular(chart, fx);
}
