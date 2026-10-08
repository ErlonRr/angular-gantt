# Gantry

> A free, full-featured, open-source Gantt chart for **every framework** — Angular, React, Vue, Svelte, or plain JavaScript.
> Interactive drag & resize, dependencies, critical path, baselines, virtual scrolling, theming and i18n — MIT licensed, only dependency `dayjs`.

![Gantry Banner](https://raw.githubusercontent.com/ErlonRr/angular-gantt/main/assets/angular-gantt.png)

![Gantry Showcase Demo](https://raw.githubusercontent.com/ErlonRr/angular-gantt/main/assets/angular-gantt.gif)

## Packages

| Framework | Package | Install | Docs |
|---|---|---|---|
| **Angular 20+** | `ngx-gantry` | `npm i ngx-gantry` | [below](#angular-ngx-gantry) |
| **React 18 / 19** | `@gantry/react` | `npm i @gantry/react` | [packages/react](packages/react/README.md) |
| **Vue 3.5+** | `@gantry/vue` | `npm i @gantry/vue` | [packages/vue](packages/vue/README.md) |
| **Svelte 5** | `@gantry/svelte` | `npm i @gantry/svelte` | [packages/svelte](packages/svelte/README.md) |
| **Vanilla JS / any** | `@gantry/vanilla` | `npm i @gantry/vanilla` | [packages/vanilla](packages/vanilla/README.md) |
| Framework-free logic | `@gantry/core` | `npm i @gantry/core` | [packages/core](packages/core/README.md) |

```
@gantry/core      types · timeline math · tree helpers · critical path (no DOM, no framework)
 ├── ngx-gantry       native Angular components (signals, zoneless)
 └── @gantry/vanilla  <gantry-element> Web Component
      ├── @gantry/react
      ├── @gantry/vue
      └── @gantry/svelte
```

### Quick start (any framework)

```tsx
// React
import { Gantry, ViewMode } from '@gantry/react';
<Gantry tasks={tasks} options={{ viewMode: ViewMode.Week }} onTaskDragged={e => save(e)} />
```

```vue
<!-- Vue — import { Gantry, ViewMode } from '@gantry/vue' -->
<Gantry :tasks="tasks" :options="{ viewMode: ViewMode.Week }" @task-dragged="save" />
```

```svelte
<!-- Svelte — import { Gantry, ViewMode } from '@gantry/svelte' -->
<Gantry {tasks} options={{ viewMode: ViewMode.Week }} onTaskDragged={save} />
```

```html
<!-- Plain HTML / any framework -->
<gantry-element id="gantt"></gantry-element>
<script type="module">
  import '@gantry/vanilla';
  const gantt = document.getElementById('gantt');
  gantt.tasks = [{ id: '1', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 40 }];
  gantt.addEventListener('task-dragged', e => console.log(e.detail));
</script>
```

## Configuration

Every binding (Angular `[options]`, React / Vue / Svelte `options`, `<gantry-element>.options`)
takes the same `GanttOptions` object, and both renderers draw from the same `@gantry/core`
render model — an option behaves identically everywhere. Try them all live in the
**playground** (`pnpm dev:vanilla`).

### Timeline, header tiers and zoom

```ts
import { ViewMode, WEEK_FORMATS } from '@gantry/core';

options = {
  viewMode: ViewMode.Week,            // Hour · Day · Week · Month · Quarter · Year, or a custom level name
  weekStart: 1,                       // 1 = Monday (ISO weeks), 0 = Sunday
  scales: [                           // header tiers, top → bottom (any number)
    { unit: 'month', format: 'MMMM YYYY' },
    { unit: 'week', format: WEEK_FORMATS.rangeMonth },   // "4–11 Mar"
  ],
  zoomLevels: [                       // replace the built-in presets
    { name: 'Sprint', cellWidth: 120, scales: [{ unit: 'month' }, { unit: 'week', step: 2, format: '[W]W' }] },
  ],
  gridLines: {
    major: { color: '#94a3b8', width: 1.5, dash: '4 3' },  // period delimiters (header + body)
    minor: { width: 1 },                                     // between cells; `false` hides
    horizontal: false,                                       // row separators
    majorUnit: 'month',                                      // default: the tier above the bottom one
  },
  headerHeight: 32, subHeaderHeight: 28,
  fitToWidth: true,                   // the timeline always fills the viewport
};
```

- `unit`: `hour` · `day` · `week` · `month` · `quarter` · `year`; `step` groups cells (6 hours, 2 weeks…).
- `format`: a dayjs format string (`'MMM YYYY'`, `'[W]W'`, `'ddd D'`) or `(start, end, ctx) => string`.
- Week presets: `WEEK_FORMATS.number` (`W52`), `.label` (`Week 52`), `.range` (`4–11`), `.rangeMonth` (`4–11 Mar`), `.numberRange` (`W52 · 4–11`).
- `className: (start, end) => string` adds your own class to header cells.
- Upper-tier labels stay pinned to the left while scrolling (`align: 'start'`).

### Non-working time (weekends, holidays, working & intensive hours)

```ts
options = {
  nonWorkingTime: {
    weekends: true,                                   // or weekday numbers, e.g. [5, 6]
    holidays: [new Date(2026, 11, 25), { start: d1, end: d2, label: 'Shutdown', color: '#fee2e2' }],
    workingHours: { start: 9, end: 18 },              // or per weekday: { 1: [{ start: 9, end: 13 }, { start: 14, end: 18 }] }
    intensiveHours: [{ start: 10, end: 12, label: 'Focus', color: 'rgba(245,158,11,.2)' }],
    style: 'shade',                                   // 'shade' | 'hatch' | 'disabled'
    showInHeader: true,
    minPxPerDay: 12,                                  // hide day shading in dense zoom levels
  },
  highlightTime: (start, unit) => (isRelease(start) ? { color: '#dcfce7', label: 'Release' } : null),
};
```

Shading is visual only — durations stay in calendar days. Colours default to the theme
(`weekendBg`, `holidayBg`, `offHoursBg`, `intensiveBg`). `nonWorkingTime: false` turns it off.

### Bars, milestones, arrows

```ts
options = {
  rowHeight: 40,
  bar: {
    height: '60%',                    // px or % of the row
    radius: 6,
    minWidth: 4,
    progress: { show: true, color: '#1e3a8a', opacity: 0.3 },
    label: { position: 'auto', template: t => `${t.name} · ${t.progress ?? 0}%` }, // inside | left | right | auto | none
  },
  milestone: { size: 18, shape: 'diamond' },          // diamond | circle | square
  groupBar: { style: 'summary', height: '40%' },      // summary (bracket) | bar
  arrows: { width: 1.5, headSize: 5, radius: 6, offset: 12, color: '#64748b' },
  indentSize: 16,
};
```

Per task: `barColor`, `progressColor`, `textColor`, `rowColor`, `className`, `draggable`.
For full control replace the bar renderer (`renderBar` in the Web Component / bindings,
`provideGanttBar` in Angular) — custom renderers receive the computed geometry in `ctx.visual`.

### Task list panel, table view and saved state

```ts
options = {
  panel: { width: '30%', minWidth: 160, maxWidth: '70%', resizable: true, collapsible: true, collapsed: false },
  view: 'split',                      // 'split' | 'table' (all columns, animated) | 'chart'
  toolbar: { zoom: true, viewModes: ['Day', 'Week', 'Month'], today: true, viewToggle: true }, // or false
  stateKey: 'project-42',             // remember panel width, view, zoom, column widths, collapsed rows, sort
};
columns = [
  { key: 'name', label: 'Task', width: 220, flex: true },          // flex: fills spare panel width
  { key: 'owner', label: 'Owner', width: 120, align: 'center' },
  { key: 'budget', label: 'Budget', width: 100, tableOnly: true }, // only in the table view
];
```

- Drag the splitter to resize (also past the last column); the chevron collapses the list and
  restores the **last width of that instance**. Columns wider than the panel scroll horizontally.
- Column widths are resizable from the header edge (`resizable: false` to lock one).
- `state-change` / `(stateChange)` / `onStateChange` reports every layout change; `getState()` /
  `setState()` save and restore it from your own backend.

### Dates and time zones

- `new Date('2026-01-05')` (UTC midnight) is read as **that calendar day in local time**
  (`normalizeDateOnly: true`), so bars line up with day cells in every time zone; `parseDate()` helps too.
- The x axis follows local calendar days, so daylight-saving changes never shift bars.
- `endDateMode: 'inclusive'` makes a date-only `end` cover that whole day (default `'exclusive'`).

### Theming

Colours, font and radius come from the theme (`options.theme`, `setTheme()`, `patchTheme()`,
light/dark/auto). They are also exposed as CSS custom properties on the chart root:

| Variable | Theme key | | Variable | Theme key |
|---|---|---|---|---|
| `--gantt-bg` | `backgroundColor` | | `--gantt-grid-line` | `gridLine` |
| `--gantt-header-bg` | `headerBackground` | | `--gantt-grid-line-major` | `gridLineMajor` |
| `--gantt-bar` | `barColor` | | `--gantt-today` | `todayColor` |
| `--gantt-bar-radius` | `barRadius` | | `--gantt-weekend-bg` | `weekendBg` |
| `--gantt-milestone` | `milestoneColor` | | `--gantt-holiday-bg` | `holidayBg` |
| `--gantt-critical` | `criticalColor` | | `--gantt-off-hours-bg` | `offHoursBg` |
| `--gantt-arrow` | `arrowColor` | | `--gantt-intensive-bg` | `intensiveBg` |
| `--gantt-text` / `-sec` / `-muted` | text colours | | `--gantt-sel-bg` / `--gantt-sel-border` | selection |

---

## Angular (`ngx-gantry`)

> Angular 20+ — zoneless, signal-based, zero `@angular/animations`, zero `@angular/cdk`.
> npm package: **`ngx-gantry`** · component: `<gantry>` · class: `GantryComponent`.

## Install

```bash
npm i ngx-gantry
# peer deps: @angular/core & @angular/common >= 20.2 (dayjs and @gantry/core are installed automatically)
```

## Features

| Feature | Detail |
|---|---|
| **Signals** | All state via `signal()` / `computed()` / `effect()` — no RxJS |
| **Zoneless** | Works with `provideZonelessChangeDetection()` |
| **Bar registry** | Plug in any custom bar component via `provideGanttBar()` |
| **Virtual scroll** | Scroll-position windowing, zero CDK |
| **Lazy load** | Angular 20 `resource()` + `linkedSignal` accumulation |
| **Drag & resize** | Pointer Events API + `setPointerCapture()` |
| **Selection** | Single / Ctrl+Click toggle / Shift+Click range |
| **Keyboard** | `Escape`, `Ctrl+A`, `+/-` zoom, `T` today |
| **Sorting** | Click a sortable column header: ascending → descending → original order |
| **Tooltip** | Native Popover API — zero CDK Overlay |
| **Dark / light** | Auto `prefers-color-scheme` + manual toggle |
| **Animations** | `animate.enter` / `animate.leave` (Angular 20.2 native) |
| **Dependencies** | Only `dayjs` (MIT, 7KB) |

---

## Quick start (standalone)

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideGanttLib } from 'ngx-gantry';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideGanttLib({ darkMode: 'auto' }),
  ],
});
```

```ts
// app.component.ts
import { GantryComponent, GanttTask, ViewMode } from 'ngx-gantry';

@Component({
  imports: [GantryComponent],
  template: `
    <gantry
      [series]="tasks"
      [options]="{ viewMode: 'Month', rowHeight: 36, baseline: true }"
      [darkMode]="false"
      (taskDragged)="onDrag($event)"
    />
  `,
})
export class AppComponent {
  tasks: GanttTask[] = [...];
}
```

---

## NgModule style

```ts
import { GanttModule } from 'ngx-gantry';

@NgModule({
  imports: [GanttModule.forRoot({ darkMode: 'auto' })],
})
export class AppModule {}
```

---

## Custom bar component

```ts
import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { GanttBarBase, GanttBarContext, provideGanttBar } from 'ngx-gantry';

@Component({
  selector: 'g[epicBar]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rect [attr.x]="geo().barX" [attr.y]="geo().y + 6"
          [attr.width]="geo().barWidth" [attr.height]="geo().height - 12"
          rx="8" fill="#6366F1" />
    <text [attr.x]="geo().barX + 8" [attr.y]="geo().y + geo().height / 2"
          fill="white" font-size="12" dominant-baseline="central">
      ⚡ {{ task().name }}
    </text>
  `,
})
export class EpicBarComponent extends GanttBarBase {
  readonly ctx = input.required<GanttBarContext>();
  protected readonly geo  = computed(() => this.ctx().geometry);
  protected readonly task = computed(() => this.ctx().row.task);
  override get context()  { return this.ctx(); }
}

// In providers:
provideGanttBar({ type: 'epic', component: EpicBarComponent })
// In task data:
{ id: 'e1', ..., barType: 'epic' }
```

---

## Lazy load with GanttDataSource

```ts
const ds = createGanttDataSource({
  fetcher: (page, size) => fetch(`/api/tasks?page=${page}&size=${size}`).then(r => r.json()),
  pageSize: 30,
});

// Template:
<gantry [dataSource]="ds" />
```

---

## Custom columns (left panel)

Two ways to define the columns of the task list panel.

**a) Plain columns via the `columns` input** — `render` returns a text string:

```ts
import { ColumnDef } from 'ngx-gantry';

columns: ColumnDef[] = [
  { key: 'name',  label: 'Task', width: 220 },              // built-in name cell
  { key: 'owner', label: 'Owner', width: 120,
    render: r => (r.task.data?.['owner'] as string) ?? '' },
];
```

**b) Rich cell templates** — for avatars, badges, progress bars, use `cellTemplate`
(from a `viewChild` `TemplateRef`) or the declarative `<ng-template ganttColumn>`:

```html
<ng-template #statusCell let-row>
  <span class="badge" [class]="row.task.data?.['status']">{{ row.task.data?.['status'] }}</span>
</ng-template>

<gantry [series]="tasks" [columns]="columns()" />
```
```ts
statusTpl = viewChild<TemplateRef<ColumnCellContext>>('statusCell');
columns = computed<ColumnDef[]>(() => [
  { key: 'name',   label: 'Initiative', width: 210 },
  { key: 'status', label: 'Status', width: 100, cellTemplate: this.statusTpl() },
]);
```

The cell template context is `{ $implicit: row, row }` where `row: GanttFlatRow`
(so `row.task` is your `GanttTask`).

---

## Legend

```html
<gantry [series]="tasks" [annotations]="annotations" [showLegend]="true" />
```

A floating legend lists the **today** marker and every **annotation** (with its
colour and label). Its strings are localisable (`labels.legend`, `labels.today`,
`labels.annotation`).

---

## Theming

Every colour/metric is a CSS custom property set on the `<gantry>` host, so you can
override in plain CSS, or use `setTheme()` / `patchTheme()` / `provideGantt({ theme })`.

```css
gantry {
  --gantt-bar: #6366f1;
  --gantt-today: #f59e0b;
  --gantt-font: 'Inter', system-ui, sans-serif;
}
```

```ts
gantt.patchTheme({ barColor: '#6366F1', todayColor: '#F59E0B' }); // runtime, one shot
provideGantt({ darkMode: 'auto', theme: { barColor: '#6366F1' } }); // global default
```

Dark/light is driven by `[darkMode]="true | false | 'auto'"`. Built-in themes
`LightTheme` / `DarkTheme` are exported. Full token map:

| `GanttTheme` field | CSS variable | | `GanttTheme` field | CSS variable |
|---|---|---|---|---|
| `backgroundColor` | `--gantt-bg` | | `borderColor` | `--gantt-border` |
| `headerBackground` | `--gantt-header-bg` | | `gridLine` | `--gantt-grid-line` |
| `rowBg` | `--gantt-row-bg` | | `todayColor` | `--gantt-today` |
| `rowBgAlt` | `--gantt-row-bg-alt` | | `textPrimary` | `--gantt-text` |
| `barColor` | `--gantt-bar` | | `textSecondary` | `--gantt-text-sec` |
| `barTextColor` | `--gantt-bar-text` | | `textMuted` | `--gantt-text-muted` |
| `barRadius` | `--gantt-bar-radius` | | `fontFamily` | `--gantt-font` |
| `milestoneColor` | `--gantt-milestone` | | `fontSize` | `--gantt-font-size` |
| `baselineColor` | `--gantt-baseline` | | `arrowColor` | `--gantt-arrow` |
| `criticalColor` | `--gantt-critical` | | `tooltipBg` | `--gantt-tooltip-bg` |
| `panelBg` | `--gantt-panel-bg` | | `tooltipBorder` | `--gantt-tooltip-bdr` |
| `panelBorder` | `--gantt-panel-border` | | `tooltipText` | `--gantt-tooltip-txt` |
| `selectionBg` | `--gantt-sel-bg` | | `selectionBorder` | `--gantt-sel-border` |
| `scrollbarTrack` | `--gantt-scrollbar-track` | | `scrollbarThumb` | `--gantt-scrollbar-thumb` |

---

## Internationalisation & date formats

Everything user-facing is translatable, and dates follow a dayjs locale + format.
Set per instance via `options`, or globally via `provideGanttLib`.

```ts
import 'dayjs/locale/it';           // load the dayjs locale you need, once

<gantry
  [series]="tasks"
  [options]="{
    locale: 'it',                                  // month/day names → Italian
    formats: { dateFormat: 'D MMM YYYY' },         // columns & tooltip dates
    labels: {                                      // any subset — rest stays English
      loadMore: 'Carica altro', todayButton: 'Oggi',
      viewModes: { Day: 'Giorno', Week: 'Settimana', Month: 'Mese', Quarter: 'Trimestre', Year: 'Anno' },
      quarterPrefix: 'T', halfPrefix: 'S',
    },
  }" />
```

- `locale` — a dayjs locale id; **import the locale first** (`import 'dayjs/locale/it'`).
- `labels: Partial<GanttLabels>` — override any UI string (buttons, tooltip, legend,
  header prefixes `W`/`Q`/`H`, duration text, column headers, aria-labels).
- `formats: { dateFormat, header }` — `dateFormat` for columns/tooltip; `header`
  for per-view custom header formatters `(date) => string`.

Global defaults: `provideGanttLib({ locale: 'it', labels: {…}, formats: {…} })`.

---

## Providers & setup

| Provider | Use |
|---|---|
| `provideGanttLib(config?)` | One call in `bootstrapApplication` — registers built-in bars + global config (`theme`, `darkMode`, `locale`, `labels`, `formats`). |
| `GanttModule.forRoot(config?)` | Same, for NgModule apps. |
| `provideGantt(config?)` | Global config only (no bar registration). |
| `provideGanttBar({ type, component })` | Register a custom bar type (see above). |
| `createGanttDataSource({ fetcher, pageSize })` | Build a lazy `GanttDataSource`. |

---

## Injectable services

Provided per `<gantry>` instance — inject them from a custom bar/child to read or drive state.

| Service | What it exposes |
|---|---|
| `GanttThemeService` | `resolvedTheme`, `isDark`, `setDarkMode`, `patchTheme`, `setCustomTheme` |
| `GanttI18nService` | `locale`, `labels`, `formats` (resolved signals) |
| `GanttColumnService` | column defs: `columns`, `visibleColumns`, `setColumnWidth`, `setVisible` |
| `GanttSelectionService` | `selectedIds`, `handleClick`, `selectAll`, `clear` |
| `GanttLayoutService` | geometry & view state: `viewMode`, `visibleRows`, `rowGeometries`, `todayX` |
| `GanttScrollService` | `scrollLeft`, `scrollTop`, `scrollToDate`, `scrollToToday` |
| `GanttDragService` | drag/resize FSM state |
| `GanttBarRegistry` | custom bar registration (`register`, `resolve`) |

---

## Inputs & Outputs

| Input | Type | Default |
|---|---|---|
| `series` | `GanttTask[]` | `[]` |
| `dataSource` | `GanttDataSource \| null` | `null` |
| `options` | `GanttOptions` | `{}` |
| `annotations` | `GanttAnnotation[]` | `[]` |
| `columns` | `ColumnDef[]` | `[]` |
| `darkMode` | `boolean \| 'auto'` | `false` |
| `showToolbar` | `boolean` | `true` |
| `enableDrag` / `enableResize` | `boolean` | `true` |
| `tooltipEnabled` | `boolean` | `true` |
| `showLegend` | `boolean` | `false` |

| Output | Payload |
|---|---|
| `taskDragged` | `TaskDragEvent` |
| `taskResized` | `TaskResizeEvent` |
| `selectionChange` | `SelectionChangeEvent` |
| `rowClick` / `rowDblClick` | row / geometry |

---

## Public API

```ts
// Component methods (access via viewChild)
gantt.zoomIn() / zoomOut()
gantt.setViewMode(ViewMode.Week)
gantt.scrollToToday()
gantt.getSelectedTasks(): GanttTask[]
gantt.setSelectedTasks(ids: string[])
gantt.clearSelection() / selectAll()
gantt.updateTask(id, patch)
gantt.appendTasks(tasks)
gantt.collapseAll() / expandAll()
gantt.togglePanel()
gantt.setTheme(partial) / patchTheme(patch)
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Escape` | Clear selection |
| `Ctrl+A` | Select all |
| `+` / `-` | Zoom in / out |
| `T` | Scroll to today |

---

## ng-content slots

```html
<gantry [series]="tasks">
  <!-- Toolbar extras -->
  <button ganttToolbar>Export CSV</button>

  <!-- Task list footer -->
  <div tlFooter>{{ tasks.length }} total tasks</div>

  <!-- Below the gantt -->
  <div ganttFooter>© 2026 My Company</div>
</gantry>
```

---

## Live showcase (the demo app)

`projects/gantry-demo` is a small **custom showcase** (a "semi-Storybook"): an
IDE-style sidebar lists the demos, each renders the live `<gantry>`, and a
docs panel shows a copy-pasteable **Usage** snippet plus install/GitHub/npm links.
It doubles as living documentation and as the site you can deploy next to the blog.

```bash
pnpm start                 # dev server (ng serve gantry-demo)
pnpm build:demo            # static build → dist/gantry-demo (relative base href)
```

Deploy `dist/gantry-demo/browser` to any static host (GitHub Pages, Netlify,
Vercel). For deep-link refresh on a static host, add an SPA fallback
(`404.html` = `index.html`, or a `_redirects` / rewrite rule) — landing on `/`
and navigating via the sidebar works without it.

## Development tooling

### Monorepo layout

A pnpm workspace (`pnpm-workspace.yaml`):

| Path | What |
|---|---|
| `packages/core` | `@gantry/core` — framework-free logic, shared by every binding |
| `packages/vanilla` | `@gantry/vanilla` — the `<gantry-element>` Web Component |
| `packages/react`, `packages/vue`, `packages/svelte` | thin framework bindings over the Web Component |
| `projects/gantry` | `ngx-gantry` — the Angular library (imports `@gantry/core`) |
| `projects/gantry-demo` | Angular showcase app + Storybook |
| `apps/demo-*` | one Vite demo per framework |

| Script | Effect |
|---|---|
| `pnpm dev:angular` / `dev:vanilla` / `dev:react` / `dev:vue` / `dev:svelte` | run a demo (packages resolve from source, so library edits hot-reload); `dev:vanilla` is the options playground |
| `pnpm build` | build all packages, the Angular library, the showcase and the demos |
| `pnpm test` | Vitest: core (Node) + Web Component (happy-dom) |
| `pnpm typecheck` | type-check every package |
| `pnpm changeset` | describe a change for the next release (see [`.changeset/README.md`](.changeset/README.md)) |
| `pnpm test:tz` | core tests in other time zones (Los Angeles, Kolkata) |
| `pnpm qa:serve start` · `pnpm qa --url …` | serve the demos and run the browser QA |

Workspace packages expose a `@gantry/source` export condition pointing at
their TypeScript sources; the demos, tests and type-checks use it, so nothing
has to be built first. Published consumers never see that condition.

### Working with Claude Code

The repo ships a shared [Claude Code](https://claude.com/claude-code) setup:

| Path | What |
|---|---|
| `CLAUDE.md` | architecture, commands and hard rules (no auto-commits, render model in core, date rules) |
| `.claude/rules/` | per-area rules loaded when files in that area are touched (core, Web Component, Angular, bindings, docs) |
| `.claude/skills/` | `/gantry-feature` (add an option end to end), `/gantry-visual-qa` (browser checks), `/gantry-release` (manual), plus vetted external skills: `angular-developer`, `accessibility`, `svelte-core-bestpractices`, `vue-best-practices`, `web-design-guidelines` (sources in `skills-lock.json`) |
| `.claude/agents/` | `gantry-reviewer` (parity & invariants review), `gantry-qa` (browser QA), `gantry-docs-sync` (docs, changeset, playground) |
| `.claude/settings.json` | safe commands pre-approved; commit / push / tag / publish always ask; unit tests of the edited package run after each edit (`GANTRY_HOOK_TESTS=0` to skip) |

The browser QA works without Claude too: `pnpm qa:serve start`, then
`pnpm qa --url http://localhost:4171 --rows 60` (checks console errors, header/row alignment,
scroll sync, drag, panel collapse and table view; Chrome, Chromium or Firefox).

### Testing

**Vitest** runs two projects: the framework-free core (`gantt-math` /
`gantt-data` / `gantt-cpm` + the i18n formatters) in plain Node, and the
`<gantry-element>` Web Component in happy-dom.

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
```

Specs live in `packages/core/src/__tests__/` (date↔pixel math, tree
flattening, the Critical Path Method, timeline-range padding, i18n) and
`packages/vanilla/src/__tests__/` (rendering, options, drag, selection,
keyboard, sorting, virtual scrolling, lazy loading, custom bars, tooltip
escaping).

### Angular workspace vs Storybook preview

The demo app (`gantry-demo`) is built with `@angular-devkit/build-angular:application` (esbuild-based application builder). **That is not Vite** and it is not the same pipeline as Storybook.

Storybook 10 runs via the Angular CLI targets `@storybook/angular:start-storybook` and `@storybook/angular:build-storybook`, which compile the preview with **Webpack 5** (`@storybook/builder-webpack5`). Expect two parallel toolchains: **`ng build` / `ng serve` for the app** vs **`ng run …:storybook` for the component workshop**. Missing a Vite dependency next to Angular does not indicate a misconfiguration for Storybook.

### Storybook commands

| Script | Effect |
|--------|--------|
| `pnpm storybook` | `ng run gantry-demo:storybook` — dev server; uses `browserTarget` **`gantry-demo:build:development`** (see [`angular.json`](angular.json)). |
| `pnpm build:storybook` | Static Storybook under `storybook-static`; uses **`gantry-demo:build:production`** unless you change the target. |

### pnpm and Webpack

[`package.json`](package.json) sets `pnpm.overrides.webpack` to a single Webpack 5 version so hoisted installs do not load two copies of `webpack` (which breaks plugins that rely on `instanceof Compilation`). The Storybook config may also merge `DefinePlugin` definitions for `process.env.NODE_ENV` when both Angular and Storybook inject it; see [`.storybook/main.ts`](.storybook/main.ts).

### Chromatic (optional)

The Chromatic addon is **disabled by default**. To load it locally, set `STORYBOOK_CHROMATIC=1` (see `.storybook/main.ts`).

### Optional: regenerate Storybook from the CLI

If configuration drift becomes hard to maintain, create a branch, run `pnpm create storybook@latest`, compare the generated `.storybook/` and `angular.json` architect blocks with this repo, then copy back only **stories**, **preview providers**, and any project-specific options (e.g. `compodoc`, `browserTarget`).

### Optional: Vite-based Storybook

After `ng build gantry` and Storybook builds are stable, you can spike **`@storybook/builder-vite`** following [Storybook’s builder docs](https://storybook.js.org/docs/10/builders). Treat it as an optional performance experiment, not a prerequisite for fixing library TypeScript errors.

---

## Dependencies

| Package | License | Size |
|---|---|---|
| `dayjs` | MIT | 7KB |
| `@gantry/core` | MIT | shared logic from this repo |

Zero `zone.js` required. Zero `@angular/animations`. Zero CDK (tooltip uses native Popover API).

---

## 📋 Changelog

<details>
<summary><b>Recent Releases (Click to expand)</b></summary>
<br/>

### [1.0.1] — 2026-08-08
- **Scroll Tearing & Ping-Pong**: Resolved visual bar duplication during vertical scrolling by replacing fragile microtask lock with a robust scroll-source timeout lock.
- **Vertical Scroll Alignment**: Synchronized task list and SVG canvas vertical scroll positions 1:1 without header height distortion.
- **Today Marker**: Removed top vertical line from header to avoid obscuring date labels, and updated positioning to reflect exact time-of-day.
- **Hit Testing**: Fixed `_geoFromPoint` pointer event row lookup for virtual scrolled rows.
- **Group Bar Defaults**: Ensured `TaskType.Group` resolves to `'group'` bar type by default.

### [1.0.0] — 2026-07-25
- **Initial Public Release**: Zoneless, signal-based Angular 20+ Gantt chart.

---

For complete release history, view the full [CHANGELOG.md](https://github.com/ErlonRr/angular-gantt/blob/main/CHANGELOG.md).

</details>

