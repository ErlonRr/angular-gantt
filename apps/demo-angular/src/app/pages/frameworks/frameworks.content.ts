/**
 * What the Frameworks page says about each binding. Every sample and claim comes from the
 * READMEs (root README, packages/{vanilla,react,vue,svelte,angular}/README.md) or the bindings'
 * source; keep them in step when an API changes.
 */
import { PACKAGES, SITE, type FrameworkId } from 'demo-kit/site';

export interface CodeFile {
  title: string;
  code: string;
}

export interface FrameworkPanel {
  /** One sentence under the tabs (backticks = code). */
  intro: string;
  files: CodeFile[];
  /** How props, events, methods, dark mode and `undefined` work in this binding. */
  notes: string[];
  readmeUrl: string;
  npmUrl: string;
}

const packageReadme = (dir: string) => `${SITE.repoUrl}/tree/main/packages/${dir}#readme`;

const HTML = `<gantry-element id="gantt" dark-mode="auto" show-legend style="height: 500px"></gantry-element>

<script type="module">
  import '@gantryjs/vanilla'; // registers <gantry-element>
  import { ViewMode, DependencyType } from '@gantryjs/vanilla';

  const gantt = document.getElementById('gantt');
  gantt.tasks = [
    { id: 'design', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
    {
      id: 'build',
      name: 'Build',
      start: new Date('2026-01-21'),
      end: new Date('2026-02-28'),
      dependency: { taskId: 'design', type: DependencyType.FS },
    },
  ];
  gantt.options = { viewMode: ViewMode.Week, criticalPath: true };

  gantt.addEventListener('task-dragged', e => console.log(e.detail.taskId, e.detail.newStart));
</script>`;

const JS = `import '@gantryjs/vanilla'; // registers <gantry-element>
import { ViewMode } from '@gantryjs/vanilla';

const gantt = document.createElement('gantry-element');
gantt.style.height = '500px'; // it fills its container: give it a height
gantt.tasks = [
  { id: 'design', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
  { id: 'build', name: 'Build', start: new Date('2026-01-21'), end: new Date('2026-02-28'), dependency: 'design' },
];
gantt.options = { viewMode: ViewMode.Week, criticalPath: true };
gantt.darkMode = 'auto';

gantt.addEventListener('task-dragged', e => console.log(e.detail.taskId, e.detail.daysMoved));
gantt.addEventListener('selection-change', e => console.log(e.detail.selectedIds));

document.querySelector('#app').append(gantt);
document.querySelector('#today').addEventListener('click', () => gantt.scrollToToday());`;

const ANGULAR = `// app.component.ts
import { Component, signal, viewChild } from '@angular/core';
import { GantryComponent, ViewMode, type GanttTask, type TaskDragEvent } from '@gantryjs/angular';

@Component({
  selector: 'app-root',
  imports: [GantryComponent],
  template: \`
    <button type="button" (click)="gantt().scrollToToday()">Today</button>
    <gantry
      style="height: 480px"
      [series]="tasks"
      [options]="{ rowHeight: 36, baseline: true }"
      [(viewMode)]="zoom"
      showLegend
      (taskDragged)="onDrag($event)"
    />
  \`,
})
export class AppComponent {
  readonly gantt = viewChild.required(GantryComponent);

  /** Two-way: the toolbar, the + / - keys and setViewMode() write the level back */
  readonly zoom = signal<string | undefined>(ViewMode.Month);

  readonly tasks: GanttTask[] = [
    { id: '1', name: 'Discovery', start: new Date('2026-01-05'), end: new Date('2026-01-31'), progress: 100 },
    {
      id: '2',
      name: 'Build',
      start: new Date('2026-02-01'),
      end: new Date('2026-03-15'),
      progress: 40,
      dependency: '1',
    },
  ];

  onDrag(event: TaskDragEvent): void {
    console.log(\`\${event.taskId} moved by \${event.daysMoved} days\`);
  }
}`;

const ANGULAR_MAIN = `// main.ts — optional: defaults for every chart below this level
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideGantt } from '@gantryjs/angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideGantt({ darkMode: 'auto', locale: 'it' })],
});`;

const REACT = `import { useRef, useState } from 'react';
import { Gantry, ViewMode, type GantryElement, type GanttTask } from '@gantryjs/react';

export function Roadmap() {
  const gantt = useRef<GantryElement>(null);
  const [tasks, setTasks] = useState<GanttTask[]>([
    { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
  ]);

  return (
    <div style={{ height: 500 }}>
      <button onClick={() => gantt.current?.scrollToToday()}>Today</button>
      <Gantry
        ref={gantt}
        tasks={tasks}
        options={{ viewMode: ViewMode.Week, criticalPath: true }}
        darkMode="auto"
        onTaskDragged={e =>
          setTasks(ts => ts.map(t => (t.id === e.taskId ? { ...t, start: e.newStart, end: e.newEnd } : t)))
        }
        onSelectionChange={e => console.log(e.selectedIds)}
      />
    </div>
  );
}`;

const VUE = `<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Gantry, ViewMode, type GanttTask, type TaskDragEvent } from '@gantryjs/vue';

const gantt = shallowRef<InstanceType<typeof Gantry>>();
const tasks = ref<GanttTask[]>([
  { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
]);

function onDragged(e: TaskDragEvent) {
  const task = tasks.value.find(t => t.id === e.taskId);
  if (task) Object.assign(task, { start: e.newStart, end: e.newEnd });
}
</script>

<template>
  <div style="height: 500px">
    <button @click="gantt?.element?.scrollToToday()">Today</button>
    <Gantry
      ref="gantt"
      :tasks="tasks"
      :options="{ viewMode: ViewMode.Week, criticalPath: true }"
      dark-mode="auto"
      @task-dragged="onDragged"
      @selection-change="e => console.log(e.selectedIds)"
    />
  </div>
</template>`;

const SVELTE = `<script lang="ts">
  import { Gantry, ViewMode, type GantryElement, type GanttTask, type TaskDragEvent } from '@gantryjs/svelte';

  let gantt = $state<GantryElement>();
  // \`$state.raw\`: no proxy around every task; assign a new array to update the chart
  let tasks = $state.raw<GanttTask[]>([
    { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
  ]);
  let viewMode = $state<string>(ViewMode.Week);

  function moved(e: TaskDragEvent) {
    tasks = tasks.map(t => (t.id === e.taskId ? { ...t, start: e.newStart, end: e.newEnd } : t));
  }
</script>

<div style="height: 500px">
  <button onclick={() => gantt?.scrollToToday()}>Today</button>
  <Gantry
    bind:element={gantt}
    {tasks}
    options={{ viewMode, criticalPath: true }}
    darkMode="auto"
    onTaskDragged={moved}
    onViewModeChange={e => (viewMode = e.viewMode)}
    onSelectionChange={e => console.log(e.selectedIds)}
  />
</div>`;

export const PANELS: Record<FrameworkId, FrameworkPanel> = {
  html: {
    intro:
      'A standard custom element: import the package once and use `<gantry-element>` in any page. Flags are attributes; tasks and options are properties.',
    files: [{ title: 'index.html', code: HTML }],
    notes: [
      'Attributes: `dark-mode` (`"true"`, `"false"` or `"auto"`), `show-toolbar`, `enable-drag`, `enable-resize`, `tooltip-enabled` and `show-legend` (present = `true`, `"false"` = `false`), and `view-mode` (calls `setViewMode()`).',
      'Removing an attribute restores the property’s default. The element never writes attributes back.',
      'Data goes in properties: `tasks`, `options`, `columns`, `annotations`, `dataSource` and `renderBar`.',
      'Give the element a height: it fills its container (`display: block; height: 100%`).',
      'Events are `CustomEvent`s that bubble and cross the shadow boundary, with the payload in `event.detail`. `before-change` is cancelable: `event.preventDefault()` (or `event.detail.preventDefault()`) vetoes an edit; so is `before-export`, for a `download()` or `print()`.',
    ],
    readmeUrl: packageReadme('vanilla'),
    npmUrl: PACKAGES.vanilla.npmUrl,
  },
  js: {
    intro: 'The same element from code: create it, set its properties, listen to its events and call its methods.',
    files: [{ title: 'main.js', code: JS }],
    notes: [
      "`document.createElement('gantry-element')` and `querySelector` return a typed `GantryElement`, and `addEventListener` types each event’s `detail`.",
      'Replace an array to update it (`gantt.tasks = [...gantt.tasks, task]`). Re-assigning equal `options` changes nothing.',
      'Assigning `undefined` restores a property’s default (`gantt.options = undefined`). Properties set before the element is defined are applied when it upgrades.',
      'Methods: `zoomIn()`, `setViewMode(mode)`, `scrollToToday()`, `scrollToTask(id)`, `getState()` / `setState(state)`, for editing `undo()`, `redo()`, `editCell(id, key)`, `addDependency()` and `focusTask(id)`, and the async exports `exportSvg()`, `exportCsv()`, `exportPng()`, `download(format)` and `print()`. Read-only: `viewMode`, `view`, `criticalIds`, `canUndo` and `canRedo`.',
      "Dark mode: `darkMode = true`, `false` or `'auto'` (follows `prefers-color-scheme`); the element matches `:state(dark)` while it is dark.",
    ],
    readmeUrl: packageReadme('vanilla'),
    npmUrl: PACKAGES.vanilla.npmUrl,
  },
  angular: {
    intro:
      'Native Angular components, not a wrapper: signals, zoneless, `OnPush`, rendered on the server. `<gantry>` paints the same core model as the Web Component.',
    files: [
      { title: 'app.component.ts', code: ANGULAR },
      { title: 'main.ts', code: ANGULAR_MAIN },
    ],
    notes: [
      'Inputs: `series` (the tasks; a model, `[(series)]` gets the edited tasks back), `options`, `columns`, `annotations`, `dataSource`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`, `tooltipEnabled` and `showLegend`. Boolean inputs take attribute values: `showLegend` is `true`, `showToolbar="false"` is `false`.',
      '`viewMode` is a model: `[(viewMode)]="zoom"` stays in sync with the toolbar, the `+` / `-` keys and `setViewMode()`.',
      'Outputs: `(taskDragged)`, `(taskResized)`, `(selectionChange)`, `(rowClick)`, `(rowDblClick)`, `(viewModeChange)`, `(stateChange)`, `(loadError)` and `(retry)`, plus the editing outputs `(beforeChange)`, `(tasksChange)`, `(taskUpdated)`, `(taskProgressChanged)`, `(dependencyCreated)`, `(dependencyDeleted)` and `(historyChange)`, and the export outputs `(beforeExport)` and `(export)`.',
      'Editing (`options.editing`): `(beforeChange)` is vetoed with `$event.preventDefault()`; `undo()`, `redo()`, `editCell()`, `addDependency()` and the `canUndo()` / `canRedo()` signals are on the component. A custom cell editor is an `<ng-template ganttCellEditor let-edit>` (import `GanttCellEditorDirective`).',
      "Methods on the component: `viewChild(GantryComponent)`, then `zoomIn()`, `scrollToTask(id)`, `getState()`, …, and the async exports (`await chart().download('svg')`, `exportCsv()`, `print()`; `(beforeExport)` is vetoed with `$event.preventDefault()`). `exportSvg()` and `exportCsv()` also work during server rendering.",
      "Dark mode: `[darkMode]` takes `true`, `false` or `'auto'`; left `undefined`, the `provideGantt({ darkMode })` default applies, else light. `provideGantt()` is optional and sets defaults (theme, dark mode, locale, labels, formats) for the application, a route or a component.",
    ],
    readmeUrl: `${SITE.repoUrl}#angular-gantryjsangular`,
    npmUrl: PACKAGES.angular.npmUrl,
  },
  react: {
    intro:
      'A thin wrapper over `<gantry-element>` for React 18 and 19: props in, callbacks out, the element on the ref.',
    files: [{ title: 'Roadmap.tsx', code: REACT }],
    notes: [
      'Props are the element’s properties (`tasks`, `options`, `darkMode`, …) plus `className`, `style` and any HTML attribute. They are set before the chart paints its first frame, so it never shows its defaults first.',
      'Callbacks receive the event `detail`: `onTaskDragged`, `onTaskResized`, `onSelectionChange`, `onRowClick`, `onRowDblClick`, `onViewModeChange`, `onStateChange`, `onLoadError`, `onRetry` and the editing ones (`onBeforeChange`, `onTasksChange`, `onTaskUpdated`, `onTaskProgressChanged`, `onDependencyCreated`, `onDependencyDeleted`, `onHistoryChange`) and the export ones (`onBeforeExport`, `onExport`). The latest callback is called, without re-adding listeners.',
      'With `options={{ editing: true }}`, keep the tasks from `onTasksChange={d => setTasks(d.tasks)}` and veto a change with `d.preventDefault()` in `onBeforeChange` (synchronously).',
      'Props are compared by reference: pass a new array or object to update. Keep `dataSource`, `renderBar` and `columns` stable (`useMemo`, `useCallback`, state); `options` can be an inline object.',
      'Setting a prop back to `undefined` (or leaving it out) restores the element’s default, e.g. `showToolbar={compact ? false : undefined}`.',
      'The `ref` is the `GantryElement` with its methods (the exports are async: `await ref.current?.download(\'svg\')`); dark mode is `darkMode="auto"` or your own theme flag (`darkMode={isDark}`).',
    ],
    readmeUrl: packageReadme('react'),
    npmUrl: PACKAGES.react.npmUrl,
  },
  vue: {
    intro:
      'A thin wrapper over `<gantry-element>` for Vue 3.5+: props, emitted events and a template ref. No `isCustomElement` compiler configuration needed.',
    files: [{ title: 'Roadmap.vue', code: VUE }],
    notes: [
      'Props are the element’s properties. An omitted prop keeps the element’s default (booleans are not cast to `false`), and a prop that becomes `undefined` restores it.',
      'Events carry the event detail: `@task-dragged`, `@task-resized`, `@selection-change`, `@row-click`, `@row-dblclick`, `@view-mode-change`, `@state-change`, `@load-error`, `@retry`, the editing ones (`@before-change`, `@tasks-change`, `@task-updated`, `@task-progress-changed`, `@dependency-created`, `@dependency-deleted`, `@history-change`) and the export ones (`@before-export`, `@export`).',
      'With `:options="{ editing: true }"`, keep the tasks (a `shallowRef`) from `@tasks-change="d => (tasks = d.tasks)"` and veto a change with `d.preventDefault()` in `@before-change` (synchronously).',
      "The template ref exposes `element`: the `GantryElement` with its methods (the exports are async: `await chart.value?.element?.download('svg')`), already set in the parent’s `onMounted`.",
      'Array props are watched one level deep (`push`, `splice`, replacing an item); changing a field of an item is not: replace the item. An inline `:options="{ … }"` costs nothing.',
      'Dark mode: `dark-mode="auto"`, or bind it to your theme (`:dark-mode="isDark"`).',
    ],
    readmeUrl: packageReadme('vue'),
    npmUrl: PACKAGES.vue.npmUrl,
  },
  svelte: {
    intro: 'A runes-based wrapper over `<gantry-element>` for Svelte 5: props, callback props and `bind:element`.',
    files: [{ title: 'Roadmap.svelte', code: SVELTE }],
    notes: [
      'Props are the element’s properties, each set only when it changes. Other props (`class`, `id`, `style`, `aria-*`, attributes such as `dark-mode`) go to the element.',
      'Callback props receive the event `detail`: `onTaskDragged`, `onSelectionChange`, `onViewModeChange`, `onTasksChange`, `onBeforeChange`, `onBeforeExport`, `onExport`, …. The listeners are attached before the first property is set, so events fired while the chart starts arrive too.',
      "`bind:element` gives the `GantryElement` with its methods (`zoomIn()`, `scrollToTask()`, `setState()`, …, and the async exports: `await gantt?.download('svg')`).",
      'A prop you never pass leaves the element alone; a prop that goes back to `undefined` restores the element’s default.',
      '`tasks`, `columns`, `annotations` and `options` are copied one level: assigning a new array always updates the chart, and so do `push` / `splice` on `$state`. For large plans keep tasks in `$state.raw`.',
    ],
    readmeUrl: packageReadme('svelte'),
    npmUrl: PACKAGES.svelte.npmUrl,
  },
};

/** Server-side rendering, per binding (READMEs: Angular "Server-side rendering", React / Vue / Svelte SSR). */
export const SSR_NOTES: { label: string; text: string }[] = [
  {
    label: 'Angular',
    text: "`<gantry>` renders on the server: the HTML already has the rows, the bars, the theme tokens and the `region` role. Observers, timers and listeners start after the first browser render; with `darkMode: 'auto'` the chart is light until the browser reports the colour scheme. `exportSvg()` and `exportCsv()` work on the server too.",
  },
  {
    label: 'React',
    text: '`renderToString` and streaming render an empty `<gantry-element>` with its class, style and attributes, without touching DOM APIs; the chart renders in the browser once the element is defined and the component hydrates.',
  },
  {
    label: 'Vue',
    text: '`renderToString` emits an empty `<gantry-element>` with its layout style and your attributes; props and listeners are set on the client when it hydrates.',
  },
  {
    label: 'Svelte',
    text: '`svelte/server` and SvelteKit SSR emit an empty `<gantry-element>` with your attributes; the chart starts when the component hydrates or mounts.',
  },
  {
    label: 'Web Component',
    text: 'Importing `@gantryjs/vanilla` where `HTMLElement` does not exist is safe: the element is only registered where `customElements` exists.',
  },
];

export const SERVER_CODE = `// server.ts — @gantryjs/core has no DOM and no framework: it runs in Node
import { computeCriticalPath, createExportSource, exportChartCsv, exportChartSvg, DependencyType } from '@gantryjs/core';

const tasks = [
  { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20') },
  {
    id: 'b',
    name: 'Build',
    start: new Date('2026-01-21'),
    end: new Date('2026-02-28'),
    dependency: { taskId: 'a', type: DependencyType.FS },
  },
];
const { criticalIds } = computeCriticalPath(tasks);

// The same SVG and CSV the charts' exportSvg() and exportCsv() give in the browser
const source = createExportSource({ tasks, options: { viewMode: 'Week', criticalPath: true } });
const svg = exportChartSvg(source, { theme: 'light' });
const csv = exportChartCsv(source, { columns: 'all' });`;

export const TYPES_CODE = `import { GANTRY_EVENTS, type GanttOptions } from '@gantryjs/vanilla';

// <gantry-element> is in HTMLElementTagNameMap: this is a GantryElement | null
const gantt = document.querySelector('gantry-element');

// addEventListener types each event's detail (a TaskDragEvent here)
gantt?.addEventListener('task-dragged', e => console.log(e.detail.taskId, e.detail.daysMoved));

// Options are checked like any other object
const options: GanttOptions = { viewMode: 'Week', criticalPath: true };

// The callback prop each wrapper uses for an event
GANTRY_EVENTS['task-dragged']; // 'onTaskDragged'`;

export const CSP_CODE = `Content-Security-Policy: style-src 'self'; script-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'`;

export const CSP_NOTES: string[] = [
  'The shadow tree is built node by node: no HTML parsing, no `innerHTML`.',
  'Its CSS is one constructable stylesheet per document, shared by every instance, plus a per-instance theme sheet, both through `adoptedStyleSheets`.',
  'Every style is a CSSOM property write; the host gets no `style` attribute.',
  "A strict `style-src` needs constructable stylesheets (Chromium 73+, Firefox 101+, Safari 16.4+). Older engines fall back to a `<style>` element and inline theme variables, which need `style-src 'unsafe-inline'`. There is no nonce option.",
  "Exports, in every binding: `exportPng()`, `download('png')` and `print()` draw the SVG from a `blob:` URL, so they need `img-src blob:`; SVG and CSV downloads need nothing more. The print frame is built node by node too (no `srcdoc`) and gets its page CSS as a constructable stylesheet.",
];

export const LOCALE_CODE = `// The same options object in every binding
gantt.options = {
  locale: 'it', // any BCP 47 tag: month and day names come from Intl
  formats: { dateFormat: 'D MMM YYYY' }, // task-list columns and tooltip dates
  labels: { todayButton: 'Oggi' }, // any UI string; the rest stays English
  endDateMode: 'inclusive', // a date-only end covers that whole day
};`;

export const LOCALE_NOTES: string[] = [
  'Dates are formatted with the platform’s `Intl` API: no locale files to import, no runtime dependency.',
  "`locale` takes any BCP 47 tag (`'it'`, `'de-CH'`, `'pt-BR'`, `'ja'`); unknown or malformed tags fall back to `'en'`, the default.",
  "`new Date('2026-01-05')` (UTC midnight) is read as that calendar day in local time, and the x axis follows local calendar days, so daylight-saving changes never shift bars.",
  'In Angular, `provideGantt({ locale, labels, formats })` sets the defaults for every chart below that level.',
];
