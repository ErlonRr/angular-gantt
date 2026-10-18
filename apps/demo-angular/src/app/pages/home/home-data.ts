// Data of the home page: the hero plan and the example cards, built relative to today
// (calendar-day arithmetic through `addDays`, never milliseconds).

import { DependencyType, TaskType, addDays, type GanttOptions, type GanttTask } from 'ngx-gantry';
import { FRAMEWORKS } from 'demo-kit/site';

/** The hero's plan: four phases linked finish-to-start, then the launch milestone. */
export function launchPlan(today: Date): GanttTask[] {
  const at = (n: number) => addDays(today, n);
  return [
    { id: 'discovery', name: 'Discovery', start: at(-12), end: at(-8), progress: 100 },
    { id: 'design', name: 'Design', start: at(-8), end: at(-3), progress: 100, dependency: 'discovery' },
    { id: 'build', name: 'Build', start: at(-3), end: at(4), progress: 55, dependency: 'design' },
    { id: 'qa', name: 'QA', start: at(4), end: at(8), progress: 10, dependency: 'build' },
    { id: 'launch', name: 'Launch', type: TaskType.Milestone, start: at(8), end: at(8), dependency: 'qa' },
  ];
}

export interface ExampleCard {
  id: string;
  title: string;
  /** The option the card is about, shown as a tag */
  tag: string;
  text: string;
  /** The options that make the example, as code */
  snippet: string;
  options: GanttOptions;
  tasks: GanttTask[];
}

/** Every mini chart: timeline only, compact rows, a name of its own for screen readers. */
function mini(name: string, options: GanttOptions): GanttOptions {
  return {
    view: 'chart',
    panel: { collapsible: false },
    rowHeight: 32,
    timelinePadding: 2,
    ...options,
    labels: { ariaChart: name },
  };
}

/** Today, or the next Monday when today is a weekend: the working-hours example needs a workday. */
function workday(today: Date): Date {
  const dow = today.getDay();
  return dow === 6 ? addDays(today, 2) : dow === 0 ? addDays(today, 1) : today;
}

export function exampleCards(today: Date): ExampleCard[] {
  const at = (n: number) => addDays(today, n);
  const day = workday(today);
  const hour = (h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);

  return [
    {
      id: 'critical',
      title: 'Dependencies and critical path',
      tag: 'criticalPath',
      text: 'Finish-to-start and start-to-start links are drawn as arrows, and the chain that sets the end date is highlighted.',
      snippet: `{ criticalPath: true }\n// a task: dependency: { taskId: 'api', type: 'SS', lag: 2 }`,
      options: mini('Critical path example', { criticalPath: true, viewMode: 'Week' }),
      tasks: [
        { id: 'api', name: 'API', start: at(-3), end: at(4), progress: 70 },
        {
          id: 'ui',
          name: 'UI',
          start: at(-1),
          end: at(5),
          progress: 40,
          dependency: { taskId: 'api', type: DependencyType.SS, lag: 2 },
        },
        { id: 'docs', name: 'Docs', start: at(4), end: at(7), progress: 0, dependency: 'api' },
        { id: 'tests', name: 'Tests', start: at(5), end: at(9), progress: 0, dependency: 'ui' },
      ],
    },
    {
      id: 'baseline',
      title: 'Baselines',
      tag: 'baseline',
      text: 'Each task keeps its planned dates; the chart draws them under the live bar, so a slip shows at a glance.',
      snippet: `{ baseline: true }\n// a task: baseline: { start, end }`,
      options: mini('Baselines example', { baseline: true, viewMode: 'Week' }),
      tasks: [
        {
          id: 'research',
          name: 'Research',
          start: at(-9),
          end: at(-4),
          progress: 100,
          baseline: { start: at(-9), end: at(-5) },
        },
        {
          id: 'prototype',
          name: 'Prototype',
          start: at(-4),
          end: at(3),
          progress: 60,
          baseline: { start: at(-5), end: at(0) },
          dependency: 'research',
        },
        {
          id: 'pilot',
          name: 'Pilot',
          start: at(3),
          end: at(8),
          progress: 0,
          baseline: { start: at(0), end: at(5) },
          dependency: 'prototype',
        },
      ],
    },
    {
      id: 'hours',
      title: 'Working hours',
      tag: 'nonWorkingTime',
      text: 'In the Hour zoom, the time outside the working day is shaded; weekends and holidays work the same way.',
      snippet: `{\n  viewMode: 'Hour',\n  nonWorkingTime: { workingHours: { start: 9, end: 17 } },\n}`,
      options: mini('Working hours example', {
        viewMode: 'Hour',
        // A day either side, so the working day can be centred with the evening and morning around it
        timelinePadding: 1,
        initialScroll: hour(12, 45),
        nonWorkingTime: { workingHours: { start: 9, end: 17 } },
      }),
      tasks: [
        { id: 'triage', name: 'Triage', start: hour(9), end: hour(10, 30), progress: 100 },
        { id: 'pairing', name: 'Pairing', start: hour(10, 30), end: hour(12, 30), progress: 60, dependency: 'triage' },
        {
          id: 'review',
          name: 'Code review',
          start: hour(13, 30),
          end: hour(15, 30),
          progress: 0,
          dependency: 'pairing',
        },
        { id: 'deploy', name: 'Deploy', start: hour(15, 30), end: hour(16, 30), progress: 0, dependency: 'review' },
      ],
    },
    {
      id: 'table',
      title: 'Table view',
      tag: 'view',
      text: 'The same tasks as a sortable table with the columns you pick; status comes from the dates and progress.',
      snippet: `{\n  view: 'table',\n  table: { columns: ['name', 'status', 'end', 'progress'] },\n}`,
      options: mini('Table view example', { view: 'table', table: { columns: ['name', 'status', 'end', 'progress'] } }),
      tasks: [
        { id: 'brief', name: 'Brief', start: at(-10), end: at(-6), progress: 100 },
        { id: 'copy', name: 'Copy', start: at(-6), end: at(-1), progress: 80 },
        { id: 'wireframes', name: 'Wireframes', start: at(-5), end: at(3), progress: 50 },
        { id: 'handoff', name: 'Handoff', start: at(4), end: at(6), progress: 0 },
      ],
    },
  ];
}

export interface Feature {
  title: string;
  /** Plain text; spans between backticks are code */
  text: string;
}

/** A feature's text cut into plain and code parts (code between backticks). */
export function textParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((part, i) => ({ text: part, code: i % 2 === 1 }));
}

export const FEATURES: readonly Feature[] = [
  {
    title: 'Same options everywhere',
    text: 'One options object drives the Web Component, Angular, React, Vue and Svelte, and every option behaves the same in each.',
  },
  {
    title: 'Drag, resize, select',
    text: 'Move and resize bars with the mouse or the keyboard, select one row or many, and get events with the old and new dates.',
  },
  {
    title: 'Working time',
    text: 'Weekends, holidays and the hours outside the working day are shaded; focus hours get a colour of their own.',
  },
  {
    title: 'Keyboard and screen readers',
    text: 'Roving focus through rows and controls, live announcements of moves, zoom and selection, and palettes that meet WCAG AA.',
  },
  {
    title: 'Theme with CSS variables',
    text: 'Set `--gantt-*` custom properties or `options.theme`. Light and dark are built in, and the Web Component needs no inline styles.',
  },
  {
    title: 'Big plans stay fast',
    text: 'Rows and timeline are windowed, so 10,000 tasks scroll smoothly; a lazy data source loads pages as you scroll.',
  },
];

export interface Stat {
  value: string;
  label: string;
}

export const STATS: readonly Stat[] = [
  { value: '0', label: 'runtime dependencies' },
  {
    value: String(FRAMEWORKS.length),
    label: `ways to use it: ${FRAMEWORKS.map(f => f.label).join(', ')}`,
  },
  { value: '1', label: 'option set, the same in every framework' },
  { value: '48.8', label: 'KB gzip for the Web Component with core' },
];
