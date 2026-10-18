/**
 * The options playground: one model for every app that shows it (the vanilla playground and the
 * site's /playground page). Controls edit a flat `PlaygroundState`; `playgroundOptions()` turns it
 * into the `GanttOptions` the preview runs and `playgroundCode()` prints those same options in the
 * syntax of each framework. A setup travels in links through `encodeState()` / `decodeState()`.
 */

import { ViewMode, WEEK_FORMATS, type GanttOptions, type GanttScale, type ScaleFormat } from '@gantryjs/core';
import type { FrameworkId } from './site';

export interface PlaygroundState {
  viewMode: string;
  weekFormat: string;
  weekStart: number;
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
  baseline: boolean;
  criticalPath: boolean;
  inclusive: boolean;
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
}

export type PlaygroundKey = keyof PlaygroundState;

export const PLAYGROUND_DEFAULTS: Readonly<PlaygroundState> = {
  viewMode: ViewMode.Week,
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
  // The core defaults (resolveConfig): at these values the options below are left out of the code
  legendPosition: 'bottom',
  tooltipTrigger: 'auto',
  tooltipShowDelay: 320,
  tooltipHideDelay: 120,
  characterShortcuts: true,
  handleHitSize: 24,
  markerLane: 'auto',
  toolbarFit: true,
};

interface ControlBase {
  key: PlaygroundKey;
  /** Visible label. */
  label: string;
  /** The option it sets, shown next to the label (`nonWorkingTime.weekends`). */
  option: string;
  /** One line of help under the control. */
  hint?: string;
}
export type PlaygroundControl =
  | (ControlBase & { kind: 'select'; choices: readonly (readonly [string | number, string])[] })
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

const WEEK: Record<string, ScaleFormat> = {
  number: WEEK_FORMATS.number,
  label: WEEK_FORMATS.label,
  range: WEEK_FORMATS.range,
  rangeMonth: WEEK_FORMATS.rangeMonth,
  numberRange: WEEK_FORMATS.numberRange,
};
/** `WEEK_FORMATS` member names by function, to print a format as code. */
const WEEK_FORMAT_NAMES = new Map<unknown, string>(Object.entries(WEEK_FORMATS).map(([name, fn]) => [fn, name]));

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
          [1, 'Monday'],
          [0, 'Sunday'],
        ],
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
      { kind: 'range', key: 'rowHeight', label: 'Row height', option: 'rowHeight', min: 24, max: 64, unit: 'px' },
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
        kind: 'range',
        key: 'arrowRadius',
        label: 'Arrow corners',
        option: 'arrows.radius',
        min: 0,
        max: 12,
        unit: 'px',
      },
      { kind: 'check', key: 'baseline', label: 'Baseline', option: 'baseline' },
      {
        kind: 'check',
        key: 'criticalPath',
        label: 'Critical path',
        option: 'criticalPath',
        hint: 'Tasks with no slack before the last finish.',
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

/**
 * `value` when it differs from the playground default of `key`, else `undefined`: the
 * "Interaction & accessibility" options appear in the printed code only once they are changed
 * (an `undefined` option prints nothing and the chart takes the core default, the same value).
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
    bar: {
      height: `${s.barHeight}%`,
      radius: s.radius,
      label: { position: s.label as 'auto' },
      handles: { hitSize: ifChanged(s, 'handleHitSize', s.handleHitSize) },
    },
    milestone: { shape: s.milestone as 'diamond' },
    groupBar: { style: s.groupStyle as 'summary' },
    arrows: { radius: s.arrowRadius },
    stateKey: s.stateKey ? 'playground' : undefined,
    panel: { columns: PANEL_COLUMNS[s.panelCols] },
    table: { columns: TABLE_COLUMNS[s.tableCols] },
    toolbar: { fit: ifChanged(s, 'toolbarFit', s.toolbarFit) },
    legend: { position: ifChanged(s, 'legendPosition', s.legendPosition as 'bottom' | 'toolbar') },
    markers: { lane: ifChanged(s, 'markerLane', MARKER_LANE[s.markerLane] ?? 'auto') },
    keyboard: { characterShortcuts: ifChanged(s, 'characterShortcuts', s.characterShortcuts) },
    tooltip: {
      trigger: ifChanged(s, 'tooltipTrigger', s.tooltipTrigger as 'auto' | 'hover' | 'focus'),
      showDelay: ifChanged(s, 'tooltipShowDelay', s.tooltipShowDelay),
      hideDelay: ifChanged(s, 'tooltipHideDelay', s.tooltipHideDelay),
    },
  };
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
