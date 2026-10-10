import '../../demo.css';
import '@gantry/vanilla';
import { ViewMode, WEEK_FORMATS, type GanttOptions, type GanttScale, type ScaleFormat } from '@gantry/vanilla';
import { createDemoData } from '@gantry/core/demo';

const gantt = document.querySelector('gantry-element')!;
const log = document.getElementById('log')!;
const controls = document.getElementById('controls')!;
const code = document.getElementById('code')!;

// The demo plan is moved so today sits about 40% into it
const demo = createDemoData();
gantt.tasks = demo.tasks;
gantt.annotations = demo.annotations;
gantt.showLegend = true;

// ── Playground state → options ─────────────────────────────

const defaults = {
  viewMode: ViewMode.Week as string,
  weekFormat: 'number',
  weekStart: 1,
  initialScroll: 'auto',
  weekends: true,
  holiday: true,
  workStart: 9,
  workEnd: 18,
  intensive: true,
  nwStyle: 'shade',
  majorDash: false,
  rowHeight: 36,
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
};
type State = typeof defaults;
let state: State = { ...defaults };

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

const WEEK: Record<string, ScaleFormat> = {
  number: WEEK_FORMATS.number,
  label: WEEK_FORMATS.label,
  range: WEEK_FORMATS.range,
  rangeMonth: WEEK_FORMATS.rangeMonth,
  numberRange: WEEK_FORMATS.numberRange,
};

function toOptions(s: State): GanttOptions {
  const today = new Date();
  const weekScales: GanttScale[] = [
    { unit: 'month', format: 'MMMM YYYY' },
    { unit: 'week', format: WEEK[s.weekFormat] },
  ];
  return {
    viewMode: s.viewMode,
    scales: s.viewMode === ViewMode.Week ? weekScales : undefined,
    weekStart: s.weekStart as 0 | 1,
    initialScroll: s.initialScroll === 'none' ? false : (s.initialScroll as 'auto' | 'today' | 'start'),
    rowHeight: s.rowHeight,
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
    bar: { height: `${s.barHeight}%`, radius: s.radius, label: { position: s.label as 'auto' } },
    milestone: { shape: s.milestone as 'diamond' },
    groupBar: { style: s.groupStyle as 'summary' },
    arrows: { radius: s.arrowRadius },
    stateKey: s.stateKey ? 'playground' : undefined,
    panel: { columns: PANEL_COLUMNS[s.panelCols] },
    table: { columns: TABLE_COLUMNS[s.tableCols] },
  };
}

function apply(): void {
  const opts = toOptions(state);
  gantt.options = opts;
  code.textContent = JSON.stringify(opts, (_k, v) => (typeof v === 'function' ? `ƒ ${v.name || 'format'}` : v), 2);
}

// ── Controls ───────────────────────────────────────────────

type Control =
  | { kind: 'select'; key: keyof State; label: string; options: [string | number, string][] }
  | { kind: 'range'; key: keyof State; label: string; min: number; max: number; step?: number }
  | { kind: 'check'; key: keyof State; label: string };

const sections: [string, Control[]][] = [
  [
    'Timeline',
    [
      { kind: 'select', key: 'viewMode', label: 'Zoom', options: Object.values(ViewMode).map(v => [v, v]) },
      {
        kind: 'select',
        key: 'weekFormat',
        label: 'Week label',
        options: [
          ['number', 'W52'],
          ['label', 'Week 52'],
          ['range', '4–11'],
          ['rangeMonth', '4–11 Mar'],
          ['numberRange', 'W52 · 4–11'],
        ],
      },
      {
        kind: 'select',
        key: 'weekStart',
        label: 'Week starts',
        options: [
          [1, 'Monday'],
          [0, 'Sunday'],
        ],
      },
      {
        kind: 'select',
        key: 'initialScroll',
        label: 'Initial scroll',
        options: [
          ['auto', 'Auto'],
          ['today', 'Today'],
          ['start', 'First task'],
          ['none', 'None'],
        ],
      },
      { kind: 'check', key: 'majorDash', label: 'Dashed delimiters' },
      { kind: 'check', key: 'inclusive', label: 'Inclusive end dates' },
    ],
  ],
  [
    'Non-working time',
    [
      { kind: 'check', key: 'weekends', label: 'Weekends' },
      { kind: 'check', key: 'holiday', label: 'Holiday (in 2 days)' },
      { kind: 'range', key: 'workStart', label: 'Work from (Hour)', min: 0, max: 12 },
      { kind: 'range', key: 'workEnd', label: 'Work until (Hour)', min: 12, max: 24 },
      { kind: 'check', key: 'intensive', label: 'Intensive 10–12' },
      {
        kind: 'select',
        key: 'nwStyle',
        label: 'Style',
        options: [
          ['shade', 'Shade'],
          ['hatch', 'Hatch'],
          ['disabled', 'Disabled'],
        ],
      },
    ],
  ],
  [
    'Bars',
    [
      { kind: 'range', key: 'rowHeight', label: 'Row height', min: 24, max: 64 },
      { kind: 'range', key: 'barHeight', label: 'Bar height %', min: 20, max: 100, step: 5 },
      { kind: 'range', key: 'radius', label: 'Radius', min: 0, max: 16 },
      {
        kind: 'select',
        key: 'label',
        label: 'Label',
        options: [
          ['auto', 'Auto'],
          ['inside', 'Inside'],
          ['right', 'Right'],
          ['left', 'Left'],
          ['none', 'None'],
        ],
      },
      {
        kind: 'select',
        key: 'milestone',
        label: 'Milestone',
        options: [
          ['diamond', 'Diamond'],
          ['circle', 'Circle'],
          ['square', 'Square'],
        ],
      },
      {
        kind: 'select',
        key: 'groupStyle',
        label: 'Group bar',
        options: [
          ['summary', 'Summary'],
          ['bar', 'Bar'],
        ],
      },
      { kind: 'range', key: 'arrowRadius', label: 'Arrow corners', min: 0, max: 12 },
      { kind: 'check', key: 'baseline', label: 'Baseline' },
      { kind: 'check', key: 'criticalPath', label: 'Critical path' },
    ],
  ],
  [
    'Columns',
    [
      {
        kind: 'select',
        key: 'panelCols',
        label: 'Panel',
        options: [
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
        options: [
          ['default', 'Default (8, + baseline)'],
          ['everything', 'Every built-in'],
          ['schedule', 'Schedule only'],
        ],
      },
    ],
  ],
  ['State', [{ kind: 'check', key: 'stateKey', label: 'Remember layout' }]],
];

function renderControls(): void {
  controls.replaceChildren();
  for (const [title, items] of sections) {
    const h = document.createElement('h3');
    h.textContent = title;
    controls.appendChild(h);
    for (const c of items) {
      const label = document.createElement('label');
      label.append(c.label);
      const value = state[c.key];
      if (c.kind === 'select') {
        const sel = document.createElement('select');
        for (const [v, text] of c.options) sel.add(new Option(text, String(v), false, String(v) === String(value)));
        sel.addEventListener('change', () => update(c.key, typeof value === 'number' ? Number(sel.value) : sel.value));
        label.appendChild(sel);
      } else if (c.kind === 'range') {
        const out = document.createElement('output');
        out.textContent = String(value);
        const input = Object.assign(document.createElement('input'), {
          type: 'range',
          min: c.min,
          max: c.max,
          step: c.step ?? 1,
          value,
        });
        input.addEventListener('input', () => {
          out.textContent = input.value;
          update(c.key, Number(input.value));
        });
        label.append(input, out);
      } else {
        const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!value });
        input.addEventListener('change', () => update(c.key, input.checked));
        label.appendChild(input);
      }
      controls.appendChild(label);
    }
  }
}

function update<K extends keyof State>(key: K, value: State[K]): void {
  state = { ...state, [key]: value };
  apply();
}

// Keep the zoom select in sync with toolbar / keyboard zoom
gantt.addEventListener('view-mode-change', e => {
  if (state.viewMode === e.detail.viewMode) return;
  state = { ...state, viewMode: e.detail.viewMode };
  renderControls();
  apply();
});

gantt.addEventListener('task-dragged', e => {
  log.textContent = `moved ${e.detail.taskId} by ${e.detail.daysMoved} day(s)`;
});
gantt.addEventListener('task-resized', e => {
  log.textContent = `resized ${e.detail.taskId} (${e.detail.handle}) by ${e.detail.daysDelta} day(s)`;
});
gantt.addEventListener('state-change', e => {
  log.textContent = `state: ${e.detail.view} · panel ${e.detail.panelWidth ?? '—'}px · ${e.detail.viewMode}`;
});

const dark = document.getElementById('dark')!;
dark.addEventListener('click', () => {
  const on = dark.getAttribute('aria-pressed') !== 'true';
  dark.setAttribute('aria-pressed', String(on));
  gantt.darkMode = on;
});
document.getElementById('reset')!.addEventListener('click', () => {
  state = { ...defaults };
  renderControls();
  apply();
});

renderControls();
apply();
