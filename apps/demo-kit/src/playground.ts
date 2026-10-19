/**
 * The options playground: one model for every app that shows it (the vanilla playground and the
 * site's /playground page). Controls edit a flat `PlaygroundState`; `playgroundOptions()` turns it
 * into the `GanttOptions` the preview runs and `playgroundCode()` prints those same options in the
 * syntax of each framework. A setup travels in links through `encodeState()` / `decodeState()`.
 * `editEventText()` words the editing events the same way in both event logs.
 */

import {
  DEFAULT_LABELS,
  ViewMode,
  WEEK_FORMATS,
  describeChange,
  type DependencyChangeEvent,
  type GanttBeforeChangeEvent,
  type GanttDensity,
  type GanttEditingOptions,
  type GanttHistoryState,
  type GanttOptions,
  type GanttRollupOptions,
  type GanttScale,
  type GanttStyleOptions,
  type GanttTasksChangeEvent,
  type ScaleFormat,
  type TaskProgressEvent,
  type TaskUpdatedEvent,
  type WeekNumbering,
  type WeekStart,
} from '@gantryjs/core';
import type { FrameworkId } from './site';

export interface PlaygroundState {
  viewMode: string;
  weekFormat: string;
  /** A first day of the week (`WeekStart`), or `'rule'`: unset, the week-numbering rule's own */
  weekStart: number | string;
  weekNumbering: string;
  initialScroll: string;
  weekends: boolean;
  holiday: boolean;
  workStart: number;
  workEnd: number;
  intensive: boolean;
  nwStyle: string;
  majorDash: boolean;
  rowHeight: number;
  barHeight: number;
  radius: number;
  label: string;
  milestone: string;
  groupStyle: string;
  arrowRadius: number;
  arrowRouting: string;
  baseline: boolean;
  criticalPath: boolean;
  rollup: boolean;
  rollupColor: string;
  rollupProgress: string;
  rollupSegments: boolean;
  groupsCollapsed: boolean;
  stylePreset: string;
  inclusive: boolean;
  density: string;
  responsive: string;
  panelToggle: boolean;
  toolbarOverflow: string;
  stateKey: boolean;
  panelCols: string;
  tableCols: string;
  legendPosition: string;
  tooltipTrigger: string;
  tooltipShowDelay: number;
  tooltipHideDelay: number;
  characterShortcuts: boolean;
  handleHitSize: number;
  markerLane: string;
  toolbarFit: boolean;
  readoutFormat: string;
  /** `'off'` or `'on'`: the switch of the Editing section, whose other controls apply only while it is on */
  editing: string;
  editCells: boolean;
  editProgress: boolean;
  progressStep: number;
  linkCreate: boolean;
  linkDelete: boolean;
  linkParentChild: boolean;
  historyLimit: number;
  toolbarUndo: boolean;
}

export type PlaygroundKey = keyof PlaygroundState;

export const PLAYGROUND_DEFAULTS: Readonly<PlaygroundState> = {
  viewMode: ViewMode.Week,
  weekFormat: 'number',
  initialScroll: 'auto',
  weekends: true,
  holiday: true,
  workStart: 9,
  workEnd: 18,
  intensive: true,
  nwStyle: 'shade',
  majorDash: false,
  rowHeight: 36, // The rows of the default density: left out of the code at this value
  barHeight: 60,
  radius: 4,
  label: 'auto',
  milestone: 'diamond',
  groupStyle: 'summary',
  arrowRadius: 4,
  baseline: false,
  criticalPath: false,
  inclusive: false,
  stateKey: false,
  panelCols: 'default',
  tableCols: 'default',
  // The core defaults (resolveConfig): at these values the options below are left out of the code
  weekStart: 'rule',
  weekNumbering: 'auto',
  arrowRouting: 'orthogonal',
  rollup: false,
  rollupColor: 'none',
  rollupProgress: 'duration',
  rollupSegments: false,
  groupsCollapsed: false,
  stylePreset: 'none',
  density: 'normal',
  responsive: 'on',
  panelToggle: false,
  toolbarOverflow: 'menu',
  legendPosition: 'bottom',
  tooltipTrigger: 'auto',
  tooltipShowDelay: 320,
  tooltipHideDelay: 120,
  characterShortcuts: true,
  handleHitSize: 24,
  markerLane: 'auto',
  toolbarFit: true,
  readoutFormat: 'scale',
  // `editing` (resolveEditing): off by default; on, every feature but parent–child links
  editing: 'off',
  editCells: true,
  editProgress: true,
  progressStep: 5,
  linkCreate: true,
  linkDelete: true,
  linkParentChild: false,
  historyLimit: 100,
  toolbarUndo: true,
};

interface ControlBase {
  key: PlaygroundKey;
  /** Visible label. */
  label: string;
  /** The option it sets, shown next to the label (`nonWorkingTime.weekends`). */
  option: string;
  /** One line of help under the control. */
  hint?: string;
  /** The control applies only while this holds; otherwise the playgrounds show it disabled (`controlEnabled`). */
  when?: (s: PlaygroundState) => boolean;
}
export type PlaygroundControl =
  | (ControlBase & { kind: 'select'; choices: readonly (readonly [string | number, string])[] })
  /** A row of toggle buttons (`div.gs-seg` > `button.gs-seg-btn[aria-pressed]`), for two or three short choices */
  | (ControlBase & { kind: 'segmented'; choices: readonly (readonly [string, string])[] })
  | (ControlBase & { kind: 'range'; min: number; max: number; step?: number; unit?: string })
  | (ControlBase & { kind: 'check' });

export interface PlaygroundSection {
  title: string;
  controls: readonly PlaygroundControl[];
}

/** Column-key presets for the split panel and the table view (`panel.columns` / `table.columns`). */
const PANEL_COLUMNS: Record<string, string[] | undefined> = {
  default: undefined,
  status: ['name', 'status', 'start', 'progress'],
  minimal: ['name'],
  legacy: ['name', 'start', 'end', 'duration', 'progress'],
};
const TABLE_COLUMNS: Record<string, string[] | undefined> = {
  default: undefined,
  everything: [
    'id',
    'name',
    'type',
    'status',
    'start',
    'end',
    'duration',
    'progress',
    'predecessors',
    'baselineStart',
    'baselineEnd',
    'variance',
  ],
  schedule: ['name', 'start', 'end', 'duration'],
};

/**
 * `styles` presets. Declarative layers only: a `rule` callback could neither travel in a link nor
 * print as code. The sample plan gives its groups and milestones colours of their own (`task.style`
 * wins over every layer), so the presets also tint rows and size bars.
 */
const STYLE_PRESETS: Record<string, GanttStyleOptions | undefined> = {
  none: undefined,
  parents: { parent: { color: '#64748B', rowColor: 'rgba(100, 116, 139, 0.12)' } },
  levels: {
    levels: [{ rowColor: 'rgba(99, 102, 241, 0.08)' }, { color: '#0EA5E9' }, { color: '#8B5CF6', height: '45%' }],
  },
};

/** `responsive` for the `responsive` choice: `on` is the core default, left out of the code. */
const RESPONSIVE: Record<string, GanttOptions['responsive']> = { on: undefined, off: false, table: { view: 'table' } };

const WEEK: Record<string, ScaleFormat> = {
  number: WEEK_FORMATS.number,
  label: WEEK_FORMATS.label,
  range: WEEK_FORMATS.range,
  rangeMonth: WEEK_FORMATS.rangeMonth,
  numberRange: WEEK_FORMATS.numberRange,
};
/** `WEEK_FORMATS` member names by function, to print a format as code. */
const WEEK_FORMAT_NAMES = new Map<unknown, string>(Object.entries(WEEK_FORMATS).map(([name, fn]) => [fn, name]));

/** The Editing controls apply while editing is on. */
const editingOn = (s: PlaygroundState): boolean => s.editing === 'on';

export const PLAYGROUND_SECTIONS: readonly PlaygroundSection[] = [
  {
    title: 'Timeline',
    controls: [
      {
        kind: 'select',
        key: 'viewMode',
        label: 'Zoom',
        option: 'viewMode',
        choices: Object.values(ViewMode).map(v => [v, v] as const),
        hint: 'The toolbar, + and − keep this in sync.',
      },
      {
        kind: 'select',
        key: 'weekFormat',
        label: 'Week label',
        option: 'scales',
        choices: [
          ['number', 'W52'],
          ['label', 'Week 52'],
          ['range', '4–11'],
          ['rangeMonth', '4–11 Mar'],
          ['numberRange', 'W52 · 4–11'],
        ],
        hint: 'A WEEK_FORMATS entry for the week tier (Week zoom).',
      },
      {
        kind: 'select',
        key: 'weekStart',
        label: 'Week starts',
        option: 'weekStart',
        choices: [
          ['rule', 'From the rule'],
          [1, 'Monday'],
          [0, 'Sunday'],
          [6, 'Saturday'],
        ],
        hint: 'From the rule: the week numbers’ own first day (Sunday for US, the locale’s for locale).',
      },
      {
        kind: 'select',
        key: 'weekNumbering',
        label: 'Week numbers',
        option: 'weekNumbering',
        choices: [
          ['auto', 'Auto (US from Sunday, else ISO)'],
          ['iso', 'ISO 8601'],
          ['us', 'US'],
          ['locale', 'The chart locale’s rule'],
        ],
        hint: 'ISO is exact only with Monday; weekStart overrides the rule’s first day.',
      },
      {
        kind: 'select',
        key: 'initialScroll',
        label: 'Initial scroll',
        option: 'initialScroll',
        choices: [
          ['auto', 'Auto'],
          ['today', 'Today'],
          ['start', 'First task'],
          ['none', 'None'],
        ],
        hint: 'Auto opens on today when it is near the tasks, else on the first task.',
      },
      { kind: 'check', key: 'majorDash', label: 'Dashed delimiters', option: 'gridLines.major' },
      { kind: 'check', key: 'inclusive', label: 'Inclusive end dates', option: 'endDateMode' },
    ],
  },
  {
    title: 'Non-working time',
    controls: [
      { kind: 'check', key: 'weekends', label: 'Weekends', option: 'nonWorkingTime.weekends' },
      { kind: 'check', key: 'holiday', label: 'Holiday in 2 days', option: 'nonWorkingTime.holidays' },
      {
        kind: 'range',
        key: 'workStart',
        label: 'Work from',
        option: 'nonWorkingTime.workingHours.start',
        min: 0,
        max: 12,
        unit: 'h',
        hint: 'Shaded off-hours show in the Hour zoom.',
      },
      {
        kind: 'range',
        key: 'workEnd',
        label: 'Work until',
        option: 'nonWorkingTime.workingHours.end',
        min: 12,
        max: 24,
        unit: 'h',
      },
      { kind: 'check', key: 'intensive', label: 'Focus hours 10–12', option: 'nonWorkingTime.intensiveHours' },
      {
        kind: 'select',
        key: 'nwStyle',
        label: 'Style',
        option: 'nonWorkingTime.style',
        choices: [
          ['shade', 'Shade'],
          ['hatch', 'Hatch'],
          ['disabled', 'Disabled'],
        ],
      },
    ],
  },
  {
    title: 'Bars',
    controls: [
      {
        kind: 'range',
        key: 'rowHeight',
        label: 'Row height',
        option: 'rowHeight',
        min: 24,
        max: 64,
        unit: 'px',
        hint: 'At 36 px the density decides; any other height wins over it.',
      },
      {
        kind: 'range',
        key: 'barHeight',
        label: 'Bar height',
        option: 'bar.height',
        min: 20,
        max: 100,
        step: 5,
        unit: '%',
      },
      { kind: 'range', key: 'radius', label: 'Radius', option: 'bar.radius', min: 0, max: 16, unit: 'px' },
      {
        kind: 'select',
        key: 'label',
        label: 'Label',
        option: 'bar.label.position',
        choices: [
          ['auto', 'Auto'],
          ['inside', 'Inside'],
          ['right', 'Right'],
          ['left', 'Left'],
          ['none', 'None'],
        ],
        hint: 'Auto puts the name inside when it fits, else after the bar.',
      },
      {
        kind: 'select',
        key: 'milestone',
        label: 'Milestone',
        option: 'milestone.shape',
        choices: [
          ['diamond', 'Diamond'],
          ['circle', 'Circle'],
          ['square', 'Square'],
        ],
      },
      {
        kind: 'select',
        key: 'groupStyle',
        label: 'Group bar',
        option: 'groupBar.style',
        choices: [
          ['summary', 'Summary'],
          ['bar', 'Bar'],
        ],
      },
      {
        kind: 'check',
        key: 'groupsCollapsed',
        label: 'Parents start collapsed',
        option: 'groupBar.collapsed',
        hint: 'With Roll up parents, the parents-only view.',
      },
      {
        kind: 'range',
        key: 'arrowRadius',
        label: 'Arrow corners',
        option: 'arrows.radius',
        min: 0,
        max: 12,
        unit: 'px',
      },
      {
        kind: 'select',
        key: 'arrowRouting',
        label: 'Arrow routing',
        option: 'arrows.routing',
        choices: [
          ['orthogonal', 'Orthogonal'],
          ['straight', 'Straight'],
        ],
      },
      { kind: 'check', key: 'baseline', label: 'Baseline', option: 'baseline' },
      {
        kind: 'check',
        key: 'criticalPath',
        label: 'Critical path',
        option: 'criticalPath',
        hint: 'Tasks with no slack before the last finish.',
      },
      {
        kind: 'check',
        key: 'rollup',
        label: 'Roll up parents',
        option: 'rollup',
        hint: 'Parents take the progress and dates of their children (their bars no longer drag).',
      },
      {
        kind: 'select',
        key: 'rollupColor',
        label: 'Rollup colour',
        option: 'rollup.color',
        choices: [
          ['none', 'The parent’s style'],
          ['status', 'The children’s status'],
        ],
        hint: 'With Roll up parents: overdue when a child is, done when all are.',
      },
      {
        kind: 'select',
        key: 'rollupProgress',
        label: 'Rollup progress',
        option: 'rollup.progress',
        choices: [
          ['duration', 'Weighted by duration'],
          ['count', 'Plain mean'],
          ['off', 'The parent’s own'],
        ],
        hint: 'With Roll up parents: how a parent’s progress comes from its children.',
      },
      {
        kind: 'check',
        key: 'rollupSegments',
        label: 'Rollup segments',
        option: 'rollup.segments',
        hint: 'With Roll up parents: a collapsed parent draws its children in their own colours.',
      },
      {
        kind: 'select',
        key: 'stylePreset',
        label: 'Styles',
        option: 'styles',
        choices: [
          ['none', 'None'],
          ['parents', 'Parent rows'],
          ['levels', 'By level'],
        ],
        hint: 'Default styles by parent or depth; a task’s own style wins over them.',
      },
    ],
  },
  {
    title: 'Layout',
    controls: [
      {
        kind: 'select',
        key: 'density',
        label: 'Density',
        option: 'density',
        choices: [
          ['compact', 'Compact (28 px rows)'],
          ['normal', 'Normal (36 px rows)'],
          ['comfortable', 'Comfortable (44 px rows)'],
        ],
        hint: 'Rows, header and toolbar controls together. A changed row height wins.',
      },
      {
        kind: 'select',
        key: 'responsive',
        label: 'Narrow chart',
        option: 'responsive',
        choices: [
          ['on', 'Timeline only'],
          ['table', 'Table only'],
          ['off', 'Keep the view'],
        ],
        hint: 'What a chart under 640 px wide shows. A view picked while narrow wins.',
      },
      {
        kind: 'check',
        key: 'panelToggle',
        label: 'Task list button',
        option: 'toolbar.panelToggle',
        hint: 'A toolbar button that shows or hides the task list.',
      },
      {
        kind: 'select',
        key: 'toolbarOverflow',
        label: 'Toolbar overflow',
        option: 'toolbar.overflow',
        choices: [
          ['menu', 'More menu'],
          ['wrap', 'Wrap'],
        ],
        hint: 'Where the toolbar controls that do not fit go.',
      },
    ],
  },
  {
    title: 'Columns',
    controls: [
      {
        kind: 'select',
        key: 'panelCols',
        label: 'Panel',
        option: 'panel.columns',
        choices: [
          ['default', 'Name · Start · End · %'],
          ['status', 'Name · Status · Start · %'],
          ['minimal', 'Name only'],
          ['legacy', '1.x (5 columns)'],
        ],
      },
      {
        kind: 'select',
        key: 'tableCols',
        label: 'Table view',
        option: 'table.columns',
        choices: [
          ['default', 'Default (8, + baseline)'],
          ['everything', 'Every built-in'],
          ['schedule', 'Schedule only'],
        ],
        hint: 'The toolbar switches between chart, split and table views.',
      },
    ],
  },
  {
    title: 'Interaction & accessibility',
    controls: [
      {
        kind: 'select',
        key: 'tooltipTrigger',
        label: 'Tooltip opens on',
        option: 'tooltip.trigger',
        choices: [
          ['auto', 'Hover, focus and tap'],
          ['hover', 'Hover only'],
          ['focus', 'Keyboard focus only'],
        ],
      },
      {
        kind: 'range',
        key: 'tooltipShowDelay',
        label: 'Tooltip delay',
        option: 'tooltip.showDelay',
        min: 0,
        max: 1000,
        step: 40,
        unit: 'ms',
        hint: 'How long the pointer rests on a bar first. Focus opens it at once.',
      },
      {
        kind: 'range',
        key: 'tooltipHideDelay',
        label: 'Tooltip close delay',
        option: 'tooltip.hideDelay',
        min: 0,
        max: 1000,
        step: 20,
        unit: 'ms',
        hint: 'How long it stays after the pointer leaves, so the pointer can move onto it.',
      },
      {
        kind: 'check',
        key: 'characterShortcuts',
        label: 'Character shortcuts',
        option: 'keyboard.characterShortcuts',
        hint: '+ and − zoom, T goes to today, F fits. Turn off when they clash with the page.',
      },
      {
        kind: 'select',
        key: 'readoutFormat',
        label: 'Drag readout dates',
        option: 'formats.readoutFormat',
        choices: [
          ['scale', 'By scale (4 Mar, 4 Mar 09:00)'],
          ['ddd D MMM', 'Wed 4 Mar'],
          ['D MMM YYYY', '4 Mar 2026'],
          ['YYYY-MM-DD', '2026-03-04'],
        ],
        hint: 'The dates in the chip that shows the new dates while you drag or move a bar.',
      },
      {
        kind: 'range',
        key: 'handleHitSize',
        label: 'Resize target',
        option: 'bar.handles.hitSize',
        min: 16,
        max: 40,
        unit: 'px',
        hint: 'Pointer target at each end of a bar (24 meets WCAG 2.5.8).',
      },
      {
        kind: 'select',
        key: 'markerLane',
        label: 'Marker lane',
        option: 'markers.lane',
        choices: [
          ['auto', 'Auto'],
          ['on', 'On'],
          ['off', 'Off'],
        ],
        hint: 'A header lane for today and the annotation labels. Auto shows it when an annotation has a label.',
      },
      {
        kind: 'select',
        key: 'legendPosition',
        label: 'Legend',
        option: 'legend.position',
        choices: [
          ['bottom', 'Under the chart'],
          ['toolbar', 'In the toolbar'],
        ],
      },
      {
        kind: 'check',
        key: 'toolbarFit',
        label: 'Fit button',
        option: 'toolbar.fit',
        hint: 'Picks the finest zoom that shows every task.',
      },
    ],
  },
  {
    title: 'Editing',
    controls: [
      {
        kind: 'segmented',
        key: 'editing',
        label: 'Editing',
        option: 'editing',
        choices: [
          ['off', 'Off'],
          ['on', 'On'],
        ],
        hint: 'Cells, progress, links and undo; the controls below need it on. Drag and resize work either way.',
      },
      {
        kind: 'check',
        key: 'editCells',
        label: 'Edit cells',
        option: 'editing.cells',
        hint: 'F2, Enter, typing or a double-click edits a task list cell.',
        when: editingOn,
      },
      {
        kind: 'check',
        key: 'editProgress',
        label: 'Progress grip',
        option: 'editing.progress',
        hint: 'Drag the grip on a bar, or ↑ and ↓ while moving a bar with the keyboard.',
        when: editingOn,
      },
      {
        kind: 'range',
        key: 'progressStep',
        label: 'Progress step',
        option: 'editing.progress.step',
        min: 1,
        max: 25,
        unit: '%',
        hint: 'How far the progress grip and ↑ / ↓ move the progress in one step.',
        when: s => editingOn(s) && s.editProgress,
      },
      {
        kind: 'check',
        key: 'linkCreate',
        label: 'Create links',
        option: 'editing.dependencies.create',
        hint: 'Drag from the dot at a bar’s end to another bar, click one then the other, or press L on a bar.',
        when: editingOn,
      },
      {
        kind: 'check',
        key: 'linkDelete',
        label: 'Delete links',
        option: 'editing.dependencies.delete',
        hint: 'Click an arrow, then press Delete.',
        when: editingOn,
      },
      {
        kind: 'check',
        key: 'linkParentChild',
        label: 'Parent–child links',
        option: 'editing.dependencies.parentChild',
        hint: 'Lets a task depend on its own parent or child.',
        when: editingOn,
      },
      {
        kind: 'range',
        key: 'historyLimit',
        label: 'Undo history',
        option: 'editing.history.limit',
        min: 10,
        max: 200,
        step: 10,
        unit: 'steps',
        hint: 'Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z or Ctrl+Y redoes.',
        when: editingOn,
      },
      {
        kind: 'check',
        key: 'toolbarUndo',
        label: 'Undo buttons',
        option: 'toolbar.undo',
        hint: 'Undo and Redo in the toolbar.',
        when: editingOn,
      },
    ],
  },
  {
    title: 'State',
    controls: [
      {
        kind: 'check',
        key: 'stateKey',
        label: 'Remember layout',
        option: 'stateKey',
        hint: 'Saves the zoom, view, panel width and collapsed rows in localStorage.',
      },
    ],
  },
];

/** `markers.lane` for the `markerLane` choice. */
const MARKER_LANE: Record<string, 'auto' | boolean> = { auto: 'auto', on: true, off: false };

/** `rollup.progress` for the `rollupProgress` choice. */
const ROLLUP_PROGRESS: Record<string, GanttRollupOptions['progress']> = {
  duration: 'duration',
  count: 'count',
  off: false,
};

/**
 * `rollup` for the state: left out while parents don't roll up, `true` with every rollup choice at
 * its default, else an object with the changed ones (the colour, progress and segments only count
 * while parents roll up).
 */
function rollupOption(s: PlaygroundState): GanttOptions['rollup'] {
  if (!s.rollup) return undefined;
  const rollup: GanttRollupOptions = {};
  if (s.rollupColor === 'status') rollup.color = 'status';
  if (s.rollupProgress !== PLAYGROUND_DEFAULTS.rollupProgress) rollup.progress = ROLLUP_PROGRESS[s.rollupProgress];
  if (s.rollupSegments) rollup.segments = true;
  return Object.keys(rollup).length ? rollup : true;
}

/**
 * `editing` for the state: left out while editing is off, `true` with every feature at its default,
 * else the object form with the changed features only (in that form an unset feature is on, and
 * parent–child links are off unless set). Links read `false` once none of them is allowed.
 */
function editingOption(s: PlaygroundState): GanttOptions['editing'] {
  if (!editingOn(s)) return undefined;
  const editing: GanttEditingOptions = {};
  if (!s.editCells) editing.cells = false;
  if (!s.editProgress) editing.progress = false;
  else if (s.progressStep !== PLAYGROUND_DEFAULTS.progressStep) editing.progress = { step: s.progressStep };
  if (!s.linkCreate && !s.linkDelete && !s.linkParentChild) editing.dependencies = false;
  else {
    const deps: Exclude<GanttEditingOptions['dependencies'], boolean | undefined> = {};
    if (!s.linkCreate) deps.create = false;
    if (!s.linkDelete) deps.delete = false;
    if (s.linkParentChild) deps.parentChild = true;
    if (Object.keys(deps).length) editing.dependencies = deps;
  }
  if (s.historyLimit !== PLAYGROUND_DEFAULTS.historyLimit) editing.history = { limit: s.historyLimit };
  return Object.keys(editing).length ? editing : true;
}

/**
 * `value` when it differs from the playground default of `key`, else `undefined`: these options
 * appear in the printed code only once they are changed (an `undefined` option prints nothing and
 * the chart takes the core default, the same value). `rowHeight` too, so `density` sizes the rows
 * until the row height is changed.
 */
function ifChanged<K extends PlaygroundKey, V>(s: PlaygroundState, key: K, value: V): V | undefined {
  return s[key] === PLAYGROUND_DEFAULTS[key] ? undefined : value;
}

/** The options the preview runs for `state` (`today` places the sample holiday). */
export function playgroundOptions(s: PlaygroundState, today: Date): GanttOptions {
  const weekScales: GanttScale[] = [
    { unit: 'month', format: 'MMMM YYYY' },
    { unit: 'week', format: WEEK[s.weekFormat] ?? WEEK_FORMATS.number },
  ];
  return {
    viewMode: s.viewMode,
    scales: s.viewMode === ViewMode.Week ? weekScales : undefined,
    // 'rule' (the default) leaves it out: the week-numbering rule's own first day
    weekStart: ifChanged(s, 'weekStart', s.weekStart as WeekStart),
    weekNumbering: ifChanged(s, 'weekNumbering', s.weekNumbering as WeekNumbering),
    initialScroll: s.initialScroll === 'none' ? false : (s.initialScroll as 'auto' | 'today' | 'start'),
    density: ifChanged(s, 'density', s.density as GanttDensity),
    rowHeight: ifChanged(s, 'rowHeight', s.rowHeight),
    responsive: RESPONSIVE[s.responsive],
    baseline: s.baseline,
    criticalPath: s.criticalPath,
    endDateMode: s.inclusive ? 'inclusive' : 'exclusive',
    gridLines: { major: s.majorDash ? { dash: '4 3', width: 1.5 } : {} },
    nonWorkingTime: {
      weekends: s.weekends,
      holidays: s.holiday
        ? [{ start: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2), label: 'Holiday' }]
        : [],
      workingHours: { start: s.workStart, end: s.workEnd },
      intensiveHours: s.intensive ? [{ start: 10, end: 12, label: 'Focus' }] : [],
      style: s.nwStyle as 'shade' | 'hatch' | 'disabled',
    },
    bar: {
      height: `${s.barHeight}%`,
      radius: s.radius,
      label: { position: s.label as 'auto' },
      handles: { hitSize: ifChanged(s, 'handleHitSize', s.handleHitSize) },
    },
    milestone: { shape: s.milestone as 'diamond' },
    groupBar: { style: s.groupStyle as 'summary', collapsed: ifChanged(s, 'groupsCollapsed', s.groupsCollapsed) },
    arrows: {
      radius: s.arrowRadius,
      routing: ifChanged(s, 'arrowRouting', s.arrowRouting as 'orthogonal' | 'straight'),
    },
    rollup: rollupOption(s),
    styles: STYLE_PRESETS[s.stylePreset],
    stateKey: s.stateKey ? 'playground' : undefined,
    panel: { columns: PANEL_COLUMNS[s.panelCols] },
    table: { columns: TABLE_COLUMNS[s.tableCols] },
    toolbar: {
      panelToggle: ifChanged(s, 'panelToggle', s.panelToggle),
      fit: ifChanged(s, 'toolbarFit', s.toolbarFit),
      overflow: ifChanged(s, 'toolbarOverflow', s.toolbarOverflow as 'menu' | 'wrap'),
      // The buttons show only while the chart keeps history: the choice counts while editing is on
      undo: editingOn(s) ? ifChanged(s, 'toolbarUndo', s.toolbarUndo) : undefined,
    },
    legend: { position: ifChanged(s, 'legendPosition', s.legendPosition as 'bottom' | 'toolbar') },
    markers: { lane: ifChanged(s, 'markerLane', MARKER_LANE[s.markerLane] ?? 'auto') },
    keyboard: { characterShortcuts: ifChanged(s, 'characterShortcuts', s.characterShortcuts) },
    formats: { readoutFormat: ifChanged(s, 'readoutFormat', s.readoutFormat) },
    tooltip: {
      trigger: ifChanged(s, 'tooltipTrigger', s.tooltipTrigger as 'auto' | 'hover' | 'focus'),
      showDelay: ifChanged(s, 'tooltipShowDelay', s.tooltipShowDelay),
      hideDelay: ifChanged(s, 'tooltipHideDelay', s.tooltipHideDelay),
    },
    editing: editingOption(s),
  };
}

/**
 * What the preview runs besides taking the new options when the state goes from `before` to
 * `after`: `groupBar.collapsed` only seeds the rows a chart has not seen yet, so turning it on or
 * off collapses or expands the rows already shown (`chart[command]()`).
 */
export function playgroundCommand(before: PlaygroundState, after: PlaygroundState): 'collapseAll' | 'expandAll' | null {
  if (before.groupsCollapsed === after.groupsCollapsed) return null;
  return after.groupsCollapsed ? 'collapseAll' : 'expandAll';
}

/** A range value with its unit, as every playground shows it: `36 px`, `600 ms`, `9 h`, `60%`. */
export function valueText(value: number, unit: string | undefined): string {
  if (!unit) return String(value);
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/**
 * Whether `control` applies in `state`: the Editing controls only while editing is on (the
 * progress step also needs the progress grip). Playgrounds show the others disabled; their values
 * stay in the state and the link, and count again once the control applies.
 */
export function controlEnabled(control: PlaygroundControl, state: PlaygroundState): boolean {
  return control.when?.(state) ?? true;
}

/** The keys whose value differs from the playground defaults. */
export function changedKeys(s: PlaygroundState): PlaygroundKey[] {
  return (Object.keys(PLAYGROUND_DEFAULTS) as PlaygroundKey[]).filter(k => s[k] !== PLAYGROUND_DEFAULTS[k]);
}

/** Returns `state` with `key` set, if `value` is valid for that control (else `state` unchanged). */
export function withValue(state: PlaygroundState, key: PlaygroundKey, value: unknown): PlaygroundState {
  const control = CONTROLS.get(key);
  if (!control || !isValid(control, value)) return state;
  return { ...state, [key]: value };
}

const CONTROLS = new Map<PlaygroundKey, PlaygroundControl>(
  PLAYGROUND_SECTIONS.flatMap(s => s.controls.map(c => [c.key, c] as const)),
);

function isValid(c: PlaygroundControl, v: unknown): boolean {
  switch (c.kind) {
    case 'check':
      return typeof v === 'boolean';
    case 'range':
      return typeof v === 'number' && Number.isFinite(v) && v >= c.min && v <= c.max;
    case 'select':
    case 'segmented':
      return c.choices.some(([value]) => value === v);
  }
}

/** URL-safe text for the changed keys (the playground's `?setup=` parameter); `''` for the defaults. */
export function encodeState(s: PlaygroundState): string {
  const changed = Object.fromEntries(changedKeys(s).map(k => [k, s[k]]));
  if (!Object.keys(changed).length) return '';
  return btoa(JSON.stringify(changed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The state a link carries: defaults plus every valid key of `text` (unknown or invalid keys are dropped). */
export function decodeState(text: string | null | undefined): PlaygroundState {
  let state: PlaygroundState = { ...PLAYGROUND_DEFAULTS };
  if (!text) return state;
  try {
    const parsed: unknown = JSON.parse(atob(text.replace(/-/g, '+').replace(/_/g, '/')));
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) state = withValue(state, k as PlaygroundKey, v);
    }
  } catch {
    // A broken link opens the defaults
  }
  return state;
}

// ── Events ──────────────────────────────────────────────────

/** The editing events both playground logs list, by DOM name, with their details. */
export interface PlaygroundEditEvents {
  'before-change': GanttBeforeChangeEvent;
  'task-progress-changed': TaskProgressEvent;
  'dependency-created': DependencyChangeEvent;
  'dependency-deleted': DependencyChangeEvent;
  'task-updated': TaskUpdatedEvent;
  'tasks-change': GanttTasksChangeEvent;
  'history-change': GanttHistoryState;
}
export type PlaygroundEditEvent = keyof PlaygroundEditEvents;

/** A task's name by id, for the log lines. */
type NameOf = (taskId: string) => string;

/** `Design → Build · FS`, `Design → Build · SS +2d`. */
function linkText(d: DependencyChangeEvent, nameOf: NameOf): string {
  const lag = d.lag ? ` ${d.lag > 0 ? '+' : ''}${d.lag}d` : '';
  return `${nameOf(d.fromId)} → ${nameOf(d.toId)} · ${d.type}${lag}`;
}

const EDIT_EVENT_TEXT: { [K in PlaygroundEditEvent]: (detail: PlaygroundEditEvents[K], nameOf: NameOf) => string } = {
  'before-change': (d, nameOf) =>
    `${d.change.source} · ${describeChange(d.change, nameOf, DEFAULT_LABELS) || 'no change'}`,
  'task-progress-changed': (d, nameOf) =>
    `${nameOf(d.taskId)} · ${Math.round(d.oldProgress)}% → ${Math.round(d.newProgress)}%`,
  'dependency-created': linkText,
  'dependency-deleted': linkText,
  'task-updated': (d, nameOf) => `${nameOf(d.taskId)} · ${d.fields.join(', ')}`,
  'tasks-change': d => `${d.change.source} · ${d.applied ? 'applied' : 'not applied'} · ${d.tasks.length} tasks`,
  'history-change': d => `${d.undoCount} to undo · ${d.redoCount} to redo`,
};

/** The editing events, in the order the chart fires them (the op events after `before-change`). */
export const PLAYGROUND_EDIT_EVENTS = Object.keys(EDIT_EVENT_TEXT) as PlaygroundEditEvent[];

/**
 * The line both playground logs show for an editing event (the Web Component's DOM event, or
 * Angular's output of the same name in camelCase), with tasks by name: `drag · Design moved 2
 * days later`, `Design · 40% → 45%`, `Design → Build · FS`, `2 to undo · 0 to redo`.
 */
export function editEventText<K extends PlaygroundEditEvent>(
  event: K,
  detail: PlaygroundEditEvents[K],
  nameOf: NameOf,
): string {
  return EDIT_EVENT_TEXT[event](detail, nameOf);
}

// ── Code ────────────────────────────────────────────────────

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** `undefined`, or a plain object holding only such values: printing it changes nothing. */
function isBlank(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return false;
  return Object.values(value).every(isBlank);
}

/** JavaScript source for an options value: dates as `new Date(y, m, d)`, week formats by name. */
function toSource(value: unknown, indent: string, uses: Set<string>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'function') {
    const name = WEEK_FORMAT_NAMES.get(value);
    if (!name) return '() => …';
    uses.add('WEEK_FORMATS');
    return `WEEK_FORMATS.${name}`;
  }
  if (value instanceof Date) return `new Date(${value.getFullYear()}, ${value.getMonth()}, ${value.getDate()})`;
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    const items = value.map(v => toSource(v, inner, uses));
    const flat = `[${items.join(', ')}]`;
    return flat.length <= 64 && !flat.includes('\n')
      ? flat
      : `[\n${items.map(i => inner + i).join(',\n')},\n${indent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => !isBlank(v));
    if (!entries.length) return '{}';
    const items = entries.map(([k, v]) => `${IDENT.test(k) ? k : `'${k}'`}: ${toSource(v, inner, uses)}`);
    const flat = `{ ${items.join(', ')} }`;
    return flat.length <= 64 && !flat.includes('\n')
      ? flat
      : `{\n${items.map(i => inner + i).join(',\n')},\n${indent}}`;
  }
  return 'undefined';
}

/** The options of `state` as an object literal, plus the names it needs from the package. */
export function optionsSource(s: PlaygroundState, today: Date, indent = ''): { source: string; uses: string[] } {
  const uses = new Set<string>();
  const source = toSource(playgroundOptions(s, today), indent, uses);
  return { source, uses: [...uses] };
}

/**
 * What the preview runs, in the syntax of `framework`: the chart with `tasks` from your app and
 * the playground's options. Dates print as `new Date(year, monthIndex, day)`.
 */
export function playgroundCode(s: PlaygroundState, framework: FrameworkId, today: Date): string {
  switch (framework) {
    case 'html': {
      const { source, uses } = optionsSource(s, today, '  ');
      return [
        `<gantry-element id="plan" style="height: 480px"></gantry-element>`,
        ``,
        `<script type="module">`,
        `  import '@gantryjs/vanilla';`,
        ...(uses.length ? [`  import { ${uses.join(', ')} } from '@gantryjs/vanilla';`] : []),
        ``,
        `  const chart = document.querySelector('#plan');`,
        `  chart.tasks = tasks; // GanttTask[]`,
        `  chart.options = ${source};`,
        `</script>`,
      ].join('\n');
    }
    case 'js': {
      const { source, uses } = optionsSource(s, today);
      return [
        `import '@gantryjs/vanilla'; // defines <gantry-element>`,
        ...(uses.length ? [`import { ${uses.join(', ')} } from '@gantryjs/vanilla';`] : []),
        ``,
        `const chart = document.createElement('gantry-element');`,
        `chart.style.height = '480px';`,
        `chart.tasks = tasks; // GanttTask[]`,
        `chart.options = ${source};`,
        `document.body.append(chart);`,
      ].join('\n');
    }
    case 'react': {
      const { source, uses } = optionsSource(s, today);
      return [
        `import { Gantry${uses.map(u => `, ${u}`).join('')}, type GanttOptions, type GanttTask } from '@gantryjs/react';`,
        ``,
        `// Outside the component: the same object on every render`,
        `const options: GanttOptions = ${source};`,
        ``,
        `export function Plan({ tasks }: { tasks: GanttTask[] }) {`,
        `  return <Gantry tasks={tasks} options={options} style={{ height: 480 }} />;`,
        `}`,
      ].join('\n');
    }
    case 'vue': {
      const { source, uses } = optionsSource(s, today);
      return [
        `<script setup lang="ts">`,
        `import { Gantry${uses.map(u => `, ${u}`).join('')}, type GanttOptions, type GanttTask } from '@gantryjs/vue';`,
        ``,
        `defineProps<{ tasks: GanttTask[] }>();`,
        `const options: GanttOptions = ${source};`,
        `</script>`,
        ``,
        `<template>`,
        `  <Gantry :tasks="tasks" :options="options" style="height: 480px" />`,
        `</template>`,
      ].join('\n');
    }
    case 'angular': {
      const { source, uses } = optionsSource(s, today, '  ');
      return [
        `import { Component, input } from '@angular/core';`,
        `import { GantryComponent${uses.map(u => `, ${u}`).join('')}, type GanttOptions, type GanttTask } from '@gantryjs/angular';`,
        ``,
        `@Component({`,
        `  selector: 'app-plan',`,
        `  imports: [GantryComponent],`,
        `  template: \`<gantry [series]="tasks()" [options]="options" style="height: 480px" />\`,`,
        `})`,
        `export class Plan {`,
        `  readonly tasks = input.required<GanttTask[]>();`,
        `  readonly options: GanttOptions = ${source};`,
        `}`,
      ].join('\n');
    }
    case 'svelte': {
      const { source, uses } = optionsSource(s, today, '  ');
      return [
        `<script lang="ts">`,
        `  import { Gantry${uses.map(u => `, ${u}`).join('')}, type GanttOptions, type GanttTask } from '@gantryjs/svelte';`,
        ``,
        `  let { tasks }: { tasks: GanttTask[] } = $props();`,
        `  const options: GanttOptions = ${source};`,
        `</script>`,
        ``,
        `<Gantry {tasks} {options} style="height: 480px" />`,
      ].join('\n');
    }
  }
}
