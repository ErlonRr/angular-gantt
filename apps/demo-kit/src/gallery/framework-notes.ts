/**
 * Known differences between the bindings: the site's Frameworks page lists them all, and each
 * gallery case shows the ones it runs into. Text uses backticks for code (the pages render them as
 * code spans). Checked against the bindings' source; keep them in step when an API changes.
 */

import { GALLERY_FRAMEWORKS, type CaseId, type GalleryFramework, type NoteId } from './catalog';

export interface FrameworkNote {
  id: NoteId;
  /** The bindings the note is about */
  frameworks: readonly GalleryFramework[];
  /** Short topic ("Events", "Custom content"…) */
  area: string;
  text: string;
  /** What to do about it */
  workaround?: string;
  /** When the difference goes away, if planned */
  until?: string;
  /** Gallery cases that run into it */
  cases: readonly CaseId[];
}

const ALL = GALLERY_FRAMEWORKS;

export const FRAMEWORK_NOTES: readonly FrameworkNote[] = [
  {
    id: 'tasks-input',
    frameworks: ['angular'],
    area: 'Inputs',
    text: 'The tasks are the `[series]` input in Angular and the `tasks` property or prop everywhere else.',
    cases: [],
  },
  {
    id: 'series-model',
    frameworks: ALL,
    area: 'Data',
    text: 'After an edit, Angular writes the new tasks back to `[(series)]` (without a data source) and also emits `(tasksChange)`; the other bindings keep the edited tasks in the chart and report them in `tasks-change` (`onTasksChange` in React and Svelte, `@tasks-change` in Vue). With `editing.controlled` nothing is applied: set the tasks yourself from the event in every binding.',
    workaround:
      'Pass `detail.tasks` on as the new array. Svelte copies the `tasks` prop one level, so keep app-owned tasks in `$state.raw`.',
    cases: ['controlled', 'working-days', 'critical-float', 'resource-panel'],
  },
  {
    id: 'view-mode-event',
    frameworks: ['angular'],
    area: 'Events',
    text: 'Angular’s `(viewModeChange)` emits the level name (it is the change half of `[(viewMode)]`); the other bindings emit `{ viewMode }`.',
    cases: ['tree'],
  },
  {
    id: 'before-change',
    frameworks: ALL,
    area: 'Events',
    text: 'Veto a change by calling `preventDefault()` on the `before-change` detail: `(beforeChange)` in Angular, `onBeforeChange` in React and Svelte, `@before-change` in Vue. The Web Component’s event is also cancelable, so `event.preventDefault()` works there too. Either way the veto must be synchronous. Setting the tasks inside the handler counts as handling the change (nothing is applied twice); in Angular only `chart.series.set()` or a data-source write does, because a new `[series]` binding reaches the chart at the next change detection.',
    workaround:
      'To approve a change asynchronously (a server, a dialog), turn on `editing.controlled` and set the tasks once the answer arrives.',
    cases: ['controlled'],
  },
  {
    id: 'before-export',
    frameworks: ALL,
    area: 'Events',
    text: 'Veto a `download()` or `print()`, from the toolbar’s Export menu or from code, by calling `preventDefault()` on the `before-export` detail: `(beforeExport)` in Angular, `onBeforeExport` in React and Svelte, `@before-export` in Vue. The Web Component’s event is also cancelable, so `event.preventDefault()` works there too. Either way the veto must be synchronous. Angular emits the event inside the `download()` / `print()` call; the Web Component (and so React, Vue and Svelte) fires it once its export code has loaded (a lazy chunk, fetched on the first export), so code right after the call runs before it. Every binding draws the chart as it was when the method was called.',
    workaround:
      'To do something else with the file (upload it, say), veto the download and call `exportSvg()`, `exportPng()` or `exportCsv()` yourself: they return the data and fire no event.',
    cases: ['export-toolbar'],
  },
  {
    id: 'empty-content',
    frameworks: ALL,
    area: 'Custom content',
    text: 'Empty-state content: the Web Component and React take a `<div slot="empty">` child; Vue takes `<template #empty>` (or the same `<div slot="empty">`); Svelte takes the `empty` snippet (a `<div slot="empty">` written directly inside `<Gantry>` is not rendered); Angular projects `[ganttEmpty]` content. In every binding the content stays in the page’s DOM, so page CSS styles it.',
    workaround:
      'In Angular, `[ganttEmpty]` content inside `@if` fills the slot even while the condition is false, so the default text never shows: put the condition inside the element, or set `labels.emptyState`.',
    cases: ['states'],
  },
  {
    id: 'custom-bars',
    frameworks: ALL,
    area: 'Custom content',
    text: 'Custom bars are components in Angular (`provideGanttBar`, extending `GanttBarBase`); the other bindings use `renderBar`, a function that returns an SVG element, so no framework component renders inside a bar, and the element sits in the chart’s shadow root (page CSS reaches it only through `::part`).',
    cases: ['custom-bars', 'export-toolbar'],
  },
  {
    id: 'export-custom-bars',
    frameworks: ALL,
    area: 'Export',
    text: 'Exports draw custom bars as on screen: the Web Component, React, Vue and Svelte serialize the SVG element `renderBar` returns, and Angular renders each custom bar component once off-screen and serializes it (a component that extends a built-in bar counts as custom; a built-in component reused for another `barType` is drawn as built-in, and so is every bar during server rendering). Only attributes and inline styles travel: classes and stylesheet rules (page CSS, `::part`, an Angular component’s `styles`) don’t, and `foreignObject` and scripts are dropped.',
    workaround:
      "Paint custom bars with attributes (`fill`, `stroke`; `[attr.fill]` in an Angular template), from `ctx.visual.paint` or your own colours, or export them as built-in bars with `customBars: 'builtin'`.",
    cases: ['export-toolbar'],
  },
  {
    id: 'custom-cells',
    frameworks: ALL,
    area: 'Custom content',
    text: 'Custom cells are an `<ng-template let-row>` inside an `<ng-container ganttColumn>` (or a `TemplateRef` in `cellTemplate`) in Angular, styled by page CSS; elsewhere `cellTemplate` is a function that returns a DOM node or a string, rendered inside the chart’s shadow root.',
    workaround:
      'Outside Angular, style the node inline (the CSSOM) with the `--gantt-*` variables, which reach into the shadow root, and give it `part` names to reach it from page CSS (forced colours, say).',
    cases: ['custom-columns', 'custom-editors'],
  },
  {
    id: 'custom-tooltip',
    frameworks: ALL,
    area: 'Custom content',
    text: 'A custom tooltip is an `<ng-template ganttTooltip>` in Angular, which wins over `tooltip.render`; elsewhere `tooltip.render` returns a string or a DOM node, shown inside the chart’s shadow root (Vue can render a component into that node with `render(h(Card, props), el)`).',
    workaround:
      'Keep `tooltip.render` free of side effects: the chart decides when to call it again. Outside Angular, style the node inline with the `--gantt-*` variables.',
    cases: ['tooltip'],
  },
  {
    id: 'cell-editor',
    frameworks: ALL,
    area: 'Custom content',
    text: 'A custom cell editor is an `<ng-template ganttCellEditor let-edit>` inside an `<ng-container ganttColumn>` in Angular (a function also works); elsewhere the column’s `editor` is a function that takes the edit context and returns a DOM node, mounted in the chart’s shadow root, so no framework component renders inside it. In every binding the chart focuses the editor and handles Enter, Tab and Escape. Angular consumers import `GanttCellEditorDirective` next to `GanttColumnDefDirective`; without it the editor template is taken for the cell template.',
    workaround:
      'Outside Angular, style the node inline (the `--gantt-*` variables reach into the shadow root); for a framework component, mount one into the node yourself.',
    cases: ['custom-editors'],
  },
  {
    id: 'styling-hooks',
    frameworks: ALL,
    area: 'Styling',
    text: 'The Web Component (and the React, Vue and Svelte wrappers around it) renders in a shadow root: style it with CSS custom properties, `::part(…)` and `:state(dark | dragging | loading)`. Angular renders in the light DOM, with the classes `gantry-dark`, `gantry-dragging` and `gantry-loading` on the host and `gantt-*` classes inside.',
    workaround:
      'In Angular, scope page CSS to `gantry` so it never reaches the rest of the page. In Svelte, a `--gantt-*` prop on `<Gantry>` sets the variable on a wrapper, where the theme’s own value on the element wins: set the variables on the element (page CSS or an attachment).',
    cases: ['theming'],
  },
  {
    id: 'theme-tokens',
    frameworks: ALL,
    area: 'Styling',
    text: 'Theme tokens: the Web Component writes them in a `:host` stylesheet, so page CSS on the element wins; Angular binds them inline on the host, so page CSS needs `!important` there.',
    workaround:
      'Prefer the `theme` option or `setTheme()`: they work the same in every binding, and they also update the colours the chart derives (`--gantt-today-label`, the `--gantt-bar-text-on-*` labels), which a CSS override of their source colour does not.',
    cases: ['theming'],
  },
  {
    id: 'forced-colors',
    frameworks: ALL,
    area: 'Styling',
    text: 'In forced colours, Angular bar components don’t get the system-colour rules of the built-in bars (style encapsulation), and a `renderBar` SVG keeps its own paints.',
    workaround:
      'Angular: add a `@media (forced-colors: active)` block to your bar component. Elsewhere: give the `renderBar` nodes `part` names and style them with `gantry-element::part(<name>)` inside `@media (forced-colors: active)` in page CSS.',
    cases: ['custom-bars', 'theming'],
  },
  {
    id: 'rtl-keys',
    frameworks: ALL,
    area: 'Keyboard',
    text: 'In a right-to-left layout only the toolbar swaps the meaning of `←` and `→`; in the task list and on the bars the arrow keys keep their left-to-right meaning.',
    until: 'full right-to-left support (roadmap, Phase 15)',
    cases: ['keyboard', 'i18n'],
  },
  {
    id: 'data-source',
    frameworks: ALL,
    area: 'Data',
    text: 'Angular’s `GanttDataSource` exposes signals (`items()`, `isLoading()`, `error()`); the Web Component’s, re-exported by React, Vue and Svelte, has plain getters, `subscribe(listener)` (returns the unsubscribe function: React’s `useSyncExternalStore` takes it as is) and an `onChange` callback. Both take the same config (`fetcher`, `pageSize`, `retries`, `retryDelay`).',
    cases: ['lazy'],
  },
  {
    id: 'ssr',
    frameworks: ['angular', 'react', 'vue', 'svelte'],
    area: 'Server rendering',
    text: 'Angular renders the chart on the server; the React, Vue and Svelte wrappers render an empty `<gantry-element>` that starts in the browser.',
    cases: [],
  },
  {
    id: 'toolbar-slot',
    frameworks: ALL,
    area: 'Custom content',
    text: 'Angular projects your own toolbar controls with `[ganttToolbar]`; the Web Component (and so React, Vue and Svelte) has no toolbar slot.',
    workaround: 'Put your controls next to the chart.',
    cases: ['large'],
  },
  {
    id: 'methods',
    frameworks: ALL,
    area: 'Methods',
    text: 'Methods such as `expandAll()`, `scrollToTask(id)`, `undo()`, `editCell(id, key)` and `focusTask(id)`: in Angular on the component (`viewChild(GantryComponent)`), on the element itself for the Web Component, on the `ref` in React, on the component ref’s `element` in Vue (`chart.value?.element?.expandAll()`: the ref exposes nothing else), and through `bind:element` in Svelte.',
    cases: ['tree', 'only-parents', 'editing', 'custom-editors'],
  },
  {
    id: 'history-state',
    frameworks: ALL,
    area: 'Methods',
    text: 'Undo and redo state: Angular’s `canUndo()` and `canRedo()` are signals on the component; the Web Component has `canUndo` and `canRedo` getters, read through the element ref in React, Vue and Svelte and refreshed on `history-change`, whose detail carries the same flags.',
    cases: ['editing'],
  },
  {
    id: 'array-updates',
    frameworks: ALL,
    area: 'Data',
    text: 'Updating arrays: React and Angular compare by reference (pass a new array); Vue watches array props one level deep (`push` and `splice` update the chart, changing a field of an item does not); Svelte copies data props one level, so a big plan is best kept in `$state.raw`.',
    cases: ['large'],
  },
  {
    id: 'responsive-first-frame',
    frameworks: ['angular'],
    area: 'Layout',
    text: 'Below `responsive.breakpoint`, the Web Component picks the narrow view before its first paint; Angular renders the wide layout first (on the server too, which has no width) and switches once it has measured the chart, so a phone may see one frame of the task list.',
    workaround:
      'Where the first frame matters, start narrow screens in the chart view yourself (`options.view`, from a media query or the user agent on the server).',
    cases: ['responsive'],
  },
  {
    id: 'export-methods',
    frameworks: ALL,
    area: 'Methods',
    text: "The export methods `exportSvg()`, `exportPng()`, `exportCsv()`, `download(format)` and `print()` are async (they return promises): in Angular on the component (`chart = viewChild.required(GantryComponent)`, then `chart().download('svg')`), on the element itself for the Web Component, on the `ref` in React (`ref.current?.download('svg')`), on the component ref’s `element` in Vue (`chart.value?.element?.download('svg')`), and through `bind:element` in Svelte.",
    workaround:
      'Catch the rejection: a PNG too large for the browser’s canvas, or a print of more than `maxPages` pages, fails with a `RangeError` (an SVG has no such limit). In the Web Component (and so React, Vue and Svelte) every export method, `exportSvg()` and `exportCsv()` included, also rejects when its export code (loaded on the first export) can’t be fetched, offline after a new deploy say; the next call tries again.',
    cases: ['export-image', 'export-csv', 'print'],
  },
  {
    id: 'print-css',
    frameworks: ALL,
    area: 'Styling',
    text: 'Printing the page (Ctrl+P): the chart hides its toolbar, splitter and overlays in `@media print` by itself. Your own print rules reach the Angular chart’s light DOM directly (`gantry .gantt-…`); the Web Component (and so React, Vue and Svelte) needs `gantry-element::part(…)`. Either way the page prints only the mounted rows (those in view): the chart doesn’t draw the others.',
    workaround: 'To print every row, with the header and the task list on each page, call `print()`.',
    cases: ['print'],
  },
  {
    id: 'export-ssr',
    frameworks: ALL,
    area: 'Server rendering',
    text: 'On the server, Angular’s `exportSvg()` and `exportCsv()` work (custom bars are drawn as built-in bars), while `exportPng()`, `download()` and `print()` need a browser: they reject before `(beforeExport)` is emitted. The React, Vue and Svelte wrappers render an empty `<gantry-element>` on the server.',
    workaround:
      'Elsewhere, export on the server with core: `exportChartSvg(createExportSource({ tasks, options }))` and `exportChartCsv(…)` run in Node.',
    cases: [],
  },
];

/** The notes of a case, in `FRAMEWORK_NOTES` order. */
export function notesForCase(id: CaseId): FrameworkNote[] {
  return FRAMEWORK_NOTES.filter(n => n.cases.includes(id));
}
