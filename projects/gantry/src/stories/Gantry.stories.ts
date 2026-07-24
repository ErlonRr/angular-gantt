import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import {
  GantryComponent,
  GanttTask, GanttOptions, GanttAnnotation,
  TaskType, DependencyType, ViewMode,
} from '../public-api';

// Re-export from public-api for Storybook
import { GantryComponent as GanttCmp } from '../public-api';

// ── Shared sample data ────────────────────────────────────────
const d = (iso: string) => new Date(iso);

export const SAMPLE_TASKS: GanttTask[] = [
  {
    id: 'p1', name: 'Project Alpha', type: TaskType.Group,
    start: d('2026-01-05'), end: d('2026-05-30'),
    progress: 52, barColor: '#6366F1',
  },
  {
    id: 'p1-a', name: 'Discovery & planning', parentId: 'p1',
    start: d('2026-01-05'), end: d('2026-01-31'), progress: 100,
    baseline: { start: d('2026-01-05'), end: d('2026-02-07') },
  },
  {
    id: 'p1-b', name: 'Architecture', parentId: 'p1',
    start: d('2026-01-20'), end: d('2026-02-20'), progress: 90,
    dependency: 'p1-a',
    baseline: { start: d('2026-01-25'), end: d('2026-02-28') },
  },
  {
    id: 'p1-c', name: 'Development', parentId: 'p1',
    start: d('2026-02-10'), end: d('2026-04-10'), progress: 60,
    dependency: 'p1-b',
  },
  {
    id: 'p1-c1', name: 'Backend (locked)', parentId: 'p1-c',
    start: d('2026-02-10'), end: d('2026-03-20'), progress: 80,
    draggable: false,
  },
  {
    id: 'p1-c2', name: 'Frontend', parentId: 'p1-c',
    start: d('2026-02-25'), end: d('2026-04-10'), progress: 45,
    dependency: { taskId: 'p1-c1', type: DependencyType.SS, lag: 10 },
  },
  {
    id: 'p1-d', name: 'QA & Release', parentId: 'p1',
    start: d('2026-04-01'), end: d('2026-05-15'), progress: 10,
    dependency: [
      { taskId: 'p1-c1', type: DependencyType.FS },
      { taskId: 'p1-c2', type: DependencyType.FS },
    ] as any,
  },
  {
    id: 'ms-1', name: 'v1.0 GA', parentId: 'p1',
    type: TaskType.Milestone,
    start: d('2026-05-20'), end: d('2026-05-20'),
    barColor: '#F59E0B', dependency: 'p1-d',
  },
  {
    id: 'p2', name: 'Project Beta', type: TaskType.Group,
    start: d('2026-03-01'), end: d('2026-08-15'),
    progress: 18, barColor: '#10B981',
  },
  {
    id: 'p2-a', name: 'Research', parentId: 'p2',
    start: d('2026-03-01'), end: d('2026-04-01'), progress: 100,
  },
  {
    id: 'p2-b', name: 'Prototype', parentId: 'p2',
    start: d('2026-04-01'), end: d('2026-05-20'), progress: 40,
    dependency: 'p2-a',
    baseline: { start: d('2026-04-01'), end: d('2026-05-10') },
  },
  {
    id: 'p2-c', name: 'Beta testing', parentId: 'p2',
    start: d('2026-05-15'), end: d('2026-06-30'), progress: 5,
    dependency: 'p2-b',
  },
  {
    id: 'ms-2', name: 'Beta launch', parentId: 'p2',
    type: TaskType.Milestone,
    start: d('2026-07-31'), end: d('2026-07-31'),
    barColor: '#10B981', dependency: 'p2-c',
  },
];

export const SAMPLE_ANNOTATIONS: GanttAnnotation[] = [
  {
    x1:    d('2026-03-02'),
    x2:    d('2026-03-06'),
    color: '#8B5CF6',
    opacity: 0.07,
    label: { text: 'Code freeze', color: '#8B5CF6', fontWeight: '600' },
  },
];

// ── Meta ─────────────────────────────────────────────────────

const meta: Meta<GantryComponent> = {
  title:     'gantry/GantryComponent',
  component:  GantryComponent,
  tags:      ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**gantry** — Angular 20+ Gantt chart library.

Zero zone.js · Zero @angular/animations · Signal-based · Zoneless

\`\`\`ts
import { GantryComponent, provideGanttLib } from 'ngx-gantry';
\`\`\`
        `,
      },
    },
  },
  argTypes: {
    darkMode: {
      control: 'select',
      options: [false, true, 'auto'],
      description: 'Dark mode: false | true | "auto" (prefers-color-scheme)',
    },
    showToolbar: {
      control: 'boolean',
      description: 'Show zoom + view-mode toolbar',
    },
    enableDrag: {
      control: 'boolean',
      description: 'Allow task bar dragging',
    },
    enableResize: {
      control: 'boolean',
      description: 'Allow task bar resizing',
    },
    tooltipEnabled: {
      control: 'boolean',
      description: 'Show tooltip on bar hover',
    },
  },
};

export default meta;
type Story = StoryObj<GantryComponent>;

// ── Stories ───────────────────────────────────────────────────

export const Default: Story = {
  name:  'Default — Month view',
  args: {
    series:         SAMPLE_TASKS,
    options:        { viewMode: ViewMode.Month, rowHeight: 36, showToday: true },
    darkMode:       false,
    showToolbar:    true,
    enableDrag:     true,
    enableResize:   true,
    tooltipEnabled: true,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [darkMode]="darkMode"
        [showToolbar]="showToolbar"
        [enableDrag]="enableDrag"
        [enableResize]="enableResize"
        [tooltipEnabled]="tooltipEnabled"
      />
    `,
  }),
};

export const DarkTheme: Story = {
  name:  'Dark theme',
  args: {
    series:      SAMPLE_TASKS,
    options:     { viewMode: ViewMode.Month, rowHeight: 36, showToday: true },
    darkMode:    true,
    showToolbar: true,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [darkMode]="darkMode"
        [showToolbar]="showToolbar"
      />
    `,
  }),
  globals: {
    backgrounds: {
      value: "dark"
    }
  },
};

export const WithBaseline: Story = {
  name: 'With baseline bars',
  args: {
    series:      SAMPLE_TASKS,
    options:     { viewMode: ViewMode.Month, rowHeight: 40, baseline: true, showToday: true },
    darkMode:    false,
    showToolbar: true,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [darkMode]="darkMode"
        [showToolbar]="showToolbar"
      />
    `,
  }),
};

export const WithCriticalPath: Story = {
  name: 'With critical path',
  args: {
    series:      SAMPLE_TASKS,
    options:     { viewMode: ViewMode.Month, rowHeight: 36, criticalPath: true, showToday: true },
    darkMode:    false,
    showToolbar: true,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [showToolbar]="showToolbar"
      />
    `,
  }),
};

export const WeekView: Story = {
  name: 'Week view',
  args: {
    series:      SAMPLE_TASKS,
    options:     { viewMode: ViewMode.Week, rowHeight: 36, showToday: true },
    showToolbar: true,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [showToolbar]="showToolbar"
      />
    `,
  }),
};

export const WithAnnotations: Story = {
  name: 'With annotations',
  args: {
    series:      SAMPLE_TASKS,
    annotations: SAMPLE_ANNOTATIONS,
    options:     { viewMode: ViewMode.Month, rowHeight: 36, showToday: true },
    showToolbar: true,
  },
  render: args => ({
    props: { ...args },
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [annotations]="annotations"
        [options]="options"
        [showToolbar]="showToolbar"
      />
    `,
  }),
};

export const NoPanelNoToolbar: Story = {
  name: 'Canvas only (no panel, no toolbar)',
  args: {
    series:      SAMPLE_TASKS,
    options:     {
      viewMode:    ViewMode.Month,
      rowHeight:   36,
      panelVisible: false,
      showToday:   true,
    },
    showToolbar: false,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [showToolbar]="showToolbar"
      />
    `,
  }),
};

export const CompactRows: Story = {
  name: 'Compact rows (24px)',
  args: {
    series:      SAMPLE_TASKS,
    options:     { viewMode: ViewMode.Month, rowHeight: 24, showToday: true },
    showToolbar: true,
  },
  render: args => ({
    props: args,
    template: `
      <gantry
        [style.height]="'calc(100vh - 40px)'"
        [series]="series"
        [options]="options"
        [showToolbar]="showToolbar"
      />
    `,
  }),
};
