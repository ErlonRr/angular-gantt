# Gantry

> A free, full-featured, open-source Gantt chart for **every framework** — Angular, React, Vue, Svelte, or plain JavaScript.
> Interactive drag & resize, dependencies, critical path, baselines, virtual scrolling, theming and i18n — MIT licensed, zero runtime dependencies.

![Gantry Banner](https://raw.githubusercontent.com/ErlonRr/angular-gantt/main/assets/angular-gantt.png)

![Gantry Showcase Demo](https://raw.githubusercontent.com/ErlonRr/angular-gantt/main/assets/angular-gantt.gif)

## Packages

| Framework            | Package           | Install                 | Docs                                           |
| -------------------- | ----------------- | ----------------------- | ---------------------------------------------- |
| **Angular 22+**      | `ngx-gantry`      | `npm i ngx-gantry`      | [below](#angular-ngx-gantry)                   |
| **React 18 / 19**    | `@gantry/react`   | `npm i @gantry/react`   | [packages/react](packages/react/README.md)     |
| **Vue 3.5+**         | `@gantry/vue`     | `npm i @gantry/vue`     | [packages/vue](packages/vue/README.md)         |
| **Svelte 5**         | `@gantry/svelte`  | `npm i @gantry/svelte`  | [packages/svelte](packages/svelte/README.md)   |
| **Vanilla JS / any** | `@gantry/vanilla` | `npm i @gantry/vanilla` | [packages/vanilla](packages/vanilla/README.md) |
| Framework-free logic | `@gantry/core`    | `npm i @gantry/core`    | [packages/core](packages/core/README.md)       |

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
<Gantry tasks={tasks} options={{ viewMode: ViewMode.Week }} onTaskDragged={e => save(e)} />;
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

Each binding documents the rest of its API in its own README:

- **Web Component** `<gantry-element>` (the React, Vue and Svelte wrappers forward to it):
  [properties][wc-properties], [attributes][wc-attributes], [events][wc-events],
  [methods][wc-methods], [keyboard and focus][wc-focus], [CSS custom properties][wc-css],
  [parts][wc-parts], [custom states][wc-states] and [Content Security Policy][wc-csp]. The package
  ships a [Custom Elements Manifest][cem] (`custom-elements.json`) for IDEs, Storybook and linters.
- **Angular** `<gantry>`: [Inputs & Outputs](#inputs--outputs) and [Theming](#theming-1).

[wc-properties]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#properties
[wc-attributes]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#attributes
[wc-events]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#events
[wc-methods]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#methods
[wc-focus]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#keyboard-and-focus
[wc-css]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#css-custom-properties
[wc-parts]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#parts
[wc-states]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#custom-states
[wc-csp]: https://github.com/ErlonRr/angular-gantt/blob/main/packages/vanilla/README.md#content-security-policy
[cem]: https://github.com/webcomponents/custom-elements-manifest

### Timeline, header tiers and zoom

```ts
import { ViewMode, WEEK_FORMATS } from '@gantry/core';

options = {
  viewMode: ViewMode.Week, // Hour · Day · Week · Month · Quarter · Year, or a custom level name
  weekStart: 1, // 1 = Monday (ISO weeks), 0 = Sunday
  scales: [
    // header tiers, top → bottom (any number)
    { unit: 'month', format: 'MMMM YYYY' },
    { unit: 'week', format: WEEK_FORMATS.rangeMonth }, // "4–11 Mar"
  ],
  zoomLevels: [
    // replace the built-in presets
    { name: 'Sprint', cellWidth: 120, scales: [{ unit: 'month' }, { unit: 'week', step: 2, format: '[W]W' }] },
  ],
  gridLines: {
    major: { color: '#94a3b8', width: 1.5, dash: '4 3' }, // period delimiters (header + body)
    minor: { width: 1 }, // between cells; `false` hides
    horizontal: false, // row separators
    majorUnit: 'month', // default: the tier above the bottom one
  },
  headerHeight: 32,
  subHeaderHeight: 28,
  fitToWidth: true, // the timeline always fills the viewport
  initialScroll: 'auto', // 'auto' · 'today' · 'start' · a Date · false
};
```

- `unit`: `hour` · `day` · `week` · `month` · `quarter` · `year`; `step` groups cells (6 hours, 2 weeks…).
- `format`: a dayjs-compatible format string (`'MMM YYYY'`, `'[W]W'`, `'ddd D'`, see [date formats](#internationalisation--date-formats)) or `(start, end, ctx) => string`.
- Week presets: `WEEK_FORMATS.number` (`W52`), `.label` (`Week 52`), `.range` (`4–11`), `.rangeMonth` (`4–11 Mar`), `.numberRange` (`W52 · 4–11`).
- `className: (start, end) => string` adds your own class to header cells.
- Upper-tier labels stay pinned to the left while scrolling (`align: 'start'`).
- `initialScroll` picks where the first render with data scrolls: `'auto'` (default) centres
  today when it is near the tasks, otherwise shows the earliest task; `'start'` the earliest
  task; `'today'` or a `Date` centred; `false` stays at the timeline start. Changing it
  re-applies it. Zooming keeps the date at the centre of the viewport in place, and
  `prefers-reduced-motion` turns smooth scrolling into an instant jump.

### Non-working time (weekends, holidays, working & intensive hours)

```ts
options = {
  nonWorkingTime: {
    weekends: true, // or weekday numbers, e.g. [5, 6]
    holidays: [new Date(2026, 11, 25), { start: d1, end: d2, label: 'Shutdown', color: '#fee2e2' }],
    workingHours: { start: 9, end: 18 }, // or per weekday: { 1: [{ start: 9, end: 13 }, { start: 14, end: 18 }] }
    intensiveHours: [{ start: 10, end: 12, label: 'Focus', color: 'rgba(245,158,11,.2)' }],
    style: 'shade', // 'shade' | 'hatch' | 'disabled'
    showInHeader: true,
    minPxPerDay: 12, // hide day shading in dense zoom levels
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
    height: '60%', // px or % of the row
    radius: 6,
    minWidth: 4,
    progress: { show: true, color: '#1e3a8a', opacity: 0.3 },
    label: { position: 'auto', template: t => `${t.name} · ${t.progress ?? 0}%` }, // inside | left | right | auto | none
  },
  milestone: { size: 18, shape: 'diamond' }, // diamond | circle | square
  groupBar: { style: 'summary', height: '40%' }, // summary (bracket) | bar
  arrows: { width: 1.5, headSize: 5, radius: 6, offset: 12, color: '#64748b' },
  indentSize: 16,
};
```

Per task: `barColor`, `progressColor`, `textColor`, `rowColor`, `className`, `draggable`.
For full control replace the bar renderer (`renderBar` in the Web Component / bindings,
`provideGanttBar` in Angular) — custom renderers receive the computed geometry in `ctx.visual`
and its colours in `ctx.visual.paint` (see [Theming](#theming)).

### Task list panel, table view and saved state

```ts
options = {
  panel: {
    width: '30%',
    minWidth: 160,
    maxWidth: '70%',
    resizable: true,
    collapsible: true,
    collapsed: false,
    columns: ['name', 'start', 'end', 'progress'],
  }, // keys shown next to the timeline
  table: { columns: ['name', 'type', 'status', 'start', 'end', 'duration', 'progress', 'predecessors'] },
  view: 'split', // 'split' | 'table' (every useful field, animated) | 'chart'
  toolbar: { zoom: true, viewModes: ['Day', 'Week', 'Month'], today: true, viewToggle: true }, // or false
  stateKey: 'project-42', // remember panel width, view, zoom, column widths, collapsed rows, sort
  // (saved as versioned JSON in localStorage, validated on load; a snapshot from a newer version is ignored)
};
columns = [
  { key: 'name', label: 'Task', width: 220, flex: true }, // flex: fills spare panel width
  { key: 'owner', label: 'Owner', width: 120, align: 'center' },
  { key: 'budget', label: 'Budget', width: 100, tableOnly: true }, // only in the table view
];
```

- Drag the splitter to resize (also past the last column); the chevron collapses the list and
  restores the **last width of that instance**. Columns wider than the panel scroll horizontally.
- Column widths are resizable from the header edge (`resizable: false` to lock one).
- The split panel and the table view show different columns — see
  [Columns: split panel vs table view](#columns-split-panel-vs-table-view).
- `state-change` / `(stateChange)` / `onStateChange` reports every layout change; `getState()` /
  `setState()` save and restore it from your own backend.

### Dates and time zones

- `new Date('2026-01-05')` (UTC midnight) is read as **that calendar day in local time**
  (`normalizeDateOnly: true`), so bars line up with day cells in every time zone; `parseDate()` helps too.
- The x axis follows local calendar days, so daylight-saving changes never shift bars.
- `endDateMode: 'inclusive'` makes a date-only `end` cover that whole day (default `'exclusive'`).

### Theming

Colours, font and radius come from the theme (`options.theme`, `setTheme()`, `patchTheme()`,
light/dark/auto). The theme reaches the pixels only through CSS custom properties:

| Variable                           | Theme key          |     | Variable                                | Theme key       |
| ---------------------------------- | ------------------ | --- | --------------------------------------- | --------------- |
| `--gantt-bg`                       | `backgroundColor`  |     | `--gantt-grid-line`                     | `gridLine`      |
| `--gantt-header-bg`                | `headerBackground` |     | `--gantt-grid-line-major`               | `gridLineMajor` |
| `--gantt-bar`                      | `barColor`         |     | `--gantt-today`                         | `todayColor`    |
| `--gantt-bar-radius`               | `barRadius`        |     | `--gantt-weekend-bg`                    | `weekendBg`     |
| `--gantt-milestone`                | `milestoneColor`   |     | `--gantt-holiday-bg`                    | `holidayBg`     |
| `--gantt-critical`                 | `criticalColor`    |     | `--gantt-off-hours-bg`                  | `offHoursBg`    |
| `--gantt-arrow`                    | `arrowColor`       |     | `--gantt-intensive-bg`                  | `intensiveBg`   |
| `--gantt-text` / `-sec` / `-muted` | text colours       |     | `--gantt-sel-bg` / `--gantt-sel-border` | selection       |

- **Paints.** Every colour of the render model is a `Paint`: a theme token such as
  `var(--gantt-bar)`, or an explicit colour (`task.barColor`, a holiday `color`, `arrows.color`…)
  passed through as is. Both bindings apply paints as CSS properties (`style.fill`, never a
  presentation attribute), so a value like `'red;background:url(x)'` can't inject CSS.
- **Where the tokens live.** The Web Component writes them into a `:host` stylesheet in its
  shadow root, so page CSS on the element overrides them and a string `style` attribute no
  longer wipes them. Angular sets them inline on the `<gantry>` host (page CSS needs `!important`
  there; prefer `setTheme()`).

  ```css
  gantry-element {
    --gantt-bar: #6366f1;
    --gantt-bar-text-on-bar: #ffffff; /* keep the label readable on the new fill */
  }
  ```

- **Contrast tokens.** Labels inside theme-coloured bars use three derived tokens:
  `--gantt-bar-text-on-bar`, `--gantt-bar-text-on-milestone` and `--gantt-bar-text-on-critical`,
  each `readableOn(fill, barTextColor)` (white or near-black when `barTextColor` is unreadable on
  the fill). `setTheme()` / `patchTheme()` recompute them; a page-CSS override of `--gantt-bar`,
  `--gantt-milestone` or `--gantt-critical` must also set the matching token. Labels on an
  explicit `task.barColor` get a concrete readable colour; `task.textColor` and `bar.label.color`
  always win.
- **Metrics.** `barRadius` (the default `bar.radius`), `fontSize` (bar labels use `fontSize − 1`)
  and `barTextColor` shape the layout, so change them through the theme API, not page CSS:
  `themeMetrics(theme)` returns them and `resolveConfig(options, i18n, themeMetrics(theme))`
  reads them. The resolved config holds no colours, so a colour-only theme change leaves the
  layout as it is.
- **Every token.** All 40 custom properties (the theme keys and the three contrast tokens) are
  listed in the Angular [token map](#theming-1) and the Web Component's [CSS custom
  properties][wc-css].
- **Custom renderers.** `ctx.visual.paint.{body,progress,label}` may be `var()` strings: apply
  them as style properties (`el.style.setProperty('fill', paint)`), or get a concrete colour with
  `resolvePaint(paint, ctx.theme)` (`ctx.theme` is the chart's resolved theme). `themeToCss(theme)`
  lists every custom property a theme writes, the contrast tokens included.

---

## Angular (`ngx-gantry`)

> Angular 22+ — zoneless, signal-based, zero `@angular/animations`, zero `@angular/cdk`.
> npm package: **`ngx-gantry`** · component: `<gantry>` · class: `GantryComponent`.

## Install

```bash
npm i ngx-gantry
# peer deps: @angular/core & @angular/common ^22 (@gantry/core is installed automatically)
```

## Features

| Feature            | Detail                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Signals**        | All state via `signal()` / `computed()` / `effect()` — no RxJS                                                        |
| **Zoneless**       | Works with `provideZonelessChangeDetection()`                                                                         |
| **Bar registry**   | Plug in any custom bar component via `provideGanttBar()`                                                              |
| **Virtual scroll** | Scroll-position windowing, zero CDK                                                                                   |
| **Lazy load**      | Paged `GanttDataSource` over the core `PagedLoader`: accumulates pages, retries automatically, error state with Retry |
| **Drag & resize**  | Pointer Events API + `setPointerCapture()`                                                                            |
| **Selection**      | Single / Ctrl+Click toggle / Shift+Click range                                                                        |
| **Keyboard**       | `Escape`, `Ctrl+A`, `+/-` zoom, `T` today                                                                             |
| **Sorting**        | Click a sortable column header: ascending → descending → original order                                               |
| **Tooltip**        | Native Popover API — zero CDK Overlay                                                                                 |
| **Dark / light**   | Auto `prefers-color-scheme` + manual toggle                                                                           |
| **Animations**     | `animate.enter` / `animate.leave` (Angular 20.2 native)                                                               |
| **Dependencies**   | None at runtime                                                                                                       |

---

## Quick start (standalone)

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideGanttLib } from 'ngx-gantry';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideGanttLib({ darkMode: 'auto' })],
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
const ds = new GanttDataSource({
  fetcher: (page, size) => fetch(`/api/tasks?page=${page}&size=${size}`).then(r => r.json()),
  pageSize: 30,     // fewer items than this = last page
  initialPage: 1,   // 0 = load nothing until ds.loadNext()
  retries: 2,       // automatic retries of a failed page, backoff from retryDelay (500 ms)
});

// Template:
<gantry [dataSource]="ds" (loadError)="report($event.error)" />
```

The next page loads as the last rows scroll into view. A page that still fails after its
retries sets `ds.error()`, shows a message with a **Retry** button in the task list, emits
`loadError` / `load-error` / `onLoadError` (`{ error, page }`) and pauses loading until
`ds.retry()`. `ds.reset()` reloads from the first page; `ds.setStatic(items)` shows a fixed
list. The Web Component takes the same config (`gantt.dataSource = { fetcher, pageSize }`).

---

## Columns: split panel vs table view

The task list has two faces. Next to the timeline (`view: 'split'`) it is a **lean panel**;
in the full **table view** (`view: 'table'`, toolbar "Table") it shows every useful field:

| View        | Default columns                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| split panel | `name` · `start` · `end` · `progress`                                                                                                                          |
| table view  | `name` · `type` · `status` · `start` · `end` · `duration` · `progress` · `predecessors` (+ `baselineStart` · `baselineEnd` · `variance` with `baseline: true`) |

Built-in keys: `id`, `name`, `type`, `status`, `start`, `end`, `duration`, `progress`,
`predecessors`, `baselineStart`, `baselineEnd`, `variance` — every one sortable (except
`predecessors`), localised through `labels`, and usable by key without a `ColumnDef`:

```ts
options = {
  panel: { columns: ['name', 'status', 'start', 'progress'] }, // the split panel
  table: { columns: ['id', 'name', 'owner', 'status', 'start', 'end'] }, // the table view
};
// The 1.x panel: panel: { columns: ['name', 'start', 'end', 'duration', 'progress'] }
gantt.setColumnVisible('status', true, 'split'); // per view; omit the view for both
gantt.toggleColumnVisible('baselineStart', 'table'); // flips what the view shows now
```

- Keys are looked up in your `columns` first, then in the built-ins, so lists mix both.
- Without lists, your `columns` behave as before: `tableOnly` ones show only in the table view,
  `visible: false` ones nowhere; a listed key always shows.
- A column with a built-in key inherits its label and sizes, and its cells and sort rule unless
  you give it your own `render` / `cellTemplate`.
- **Status** (`status` column): `task.status` when set (a built-in value or any text), else
  derived — `done` at 100% progress, `overdue` past the drawn end, `inProgress` once started
  or with some progress, else `notStarted`; a milestone is due at the end of its day. It sorts
  by that order and shows a dot coloured by the theme keys `statusNotStarted`,
  `statusInProgress`, `statusOverdue`, `statusDone`. Statuses follow the chart's clock (they
  update every minute).
- Sorting reorders siblings at every level of the tree; names sort numerically ("Task 2" before
  "Task 10"). A custom column sorts by `sortValue(row, ctx)`, else by `task[key]`.
- `render(row, ctx)` and cell templates receive a `ColumnContext` (`now`, `taskById`,
  `endDateMode`, `collator`…) for time- or data-dependent cells.

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
  { key: 'name', label: 'Initiative', width: 210 },
  { key: 'status', label: 'Status', width: 100, cellTemplate: this.statusTpl() },
]);
```

The cell template context is `{ $implicit: row, row, ctx }` where `row: GanttFlatRow`
(so `row.task` is your `GanttTask`) and `ctx: ColumnContext` (`now`, `taskById`, …).

---

## Legend

```html
<gantry [series]="tasks" [annotations]="annotations" [showLegend]="true" />
```

A floating legend lists the **today** marker (when `showToday` is on), every **annotation**
(with its colour and label), and the **critical path** / **baseline** when those options are on.
Each entry has a shape as well as a colour (line, dashed line, bar, strip). Its strings are
localisable (`labels.legend`, `labels.today`, `labels.annotation`, `labels.legendCritical`,
`labels.legendBaseline`).

---

## Theming

Every colour/metric is a CSS custom property set inline on the `<gantry>` host (the
bar-label contrast tokens `--gantt-bar-text-on-*` included): use `setTheme()` / `patchTheme()` /
`provideGantt({ theme })`, or override in page CSS with `!important`. Bars, rows, bands and
arrows bind their colours as CSS properties (`[style.fill]`), so page CSS that targeted their
`fill` / `stroke` attributes no longer applies: restyle through the tokens (see
[Theming](#theming) under Configuration).

```css
gantry {
  --gantt-bar: #6366f1 !important;
  --gantt-bar-text-on-bar: #ffffff !important;
  --gantt-today: #f59e0b !important;
  --gantt-font: 'Inter', system-ui, sans-serif !important;
}
```

```ts
gantt.patchTheme({ barColor: '#6366F1', todayColor: '#F59E0B' }); // runtime, one shot
provideGantt({ darkMode: 'auto', theme: { barColor: '#6366F1' } }); // global default
```

Dark/light is driven by `[darkMode]="true | false | 'auto'"`. Built-in themes
`LightTheme` / `DarkTheme` are exported. They meet WCAG 2.2 AA: bar labels reach 4.5:1 and
bars, markers and arrows 3:1 against the background. Labels inside bars switch to white or
near-black when `barTextColor` is unreadable on a custom `barColor` (an explicit
`task.textColor` or `bar.label.color` is always kept); `contrastRatio()` and `readableOn()`
are exported from `@gantry/core`. The 1.x colours are available as `LegacyLightTheme` /
`LegacyDarkTheme`. Full token map:

| `GanttTheme` field | CSS variable              |     | `GanttTheme` field               | CSS variable                    |
| ------------------ | ------------------------- | --- | -------------------------------- | ------------------------------- |
| `backgroundColor`  | `--gantt-bg`              |     | `fontSize`                       | `--gantt-font-size`             |
| `headerBackground` | `--gantt-header-bg`       |     | `arrowColor`                     | `--gantt-arrow`                 |
| `rowBg`            | `--gantt-row-bg`          |     | `tooltipBg`                      | `--gantt-tooltip-bg`            |
| `rowBgAlt`         | `--gantt-row-bg-alt`      |     | `tooltipBorder`                  | `--gantt-tooltip-bdr`           |
| `barColor`         | `--gantt-bar`             |     | `tooltipText`                    | `--gantt-tooltip-txt`           |
| `barTextColor`     | `--gantt-bar-text`        |     | `selectionBg`                    | `--gantt-sel-bg`                |
| `barRadius`        | `--gantt-bar-radius`      |     | `selectionBorder`                | `--gantt-sel-border`            |
| `milestoneColor`   | `--gantt-milestone`       |     | `scrollbarTrack`                 | `--gantt-scrollbar-track`       |
| `baselineColor`    | `--gantt-baseline`        |     | `scrollbarThumb`                 | `--gantt-scrollbar-thumb`       |
| `criticalColor`    | `--gantt-critical`        |     | `weekendBg`                      | `--gantt-weekend-bg`            |
| `panelBg`          | `--gantt-panel-bg`        |     | `holidayBg`                      | `--gantt-holiday-bg`            |
| `panelBorder`      | `--gantt-panel-border`    |     | `offHoursBg`                     | `--gantt-off-hours-bg`          |
| `borderColor`      | `--gantt-border`          |     | `intensiveBg`                    | `--gantt-intensive-bg`          |
| `gridLine`         | `--gantt-grid-line`       |     | `statusNotStarted`               | `--gantt-status-not-started`    |
| `gridLineMajor`    | `--gantt-grid-line-major` |     | `statusInProgress`               | `--gantt-status-in-progress`    |
| `todayColor`       | `--gantt-today`           |     | `statusOverdue`                  | `--gantt-status-overdue`        |
| `textPrimary`      | `--gantt-text`            |     | `statusDone`                     | `--gantt-status-done`           |
| `textSecondary`    | `--gantt-text-sec`        |     | derived: label on a bar          | `--gantt-bar-text-on-bar`       |
| `textMuted`        | `--gantt-text-muted`      |     | derived: label on a milestone    | `--gantt-bar-text-on-milestone` |
| `fontFamily`       | `--gantt-font`            |     | derived: label on a critical bar | `--gantt-bar-text-on-critical`  |

---

## Internationalisation & date formats

Everything user-facing is translatable. Dates are formatted with the platform's `Intl` API from a
BCP 47 locale and a dayjs-compatible pattern — no locale files to import, no runtime dependency.
Set per instance via `options`, or globally via `provideGanttLib`.

```ts
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

- `locale` — any BCP 47 tag (`'it'`, `'de-CH'`, `'pt-BR'`, `'ja'`); unknown or malformed tags fall
  back to `'en'`. The default is `'en'` (deterministic output on every machine); the dayjs global
  locale is no longer read, so set `locale` explicitly.
- Format tokens (dayjs-compatible): `YYYY YY` · `M MM MMM MMMM` · `Q` · `D DD Do` · `d dd ddd dddd` ·
  `H HH h hh` · `m mm` · `s ss` · `A a` · `W WW` (ISO week) · `[literal text]`. Names come from `Intl`
  (CLDR), so a few abbreviations differ slightly from dayjs's locale files (e.g. German `Mär`).
- `labels: Partial<GanttLabels>` — override any UI string (buttons, tooltip, legend,
  header prefixes `W`/`Q`/`H`, duration text, column headers, aria-labels).
- `formats: { dateFormat, header }` — `dateFormat` for columns/tooltip; `header`
  for per-view custom header formatters `(date) => string`.

Global defaults: `provideGanttLib({ locale: 'it', labels: {…}, formats: {…} })`.

---

## Providers & setup

| Provider                                                           | Use                                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `provideGanttLib(config?)`                                         | One call in `bootstrapApplication` — registers built-in bars + global config (`theme`, `darkMode`, `locale`, `labels`, `formats`). |
| `GanttModule.forRoot(config?)`                                     | Same, for NgModule apps.                                                                                                           |
| `provideGantt(config?)`                                            | Global config only (no bar registration).                                                                                          |
| `provideGanttBar({ type, component })`                             | Register a custom bar type (see above).                                                                                            |
| `new GanttDataSource({ fetcher, pageSize, initialPage, retries })` | Build a lazy data source (`createGanttDataSource()` is equivalent).                                                                |

---

## Injectable services

Provided per `<gantry>` instance — inject them from a custom bar/child to read or drive state.

| Service                 | What it exposes                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| `GanttThemeService`     | `resolvedTheme`, `isDark`, `setDarkMode`, `patchTheme`, `setCustomTheme`    |
| `GanttI18nService`      | `locale`, `labels`, `formats` (resolved signals)                            |
| `GanttColumnService`    | column defs: `columns`, `visibleColumns`, `setColumnWidth`, `setVisible`    |
| `GanttSelectionService` | `selectedIds`, `handleClick`, `selectAll`, `clear`                          |
| `GanttLayoutService`    | geometry & view state: `viewMode`, `visibleRows`, `rowGeometries`, `todayX` |
| `GanttScrollService`    | `scrollLeft`, `scrollTop`, `scrollToDate`, `scrollToToday`                  |
| `GanttDragService`      | drag/resize FSM state                                                       |
| `GanttBarRegistry`      | custom bar registration (`register`, `resolve`)                             |

---

## Inputs & Outputs

| Input                         | Type                      | Default |
| ----------------------------- | ------------------------- | ------- |
| `series`                      | `GanttTask[]`             | `[]`    |
| `dataSource`                  | `GanttDataSource \| null` | `null`  |
| `options`                     | `GanttOptions`            | `{}`    |
| `annotations`                 | `GanttAnnotation[]`       | `[]`    |
| `columns`                     | `ColumnDef[]`             | `[]`    |
| `darkMode`                    | `boolean \| 'auto'`       | `false` |
| `showToolbar`                 | `boolean`                 | `true`  |
| `enableDrag` / `enableResize` | `boolean`                 | `true`  |
| `tooltipEnabled`              | `boolean`                 | `true`  |
| `showLegend`                  | `boolean`                 | `false` |

| Output                     | Payload                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `taskDragged`              | `TaskDragEvent`                                                 |
| `taskResized`              | `TaskResizeEvent`                                               |
| `selectionChange`          | `SelectionChangeEvent`                                          |
| `rowClick` / `rowDblClick` | row / geometry                                                  |
| `loadError`                | `{ error, page }` — a data-source page failed after its retries |

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

| Key                          | Action                                   |
| ---------------------------- | ---------------------------------------- |
| `Escape`                     | Cancel a drag, otherwise clear selection |
| `Ctrl/⌘+A` (also with Shift) | Select all visible rows                  |
| `+` / `-`                    | Zoom in / out                            |
| `T`                          | Scroll to today                          |

Shortcuts don't fire while typing in an input, or with `Alt` / `AltGr` held (those combinations
type characters on many keyboards); other keys keep their browser default.

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

`apps/demo-angular` is a small **custom showcase**: an
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

| Path                                                | What                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `packages/core`                                     | `@gantry/core` — framework-free logic, shared by every binding |
| `packages/vanilla`                                  | `@gantry/vanilla` — the `<gantry-element>` Web Component       |
| `packages/react`, `packages/vue`, `packages/svelte` | thin framework bindings over the Web Component                 |
| `packages/angular`                                  | `ngx-gantry` — the Angular library (imports `@gantry/core`)    |
| `apps/demo-angular`                                 | Angular showcase app                                           |
| `apps/demo-*`                                       | one Vite demo per framework                                    |

| Script                                                                      | Effect                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev:angular` / `dev:vanilla` / `dev:react` / `dev:vue` / `dev:svelte` | run a demo (packages resolve from source, so library edits hot-reload); `dev:vanilla` is the options playground                       |
| `pnpm build`                                                                | build all packages, the Angular library, the showcase and the demos                                                                   |
| `pnpm test`                                                                 | Vitest: core (Node) + Web Component (happy-dom)                                                                                       |
| `pnpm typecheck`                                                            | type-check every package                                                                                                              |
| `pnpm changeset`                                                            | describe a change for the next release (see [`.changeset/README.md`](.changeset/README.md))                                           |
| `pnpm test:tz`                                                              | core tests in other time zones (Los Angeles, Kolkata)                                                                                 |
| `pnpm e2e` · `pnpm e2e:full`                                                | Playwright end-to-end tests on every binding (after `pnpm build`; `e2e:full` builds first)                                            |
| `pnpm e2e:visual` · `pnpm e2e:update`                                       | compare / regenerate the screenshot baselines (`e2e/__screenshots__`) in the Playwright container (Docker/Podman) — same pixels as CI |

Workspace packages expose a `@gantry/source` export condition pointing at
their TypeScript sources; the demos, tests and type-checks use it, so nothing
has to be built first. Published consumers never see that condition.

### Working with Claude Code

The repo ships a shared [Claude Code](https://claude.com/claude-code) setup:

| Path                    | What                                                                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`             | architecture, commands and hard rules (no auto-commits, render model in core, date rules)                                                                                                                                                                                                     |
| `.claude/rules/`        | per-area rules loaded when files in that area are touched (core, Web Component, Angular, bindings, docs)                                                                                                                                                                                      |
| `.claude/skills/`       | `/gantry-feature` (add an option end to end), `/gantry-visual-qa` (browser checks), `/gantry-release` (manual), plus vetted external skills: `angular-developer`, `accessibility`, `svelte-core-bestpractices`, `vue-best-practices`, `web-design-guidelines` (sources in `skills-lock.json`) |
| `.claude/agents/`       | `gantry-reviewer` (parity & invariants review), `gantry-qa` (browser QA), `gantry-docs-sync` (docs, changeset, playground)                                                                                                                                                                    |
| `.claude/settings.json` | safe commands pre-approved; commit / push / tag / publish always ask; unit tests of the edited package run after each edit (`GANTRY_HOOK_TESTS=0` to skip)                                                                                                                                    |

The browser QA works without Claude too: `pnpm build && pnpm e2e` runs the Playwright suite
in `e2e/` on the Web Component, React, Vue, Svelte and Angular demos (console errors,
header/row alignment, scroll sync, drag, panel collapse, table view, binding parity) with a
frozen clock; screenshots for review land in `test-results/e2e/shots/`.

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

### Angular workspace

The showcase (`gantry-demo`) and the library are built with the esbuild-based
`@angular/build` builders (`application`, `dev-server`, `ng-packagr`); there is no
webpack in the toolchain. The live showcase replaces a component workshop such as Storybook.

---

## Dependencies

| Package        | License | Size                        |
| -------------- | ------- | --------------------------- |
| `@gantry/core` | MIT     | shared logic from this repo |

`@gantry/core` itself has no runtime dependencies (dates are formatted with `Intl`).
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
