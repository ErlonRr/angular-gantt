# Gantry

> A free, full-featured, open-source Gantt chart for **every framework** — Angular, React, Vue, Svelte, or plain JavaScript.
> Interactive editing (drag & resize with mouse, touch and keyboard, cells, links, progress, undo / redo), dependencies, critical path, baselines, virtual scrolling, export to SVG, PNG and CSV, paginated print, theming and i18n — accessible (WCAG 2.2 AA, forced colors), MIT licensed, zero runtime dependencies.

![Gantry Banner](https://raw.githubusercontent.com/ErlonRr/gantryjs/main/assets/gantry-banner.png)

![Gantry Showcase Demo](https://raw.githubusercontent.com/ErlonRr/gantryjs/main/assets/gantry-demo.gif)

## Packages

| Framework            | Package             | Install                   | Docs                                           |
| -------------------- | ------------------- | ------------------------- | ---------------------------------------------- |
| **Angular 22+**      | `@gantryjs/angular` | `npm i @gantryjs/angular` | [below](#angular-gantryjsangular)              |
| **React 18 / 19**    | `@gantryjs/react`   | `npm i @gantryjs/react`   | [packages/react](packages/react/README.md)     |
| **Vue 3.5+**         | `@gantryjs/vue`     | `npm i @gantryjs/vue`     | [packages/vue](packages/vue/README.md)         |
| **Svelte 5**         | `@gantryjs/svelte`  | `npm i @gantryjs/svelte`  | [packages/svelte](packages/svelte/README.md)   |
| **Vanilla JS / any** | `@gantryjs/vanilla` | `npm i @gantryjs/vanilla` | [packages/vanilla](packages/vanilla/README.md) |
| Framework-free logic | `@gantryjs/core`    | `npm i @gantryjs/core`    | [packages/core](packages/core/README.md)       |

```
@gantryjs/core              types · timeline math · tree helpers · critical path (no DOM, no framework)
 ├── @gantryjs/angular      native Angular components (signals, zoneless)
 └── @gantryjs/vanilla      <gantry-element> Web Component
      ├── @gantryjs/react
      ├── @gantryjs/vue
      └── @gantryjs/svelte
```

### Quick start (any framework)

```tsx
// React
import { Gantry, ViewMode } from '@gantryjs/react';
<Gantry tasks={tasks} options={{ viewMode: ViewMode.Week }} onTaskDragged={e => save(e)} />;
```

```vue
<!-- Vue — import { Gantry, ViewMode } from '@gantryjs/vue' -->
<Gantry :tasks="tasks" :options="{ viewMode: ViewMode.Week }" @task-dragged="save" />
```

```svelte
<!-- Svelte — import { Gantry, ViewMode } from '@gantryjs/svelte' -->
<Gantry {tasks} options={{ viewMode: ViewMode.Week }} onTaskDragged={save} />
```

```html
<!-- Plain HTML / any framework -->
<gantry-element id="gantt"></gantry-element>
<script type="module">
  import '@gantryjs/vanilla';
  const gantt = document.getElementById('gantt');
  gantt.tasks = [{ id: '1', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 40 }];
  gantt.addEventListener('task-dragged', e => console.log(e.detail));
</script>
```

## Configuration

Every binding (Angular `[options]`, React / Vue / Svelte `options`, `<gantry-element>.options`)
takes the same `GanttOptions` object, and both renderers draw from the same `@gantryjs/core`
render model — an option behaves identically everywhere. Try them all live in the
**playground** — the site's `/playground` (`pnpm start`) or the Web Component one
(`pnpm dev:vanilla`).

Each binding documents the rest of its API in its own README:

- **Web Component** `<gantry-element>` (the React, Vue and Svelte wrappers forward to it):
  [properties][wc-properties], [attributes][wc-attributes], [events][wc-events],
  [methods][wc-methods], [slots][wc-slots], [keyboard and focus][wc-focus],
  [CSS custom properties][wc-css], [parts][wc-parts], [custom states][wc-states] and
  [Content Security Policy][wc-csp]. The package ships a [Custom Elements Manifest][cem]
  (`custom-elements.json`) for IDEs, Storybook and linters.
- **Angular** `<gantry>`: [Inputs & Outputs](#inputs--outputs), [Public API](#public-api),
  [content slots](#ng-content-slots) and [Theming](#theming-1).

Keyboard, touch, zoom, screen-reader and forced-colors behaviour is the same in every binding:
see [Keyboard and focus](#keyboard-and-focus), [Touch and pointer](#touch-and-pointer),
[Zoom](#zoom), [Screen readers](#screen-readers) and [Forced colors](#forced-colors) below.

On this page: [Timeline](#timeline-header-tiers-and-zoom) · [Week numbering](#week-numbering) ·
[Non-working time](#non-working-time-weekends-holidays-working--intensive-hours) ·
[Working calendar](#working-calendar) · [Bars](#bars-milestones-arrows) · [Task styles](#task-styles) · [Rollup](#parents-rollup-and-collapsed-groups) ·
[Panel and table](#task-list-panel-table-view-and-saved-state) · [Responsive and density](#responsive-layout-and-density) ·
[Toolbar](#toolbar-legend-and-markers) · [Tooltip](#tooltip) · [States](#loading-error-and-empty-states) ·
[Synchronised charts](#synchronised-charts) · [Editing](#editing) · [Export and print](#export-and-print) ·
[Dates and locales](#dates-locales-and-format-tokens) ·
[Theming](#theming) · [Styling hooks](#styling-hooks-across-bindings) · [CSP](#content-security-policy) ·
[SSR](#server-side-rendering-all-bindings) · [Examples](#examples-gallery).

[wc-properties]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#properties
[wc-attributes]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#attributes
[wc-events]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#events
[wc-methods]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#methods
[wc-slots]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#slots
[wc-focus]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#keyboard-and-focus
[wc-css]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#css-custom-properties
[wc-parts]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#parts
[wc-states]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#custom-states
[wc-csp]: https://github.com/ErlonRr/gantryjs/blob/main/packages/vanilla/README.md#content-security-policy
[cem]: https://github.com/webcomponents/custom-elements-manifest

### Timeline, header tiers and zoom

```ts
import { ViewMode, WEEK_FORMATS } from '@gantryjs/core';

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
- Upper-tier labels stay pinned to the left while scrolling (`align: 'start'`). A cell cut by
  the edge of the range shows no label when it is narrower than its label + 12 px, so no
  clipped slivers.
- `initialScroll` picks where the first render with data scrolls: `'auto'` (default) centres
  today when it is near the tasks, otherwise shows the earliest task; `'start'` the earliest
  task; `'today'` or a `Date` centred; `false` stays at the timeline start. Changing it
  re-applies it. Zooming from the toolbar, the keys or `zoomIn()` / `zoomOut()` keeps the date
  at the centre of the viewport in place, zoom gestures the date under the pointer (see
  [Zoom](#zoom)), and `prefers-reduced-motion` turns smooth scrolling into an instant jump.

### Week numbering

```ts
options = {
  weekNumbering: 'us', // 'iso' · 'us' · 'locale'
  weekStart: 6, // 1 = Monday, 0 = Sunday, 6 = Saturday; overrides the rule's first day
};
```

- `'iso'`: weeks start on Monday and week 1 holds 4 January (the default). `'us'`: weeks start on
  Sunday and week 1 is the week that holds 1 January. `'locale'`: the rule of `options.locale`
  (`Intl.Locale#getWeekInfo()`, else ISO).
- Unset, `weekNumbering` is `'us'` when `weekStart` is `0`, otherwise `'iso'`. Charts that set
  neither keep their ISO weeks.
- Under the US rule the days of the week that holds 1 January are week 1 of the new year, even
  when they fall in December: Sunday 27 December 2026 reads `W1`, not `W53`.
- Week cells start on `weekStart`, and the `W` / `WW` tokens and `WEEK_FORMATS` follow the rule.
  Core exports `weekOfYear(date, rule)`, `weekYear(date, rule)` and the rules `ISO_WEEK`, `US_WEEK`.

### Non-working time (weekends, holidays, working & intensive hours)

```ts
options = {
  nonWorkingTime: {
    weekends: true, // or weekday numbers, e.g. [5, 6]
    holidays: [new Date(2026, 11, 25), { start: d1, end: d2, label: 'Shutdown', color: '#fee2e2' }],
    workingHours: { start: 9, end: 18 }, // or per weekday: { 1: [{ start: 9, end: 13 }, { start: 14, end: 18 }] }
    intensiveHours: [{ start: 10, end: 12, label: 'Focus', color: 'rgba(245,158,11,.2)' }],
    style: 'shade', // 'shade' (tinted by kind) | 'hatch' (+ stripes) | 'disabled' (one neutral grey) | 'none' (no band)
    showInHeader: true,
    minPxPerDay: 12, // hide day shading in dense zoom levels
  },
  highlightTime: (start, unit) => (isRelease(start) ? { color: '#dcfce7', label: 'Release' } : null),
};
```

Shading is visual only until you turn on the [working calendar](#working-calendar), which counts durations in the
same working time; without it durations stay in calendar days. Colours default to the theme
(`weekendBg`, `holidayBg`, `offHoursBg`, `intensiveBg`). `nonWorkingTime: false` turns it off.
`style: 'none'` keeps the definition but paints no weekend, holiday or off-hours band (intensive hours and
`highlightTime` still paint), so a chart can count working time without the stripes.

### Working calendar

Durations count calendar days unless you turn on `calendar`. Then the same weekends, holidays and working hours
that `nonWorkingTime` shades also drive the arithmetic: durations, drags, cells, the critical path and its float
count **working time**, so a bar dragged across a weekend keeps its working days and stretches over the days off.

```ts
options = {
  calendar: true, // = { durations: 'working', unit: 'day', skipNonWorking: true, hoursPerDay: 8 }
  nonWorkingTime: { holidays: [new Date(2026, 11, 25)] }, // Saturday and Sunday are off unless you say otherwise
  panel: { columns: ['name', 'start', 'end', 'duration'] },
};
```

| Option                    | Default     | Effect                                                                                                                                         |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar`                | off         | `true` is `{}`. Off (unset or `false`) is today's behaviour exactly: calendar days, nothing snapped                                            |
| `calendar.durations`      | `'working'` | What durations count: `'working'` time, or `'calendar'` days (texts as without a calendar; `skipNonWorking` still applies)                     |
| `calendar.unit`           | `'day'`     | `'day'`: a working day is a whole day. `'hour'`: working time is the hours of `nonWorkingTime.workingHours`, 09:00–17:00 when you set none     |
| `calendar.skipNonWorking` | `true`      | Edits never start or end a task on non-working time: starts move forward, ends back                                                            |
| `calendar.hoursPerDay`    | `8`         | With `unit: 'hour'`: the working hours that make `1d` in texts and typed durations (above 0, up to 24). It doesn't change the hours themselves |

- **One definition.** The calendar is built from the resolved `nonWorkingTime` — the weekends (Saturday and Sunday
  by default), holidays and `workingHours` the chart shades — so shading and arithmetic can't disagree.
  `nonWorkingTime: false` with a calendar means no non-working time at all (every day, and with `unit: 'hour'` every
  hour). A week with no working time (every weekday a weekend, or `unit: 'hour'` with no hours) turns the calendar off.
- **Hours.** With `unit: 'hour'` a working day is its `workingHours` ranges (one range, a list, or a per-weekday map;
  a weekday missing from the map has no hours; weekends and holidays always win), counted on the wall clock. The
  default 09:00–17:00 is the hours that are shaded too.

#### What counts working time

A "measured day" is a working day (with `unit: 'hour'`: working hours ÷ `hoursPerDay`). With
`durations: 'working'` they are what these show and use:

- the Duration column (text and sort), the tooltip's duration, the drag readout, and the variance column and
  tooltip row (signed, from the planned to the actual end);
- the duration cell (its text, what you type and the end it writes), the start cell (it keeps the working length)
  and predecessor lags;
- `rollup.progress: 'duration'` weights, and the CSV `duration` and `variance` data values;
- the critical path: durations, `GanttDependency.lag` and float.

Texts read "1 day", "5 days" (never weeks: a working week isn't 7 days) and, in an hour calendar, "6 hours" under
one day (`labels.durationHours`); the tooltip's float reads "2d" or "5h" (`labels.ttFloatDays`, `labels.ttFloatHours`).
A typed duration or lag takes `d` (a measured day), `w` (the working week: the weekdays with working time, 5 by
default, 7 with `durations: 'calendar'`) and `h` (an hour of the working day: 1 / `hoursPerDay` with `unit: 'hour'`,
else 1 / 24). The cell shows it back as `5d`, `1.5d` or `12h` (in an hour calendar whole days `2d`, else hours `20h`).

**Not changed:** the bars (a bar covers the days off it spans), the arrow lag labels (`+2d`), the event amounts
(`daysMoved` is the real calendar shift of the start) and the announcements ("Design moved 3 days later").

#### Editing

Only gestures and cells are snapped (`skipNonWorking`), never your data: `tasks`, `updateTask()`, `appendTasks()`,
the API, undo and redo draw what you give, a task that starts on a holiday keeps it until it is edited, and
validation never rejects a non-working date (do that in `editing.validate`, whose context has `calendar`: a
`WorkingCalendar` or `null`).

| Edit                         | What happens                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag a bar                   | The start moves by the pointer's snap units and snaps forward to where working time begins; the end keeps the **working length** (the bar widens over days off)                                                                                                                                                                                    |
| Resize an edge               | The edge moves by the snap units; a start snaps forward, an end back to right after working time. With working durations the task never gets shorter than one snap unit of working time (on a day scale of an hour calendar: the working hours of the edges' weekdays, up to `hoursPerDay`; `durations: 'calendar'`: only the usual minimum width) |
| Move mode (← →, Shift / Alt) | Each key press moves, or resizes, by one unit of working time (a working day; an hour on hour scales): no dead key over a weekend                                                                                                                                                                                                                  |
| Start cell                   | The start snaps forward; the end follows the working length                                                                                                                                                                                                                                                                                        |
| End cell                     | The end snaps back; an end before the start is an error, as before                                                                                                                                                                                                                                                                                 |
| Duration cell                | Sets the end from the start, **not** snapped: `3d` reads `3d`                                                                                                                                                                                                                                                                                      |

With `durations: 'calendar'` a moved bar keeps its calendar length, and with `skipNonWorking` its end snaps back so
it never ends on a day off (Monday–Tuesday moved to Friday ends on Saturday 00:00). With `durations: 'calendar'`
and `skipNonWorking: false` nothing is snapped, as without a calendar. A move that keeps the working length is **one** `task-dragged` (no `task-resized`) and one undo step.

**Dates.** A bar is measured on what it draws: date-only values are local days, and with the default
`endDateMode: 'exclusive'` a Monday–Friday task ends on Saturday 00:00 (`'inclusive'`: on Friday). Edited dates keep
the task's own form: a date-only value stays date-only and an inclusive end stays inclusive. In an hour calendar
the results carry times, so a date-only task edited there gains its working hours.

#### Critical path, float and Node

`criticalPath: true` computes the path in working time, so its chain can differ from the calendar-day one (the
gallery's _Critical path in working time_ case flips it with its Durations control). The tooltip shows the float of the tasks off
the path. Headless, pass the resolved config:

```ts
import { computeCriticalPath, createWorkingCalendar, formatDuration, resolveConfig } from '@gantryjs/core';

const options = { calendar: true, nonWorkingTime: { holidays: [new Date(2026, 9, 21)] } }; // Wed 21 Oct 2026
const calendar = createWorkingCalendar(options)!; // null when the week has no working time

const friday = new Date(2026, 9, 16);
calendar.addWorking(friday, 1); // Sat 17 Oct 00:00: right after Friday's working time
calendar.addWorking(friday, 2); // Tue 20 Oct 00:00: Friday, then Monday
calendar.snapStart(new Date(2026, 9, 17)); // Mon 19 Oct 00:00: a start moves forward
calendar.snapEnd(new Date(2026, 9, 19)); // Sat 17 Oct 00:00: an end moves back
calendar.workingDuration(new Date(2026, 9, 19), new Date(2026, 9, 24)); // 4: Wednesday is a holiday

const config = resolveConfig(options); // what the charts read
formatDuration({ start: friday, end: new Date(2026, 9, 20) }, config); // '2 days'
const { criticalIds, floatMap } = computeCriticalPath(tasks, config); // working days
```

`WorkingCalendar` also has `isWorkingDay()`, `isWorking()`, `toWorking()`, `fromWorkingStart()` and `fromWorkingEnd()`.
The measuring helpers `formatDuration()`, `formatFloat()`, `taskDuration()`, `spanDuration()`, `measureBetween()`,
`measureVariance()` and `addDuration()`, and the snaps `snapTaskStart()`, `snapTaskEnd()` and `followTaskEnd()`,
take the same config; `DEFAULT_WORKING_HOURS` and `DEFAULT_HOURS_PER_DAY` are the defaults.

#### Limits

- Hours count on the wall clock, so 09:00–17:00 is 8 hours on a daylight-saving day too. Where an hour calendar's
  hours include the hour that repeats when the clocks go back (a night shift), the working-time count steps back
  there.
- A timed task whose time is exactly midnight UTC in the viewer's zone is read as a date-only day (the
  [`normalizeDateOnly`](#dates-locales-and-format-tokens) rule): set `normalizeDateOnly: false` for timed tasks in an
  hour calendar.
- `hoursPerDay` is what `1d` means, even when a shift is shorter or longer.
- The event amounts (`daysMoved`, `daysDelta`) and the announcements stay calendar shifts, and `labels` gain the
  required `durationHours` and `ttFloatHours` (only a full `GanttLabels` object must list them: `options.labels` is
  partial).

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
    handles: { hitSize: 24 }, // width of each resize target in px (see Touch and pointer)
  },
  milestone: { size: 18, shape: 'diamond' }, // diamond | circle | square
  groupBar: { style: 'summary', height: '40%' }, // summary (bracket) | bar
  arrows: { width: 1.5, headSize: 5, radius: 6, offset: 12, color: '#64748b', routing: 'orthogonal' }, // or 'straight'
  indentSize: 16,
};
```

`arrows.routing` is `'orthogonal'` (default, right angles with rounded bends) or `'straight'`: one
line from the exit edge to the entry edge, its head along the line and its lag label beside the
midpoint.

Per task: `style` (see [Task styles](#task-styles)), `draggable` and `editable` (see [Editing](#read-only-tasks-and-fields)); the flat `barColor`,
`progressColor`, `textColor`, `rowColor` and `className` still work but are deprecated aliases
of `style.color` / `progressColor` / `textColor` / `rowColor` / `className`.
For full control replace the bar renderer (`renderBar` in the Web Component / bindings,
`provideGanttBar` in Angular) — custom renderers receive the computed geometry in `ctx.visual`
and its colours in `ctx.visual.paint` (see [Theming](#theming)). The chart gives every bar,
custom ones included, its role, name and roving `tabindex` (see [Screen readers](#screen-readers)),
hit-tests it by its visual box, and draws its focus ring and resize grips in an overlay
(`g.gantt-bar-overlay`, from `ctx.visual.focusRect` and `ctx.visual.handles.{left,right}.grip`),
so a renderer draws only the bar. `ctx.visual.handles` is `{ left, right }` (each a `hit` rect
and a `grip`) or `null` when the bar can't be resized.

### Task styles

```ts
options = {
  styles: {
    task: { radius: 3 }, // by bar kind: task · group · milestone
    parent: { color: '#475569', textColor: '#fff' }, // every row with children
    levels: [{ height: '70%' }, null, { color: '#94a3b8' }], // by depth: 0 = root rows
    rule: (row, { critical, status }) => (status === 'overdue' && !critical ? { color: '#dc2626' } : null),
  },
};
tasks = [
  { id: '7', name: 'Launch', start, end, style: { color: '#7c3aed', rowColor: '#faf5ff', className: 'launch' } },
];
```

A style has `color`, `progressColor`, `textColor`, `rowColor`, `className`, `height`, `radius` and
`label` (`'inside' | 'left' | 'right' | 'auto' | 'none'`), all optional. Each field is resolved on its
own, later layers winning:

| Order | Layer                                                                   |
| ----- | ----------------------------------------------------------------------- |
| 1     | the theme and the `bar` / `milestone` / `groupBar` options              |
| 2     | `styles.task` · `styles.group` · `styles.milestone` (by bar kind)       |
| 3     | `styles.parent` (rows with children)                                    |
| 4     | `styles.levels[depth]`                                                  |
| 5     | the rolled-up colour (`rollup.color`)                                   |
| 6     | `styles.rule(row, { rollup, critical, status })`, computed once per row |
| 7     | the deprecated flat fields (`task.barColor`, …)                         |
| 8     | `task.style` (always wins; `task.style` beats the flat fields)          |

`className` accumulates: every layer's classes apply, each once. The critical path still paints
its own fill. Custom bars get the result in `ctx.style` (`GanttBarContext`), and the built-in
bars, the row background in both panes, the task-list icon and the tooltip's progress fill read
the same style.

### Parents: rollup and collapsed groups

```ts
options = {
  rollup: true, // = { progress: 'duration', dates: true, color: false, segments: false }
  // rollup: { progress: 'count', dates: false, color: 'status', segments: true },
  groupBar: { collapsed: true }, // every parent starts collapsed
};
```

- `progress`: `'duration'` (default) is the mean of a parent's direct children weighted by their
  duration (milestones weigh 0), `'count'` the plain mean, `false` keeps the parent's own.
- `dates` (default `true`): the parent spans the earliest child start to the latest child end; its
  bar can't be dragged.
- `color`: `'status'` paints the children's summary status, a function
  `(children, parent) => colour | null`, `false` (default) keeps the styles.
- `segments` (default `false`): a **collapsed** parent draws its children inside its bar, each in
  its own colour (`rect.gantt-bar-segment`).
- Rolled-up values reach the task list, sorting, bars, tooltips and accessible names; events
  (`rowClick`, `getSelectedTasks()`) keep the raw tasks.
- `groupBar.collapsed` collapses every parent the chart has not seen yet (an explicit
  `task.collapsed: false` keeps one open). With `rollup` it is the "only parents" view.

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
  toolbar: { zoom: true, fit: true, viewModes: ['Day', 'Week', 'Month'], today: true, viewToggle: true }, // or false
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

### Responsive layout and density

```ts
options = {
  density: 'compact', // 'compact' · 'normal' (default) · 'comfortable'
  responsive: { breakpoint: 640, view: 'chart' }, // the default; `false` turns it off
};
```

| `density`     | Row height | Header tiers | Toolbar controls |
| ------------- | ---------- | ------------ | ---------------- |
| `compact`     | 28         | 28 / 24      | 28 px            |
| `normal`      | 36         | 32 / 28      | 32 px            |
| `comfortable` | 44         | 36 / 32      | 36 px            |

- An explicit `rowHeight`, `headerHeight` or `subHeaderHeight` wins over the density.
- Below `responsive.breakpoint` px of **chart width** (not the window) the chart shows
  `responsive.view` and goes back to the wide view when it widens. A view the user picks while
  narrow wins until the width crosses the breakpoint again. The forced view is never saved:
  `getState().view` and `stateChange` keep the wide view.
- The chart carries `data-density` and, while narrow, `data-narrow` (see
  [Read-only CSS variables](#read-only-css-variables)).

### Toolbar, legend and markers

```ts
options = {
  toolbar: {
    zoom: true,
    fit: true,
    today: true,
    viewToggle: true,
    panelToggle: false,
    overflow: 'menu',
    undo: true,
    export: false,
  }, // `false` hides the toolbar
  legend: { position: 'bottom' }, // 'bottom' | 'toolbar' (`showLegend` turns the legend on)
  markers: { lane: 'auto' }, // 'auto' | true | false
};
annotations = [{ x1: new Date(2026, 2, 2), label: { text: 'Code freeze' }, color: '#B91C1C' }];
```

- **Toolbar.** Zoom out, zoom in and **Fit** are 16 px icon buttons, Today is an icon with its
  label, and the zoom levels (`labels.viewModes`) and the views are radio groups (named by
  `labels.ariaZoomLevels` / `labels.ariaViews`); the views are icons named
  `labels.viewSplit` / `viewTable` / `viewChart` ("Table and chart", "Table only", "Chart
  only"), also shown as their `title`. Every control is at least 32 × 32 px. `toolbar.fit`
  (default `true`) shows the Fit button, which calls `fitToScreen()` (see [Zoom](#zoom)). The
  toolbar is a single tab stop (see [Keyboard and focus](#keyboard-and-focus)); a radio is
  checked by Space, Enter or a click, never by moving focus onto it. Angular's
  `[ganttToolbar]` content sits between Today and the view switch, outside that roving set.
- **Panel toggle and More menu.** `toolbar.panelToggle` (default `false`) adds a button first
  that shows / hides the task list (`aria-pressed`; `labels.showPanel` / `hidePanel`): hiding it
  goes to the chart view (from the table view too), showing it to the split view, as `togglePanel()`.
  `toolbar.overflow` decides what happens when the controls don't fit the measured width:
  `'menu'` (default) moves the Export menu, then the zoom levels, then the views, then Today into a **More** button
  (`labels.more`), a WAI-ARIA menu button (↓ / ↑, Home / End, Enter / Space, Esc, Tab and an outside
  press close it); `'wrap'` wraps them onto more lines. A toolbar that fits renders as it always did.
- **Export menu.** `toolbar.export` (default `false`) adds an Export icon button (`labels.exportMenu`) after the view
  switch. It opens a menu with one item per [`export.formats`](#export-and-print) entry (`labels.exportSvg` "SVG image",
  `exportPng` "PNG image", `exportCsv` "CSV table", `exportPrint` "Print…"; no formats, no button): an item runs
  `download(format)` or `print()` with `trigger: 'toolbar'`. Same keys and focus rules as More (↓ opens on the first
  item, ↑ on the last; focus goes back to the button after an item), and one of the two menus is open at a time. It is
  the first group to move into More, where its formats become a section named `labels.exportMenu` (never a nested
  menu). With `toolbar.export` off the toolbar is unchanged.
- **Undo and Redo.** `toolbar.undo` (default `true`) adds two icon buttons after the panel toggle while the chart
  keeps an [editing history](#history) (`editing` on, not `controlled`): `labels.undo` / `labels.redo`,
  `aria-disabled` while there is nothing to undo or redo, in the toolbar's arrow-key set and never moved into the
  More menu.
- **Legend.** `showLegend` turns it on. It lists the today marker (with `showToday`), every
  annotation and, when those options are on, the critical path and the baseline; each entry
  has a shape as well as a colour. `legend.position: 'bottom'` (default) puts it in a strip
  under the task list and the timeline; `'toolbar'` at the end of the toolbar, falling back to
  the bottom when the toolbar is hidden. It is not shown in the table view. Its strings:
  `labels.legend`, `today`, `annotation`, `legendCritical`, `legendBaseline`.
- **Marker lane.** An 18 px lane under the header tiers holds a tick for each annotation with
  its label, and a **Today** chip (`labels.today`) while `showToday` is on, so labels never
  cover bars. `markers.lane: 'auto'` (default) shows it when at least one annotation has a
  label, `true` always, `false` never; the table view has none. Lane labels use the theme text
  colour (`--gantt-text`, so they stay readable on the header), ticks the annotation colour
  (today: `--gantt-today`, its label `--gantt-today-label`). A label that doesn't fit before the
  next marker is cut short (its `title` has the full text) and hidden under 24 px. With the
  lane off, annotation labels are drawn in the timeline as before, in `label.color`.

### Tooltip

```ts
options = {
  tooltip: {
    trigger: 'auto', // 'auto' (hover, keyboard focus, tap) · 'hover' · 'focus'
    showDelay: 320, // ms the pointer rests on a bar before it opens; focus opens it at once
    hideDelay: 120, // ms it stays open after the pointer leaves the bar
    render: ({ task, model }) => `${task.name}: ${model.rows.length} facts`, // a string or a DOM node
  },
};
```

- `tooltipEnabled` (property / input / prop, default `true`) turns the tooltip on. It is one
  native popover per chart (`div.gantt-tooltip[role=tooltip]`, Popover API), placed **below its
  bar** (above it when there is no room), centred on the pointer while hovering and on the bar
  otherwise, and kept inside the window.
- `'auto'` opens it on hover, when a bar gets keyboard focus, and on a tap (a second tap
  closes it). Once it shows, hovering another bar switches at once. The pointer can move onto
  the tooltip and rest there, **Escape** closes it (before it clears the selection), and so does
  a press elsewhere, a drag or keyboard move mode. While it shows, its bar has
  `aria-describedby` pointing at it (WCAG 1.4.13).
- `render(ctx)` replaces the title and the rows (the box, its placement and timing stay the
  chart's): return a string (shown as text) or a DOM node, which fill `div.gantt-tooltip-custom`;
  `null`, `undefined` or `false` keeps the built-in content, and so does a `render` that throws
  (the error is logged). `ctx` is `{ model, task, row }`: `model` is what the built-in tooltip shows
  (`title`, `rows` of `{ label, value }`, `progress`, `status`, `critical`, …). The React, Vue
  and Svelte wrappers pass it to the Web Component as is: return a string or a DOM node, not a
  React element, a VNode or a snippet.
- **Angular**: an `<ng-template ganttTooltip>` inside `<gantry>` (import
  `GanttTooltipTemplateDirective`) takes precedence over `render`. Its context is
  `GanttTooltipTemplateContext` (`$implicit` / `model`, `task`, `row`):

  ```html
  <gantry [series]="tasks">
    <ng-template ganttTooltip let-model let-task="task">
      <strong>{{ task.name }}</strong> · {{ model.rows.length }} facts
    </ng-template>
  </gantry>
  ```

### Loading, error and empty states

| Binding            | Loading / error                                                                                            | Retry pressed | Empty-state content                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- |
| `<gantry-element>` | `el.loading = true` · `el.errorMessage = 'Couldn’t load the plan'` (`loading`, `error-message` attributes) | `retry` event | a `<div slot="empty">…</div>` child         |
| Angular `<gantry>` | `[loading]="pending()"` · `[errorMessage]="error()"`                                                       | `(retry)`     | `<div ganttEmpty>…</div>` inside `<gantry>` |
| React              | `loading={pending}` · `errorMessage={error}`                                                               | `onRetry`     | a `<div slot="empty">` child                |
| Vue                | `:loading="pending"` · `:error-message="error"`                                                            | `@retry`      | a `<div slot="empty">` in the default slot  |
| Svelte             | `{loading}` · `{errorMessage}`                                                                             | `onRetry`     | an `empty` snippet (`{#snippet empty()}`)   |

The chart body shows one state at a time, by precedence:

1. **Error** — a non-blank `errorMessage`: a box over the body (`role="alert"`) with
   `labels.errorTitle` ("Couldn’t show the chart"), your message and a **Retry** button, which
   fires `retry` with `{ source: 'error' }`: load again, then clear `errorMessage`.
2. **Loading** — `loading` (or a data source fetching its first page) while there are no rows:
   placeholder rows (their shimmer stops under `prefers-reduced-motion`) with `labels.loading`
   as visually hidden text, and the host is `aria-busy`. Over rows already shown, `loading` only
   sets `aria-busy`.
3. **Error of a data source** — its first page failed after its automatic retries: the same
   box with `labels.loadError`; Retry fires `retry` with `{ source: 'dataSource' }` and calls
   `dataSource.retry()`. A later page fails in the task-list footer instead (its Retry only
   calls `dataSource.retry()`).
4. **Empty** — no rows and nothing more to load: your empty-state content, else
   `labels.emptyState` ("No tasks to show"). Set `loading` while you fetch, so the first paint
   is the skeleton rather than the empty state.

`RetryEvent` (`{ source: 'error' | 'dataSource' }`) is exported by every package. The box is
attached only while a state shows (Web Component part `state`), from the header height down.
What it covers — the timeline, the splitter and the task-list rows — is `inert` meanwhile (out
of the tab order and the accessibility tree), and focus on one of them moves to Retry, else to
the toolbar. The task-list header row stays above the box: its first cell is the task list's
tab stop.

### Synchronised charts

Charts that share a **sync group** keep one timeline: the date range (the union of their plans, so a
date sits at the same x in every chart), the zoom level, the horizontal scroll and the task-list
width. Create the group once, give it to every chart:

```ts
import { createGanttSyncGroup } from '@gantryjs/core'; // also re-exported by every package

const group = createGanttSyncGroup(); // or { zoom, scroll, range, panel }: each `true` by default
```

```html
<!-- Angular -->
<gantry [series]="design" [syncGroup]="group" />
<gantry [series]="build" [syncGroup]="group" [showToolbar]="false" />
```

```js
// Web Component
a.syncGroup = group;
b.syncGroup = group;
```

```tsx
<Gantry tasks={design} syncGroup={group} /> // React
```

```vue
<Gantry :tasks="design" :sync-group="group" />
<!-- Vue -->
```

```svelte
<Gantry tasks={design} syncGroup={group} /> <!-- Svelte -->
```

- Range and task extent are unions over the members; zoom level, scroll and panel width are
  last-writer-wins and go to every member but the one that reported them. `group.setLevel()` and
  `group.scrollTo()` drive every member.
- A chart that joins a group that already has a scroll position opens there instead of at
  `initialScroll`. A scroll the group applied is never sent back, and a zoom level a chart doesn't
  have is ignored. Applying the group's panel width doesn't save the chart's state (a later save keeps the width shown), and **Fit to screen**
  fits the group's extent.
- `null` or `undefined` (the default) is not synchronised. A chart leaves its group when it is
  destroyed or disconnected, or when the property changes.
- Keep the group in a plain constant (Svelte: `const` or `$state.raw`, never a deep `$state`): it
  is passed by identity and never copied.

### Editing

```ts
options = {
  editing: {
    cells: true, // edit task-list cells: F2, Enter, double-click or typing
    progress: { step: 5 }, // the progress grip and ↑ / ↓ in move mode, in % (`true` = step 5)
    dependencies: { create: true, delete: true, parentChild: false }, // draw / delete links; parent ↔ child links
    validate: (change, { tasks, proposed }) => (isAllowed(proposed) ? true : 'Not allowed'), // after the built-in checks
    history: { limit: 100, coalesceMs: 800 }, // undo / redo; `false` keeps none
    controlled: false, // true: the app owns the tasks (see below)
  },
};
```

`editing` is off by default. `true` turns on every feature with the defaults above; in the object form
every feature is on unless you set it to `false` (`dependencies.parentChild` is the exception: off
unless you set it). Drag and resize follow `enableDrag` / `enableResize` whatever `editing` is, but
every change — a drag, a resize, move mode, the progress grip, a cell, a link, the API, undo — goes
through the same pipeline once, so the events, the validation and the undo history are the same in
every binding. Try it in the **Editing** cases of the [gallery](#examples-gallery).

| Option                             | Default                                  | What it does                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editing.cells`                    | `true`                                   | The cells of editable columns open an editor ([Cells](#cells))                                                                                                                                   |
| `editing.progress`                 | `true` (`step: 5`)                       | The progress grip on bars and ↑ / ↓ in move mode, snapped to `step` %                                                                                                                            |
| `editing.dependencies.create`      | `true`                                   | Draw links from a bar's connector, or with **L**; the `predecessors` cell ([Links](#links))                                                                                                      |
| `editing.dependencies.delete`      | `true`                                   | Click an arrow, then Delete                                                                                                                                                                      |
| `editing.dependencies.parentChild` | `false`                                  | Allow links between a task and its own ancestors or descendants                                                                                                                                  |
| `editing.validate`                 | none                                     | Your own check, after the built-in ones: return `false` or a message to reject the change; its context has `{ tasks, proposed, calendar }` (the [working calendar](#working-calendar) or `null`) |
| `editing.history`                  | `true` (`limit: 100`, `coalesceMs: 800`) | Undo / redo: at most `limit` steps; consecutive keyboard, progress or cell changes of one task within `coalesceMs` are one step                                                                  |
| `editing.controlled`               | `false`                                  | The app owns the tasks: the chart applies nothing and keeps no history ([Controlled mode](#controlled-mode))                                                                                     |
| `toolbar.undo`                     | `true`                                   | The toolbar's Undo / Redo buttons (shown while a history is kept)                                                                                                                                |

#### The pipeline and its events

Every change is one `GanttChange` (`{ source, updates, ops, column?, coalesceKey? }`; each update has the
task's `before` and `after` fields), and runs through these steps:

1. **Validate.** Built-in checks first — a link to itself, a duplicate link (one link per pair of tasks,
   whatever its type), a link between a task and its own ancestor or descendant (unless `parentChild`), a loop,
   an end before its start, a progress outside 0–100, a read-only task or field — then `editing.validate`.
   A rejection stops here: nothing else fires, and the reason is announced (`labels.announceChangeRejected`;
   a cell shows it under the editor).
2. **`before-change`.** Call `detail.preventDefault()` in the handler, synchronously, to veto it. The
   Web Component's event is also cancelable (`event.preventDefault()`). A veto is announced too.
3. **Apply and record.** The tasks you passed are updated (`tasks`, `[(series)]`, or the data source through
   `patch()`) and the step goes on the undo stack. With `controlled` nothing is applied.
4. **The events**, in this order: one per op (`task-dragged`, `task-resized`, `task-progress-changed`,
   `dependency-created`, `dependency-deleted`), then `task-updated` per changed task, then `tasks-change`, then
   `history-change` (only when the undo state changed).

Ops come from what changed, not from the gesture: a date typed in a Start cell fires `task-dragged` as a
drag does, an End cell `task-resized`, the predecessors cell `dependency-created` / `dependency-deleted`,
and an undo fires the inverse events (`source: 'undo'`). A change that changes nothing fires nothing. With a
[working calendar](#working-calendar) a move that keeps the working length is one `task-dragged` (no
`task-resized`) and one undo step, and `daysMoved` is the real calendar shift of the start.
A change started from inside one of these listeners (`addDependency()`, `undo()`…) is refused (`false`).

| Event (Angular output · React / Svelte callback · Vue)                                                                                                                                      | `detail`                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `before-change` · `(beforeChange)` · `onBeforeChange` · `@before-change`                                                                                                                    | `GanttBeforeChangeEvent` — `{ change, tasks, defaultPrevented, preventDefault() }`; `tasks` are the proposed tasks    |
| `task-dragged` · `(taskDragged)` · `onTaskDragged` · `@task-dragged`                                                                                                                        | `TaskDragEvent` — `{ taskId, oldStart, oldEnd, newStart, newEnd, daysMoved }`                                         |
| `task-resized` · `(taskResized)` · `onTaskResized` · `@task-resized`                                                                                                                        | `TaskResizeEvent` — `{ taskId, edge: 'start' \| 'end', oldStart, oldEnd, newStart, newEnd, daysDelta }`               |
| `task-progress-changed` · `(taskProgressChanged)` · `onTaskProgressChanged` · `@task-progress-changed`                                                                                      | `TaskProgressEvent` — `{ taskId, oldProgress, newProgress }`                                                          |
| `dependency-created` / `dependency-deleted` · `(dependencyCreated)` / `(dependencyDeleted)` · `onDependencyCreated` / `onDependencyDeleted` · `@dependency-created` / `@dependency-deleted` | `DependencyChangeEvent` — `{ fromId, toId, type, lag }`                                                               |
| `task-updated` · `(taskUpdated)` · `onTaskUpdated` · `@task-updated`                                                                                                                        | `TaskUpdatedEvent` — `{ taskId, task, previous, fields, source }`                                                     |
| `tasks-change` · `(tasksChange)` · `onTasksChange` · `@tasks-change`                                                                                                                        | `GanttTasksChangeEvent` — `{ tasks, change, applied }`: the tasks now, or the proposed ones when `applied` is `false` |
| `history-change` · `(historyChange)` · `onHistoryChange` · `@history-change`                                                                                                                | `GanttHistoryState` — `{ canUndo, canRedo, undoLabel, redoLabel, undoCount, redoCount }`                              |

`source` is `'drag' | 'resize' | 'progress' | 'keyboard' | 'cell' | 'link' | 'delete' | 'api' | 'undo' | 'redo'`.
`applied` is `false` in controlled mode and when your handler set the tasks itself during `before-change`.
`TaskResizeEvent.handle` (`'left' | 'right'`) is deprecated: use `edge`. In controlled mode the op events and
`task-updated` still fire (with the proposed change), so you can log or save from them.

#### Controlled mode

With `editing: { controlled: true }` the app owns the tasks. The chart validates each change, offers it to
`before-change` and reports it in `tasks-change` with the proposed tasks (`applied: false`); you set them
yourself. It applies nothing and keeps no history (undo is yours: `GanttHistory` and `applyChange` /
`invertChange` from `@gantryjs/core` are the pieces). This is how you approve a change asynchronously, or keep
the plan in a store.

```tsx
// React
<Gantry
  tasks={tasks}
  options={{ editing: { controlled: true } }}
  onBeforeChange={d => {
    if (isLocked(d.change)) d.preventDefault();
  }}
  onTasksChange={d => setTasks(d.tasks)}
/>
```

```vue
<!-- Vue -->
<Gantry
  :tasks="tasks"
  :options="{ editing: { controlled: true } }"
  @before-change="
    d => {
      if (isLocked(d.change)) d.preventDefault();
    }
  "
  @tasks-change="d => (tasks = d.tasks)"
/>
<!-- const tasks = shallowRef(initial) -->
```

```svelte
<!-- Svelte; let tasks = $state.raw(initial) -->
<Gantry
  {tasks}
  options={{ editing: { controlled: true } }}
  onBeforeChange={d => {
    if (isLocked(d.change)) d.preventDefault();
  }}
  onTasksChange={d => (tasks = d.tasks)}
/>
```

```html
<!-- Angular -->
<gantry
  [series]="tasks()"
  [options]="{ editing: { controlled: true } }"
  (beforeChange)="isLocked($event.change) && $event.preventDefault()"
  (tasksChange)="tasks.set($event.tasks)"
/>
```

```ts
// Web Component
chart.options = { editing: { controlled: true } };
chart.addEventListener('before-change', e => {
  if (isLocked(e.detail.change)) e.preventDefault(); // or e.detail.preventDefault()
});
chart.addEventListener('tasks-change', e => (chart.tasks = e.detail.tasks));
```

In the other modes the chart applies the change itself, so the handlers only need to react:
`onTasksChange` gives you the new tasks to keep in state (React `setTasks(d.tasks)`), and the Angular
`series` is a model — bind `[(series)]="tasks"` to get the applied tasks back (a one-way `[series]` works too). Setting the tasks inside `before-change` counts as handling
the change (`applied: false`, nothing recorded); in Angular do that with `series.set()` or a data-source write.
Svelte copies the `tasks` prop one level: keep app-owned tasks in `$state.raw`; in Vue use `shallowRef`.

#### Read-only tasks and fields

| Set                                              | What the user can no longer change                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `task.editable: false`                           | Everything on that row: dates, progress, cells and links (pointer, keyboard, cell and API)                           |
| `task.draggable: false`                          | The dates only: move, resize and the Start / End / Duration cells. Progress, the other cells and links stay editable |
| `enableDrag` / `enableResize` off                | Moving / resizing every bar (and the Start / End / Duration cells they edit)                                         |
| a parent with `rollup.dates` / `rollup.progress` | Those derived fields                                                                                                 |
| milestones                                       | Resizing and progress                                                                                                |

Edits that are not allowed don't show their handles (no grip, no connector, no `gantt-bar-draggable`) and are
rejected whatever their source. They lock a bar's move and resize with `editing` off too.

#### History

```ts
el.undo(); // → boolean (false: nothing to undo, no history, rejected or vetoed)
el.redo();
el.canUndo; // Angular: gantt.canUndo() — a signal
el.clearHistory(); // task changes made elsewhere never clear it
```

- **Keys.** <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undoes, <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> and
  <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, while the chart keeps a history and the focus is inside it — but not in
  text entry, not inside an open cell editor and not in move mode, where the browser's own keys stay. The toolbar
  has Undo and Redo buttons after the panel toggle (`toolbar.undo`; `aria-disabled` when there is nothing to do,
  never in the More menu).
- **Steps.** One change is one step, and undo restores the data's own shape (a string `dependency` stays a string).
  Move-mode commits of one task, progress changes and edits of one cell merge into one step within `coalesceMs`
  (800 ms); pointer drags never merge. The oldest steps drop past `limit`. A step whose tasks are gone is skipped.
- **Announcements.** Undo and redo are announced with what they did (`labels.announceUndo(…)`, `announceRedo(…)`);
  `history-change` carries `undoLabel` / `redoLabel` ("Moved Design 2 days later") for your own buttons.
- **`updateTask()` and `appendTasks()`** stay silent data writes: no `before-change`, no events, no history. They
  write the raw input (`tasks` as you set it, `[(series)]`, or the data source through `patch()`).

#### Cells

With `editing.cells`, a task-list cell of an editable column opens an editor on <kbd>F2</kbd>,
<kbd>Enter</kbd>, a double-click (`row-dblclick` still fires) or typing a character (it starts the text).

| Key                                   | In the editor                                                  |
| ------------------------------------- | -------------------------------------------------------------- |
| <kbd>Enter</kbd>                      | Commit and close                                               |
| <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | Commit, then edit the next / previous editable cell of the row |
| <kbd>Esc</kbd>                        | Cancel                                                         |
| Focus leaves the cell                 | A valid value commits; an invalid one cancels, announced       |

A commit is one `'cell'` change through the [pipeline](#the-pipeline-and-its-events) (so `before-change` can veto
it and Undo reverts it). An invalid value keeps the editor open: the field gets `aria-invalid`, the message
shows under the cell and is read from the alert region. While cell editing is on, every cell has `aria-readonly`
(`"false"` on the ones you can edit). The editor is named `labels.ariaCellEditor(column, task)`.

| Built-in column | Editor and accepted text                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`          | Text, required (trimmed)                                                                                                                                                                                                                                                       |
| `start`, `end`  | `date`, or `datetime-local` on hour scales and for dates with a time. A new start keeps the duration; an end can't precede the start. Date-only values stay date-only. With a [working calendar](#working-calendar) a start snaps forward and an end back off non-working time |
| `duration`      | `5`, `5d`, `2w`, `4h`, `1.5d` (`1,5d` too): more than 0; sets the end. Whole local calendar days plus real hours; with a [working calendar](#working-calendar), working days, the working week and hours of the working day                                                    |
| `progress`      | Number from 0 to 100 (`45` or `45%`), step `editing.progress.step`                                                                                                                                                                                                             |
| `predecessors`  | Text, see below. The editor shows task **ids** (`research FS+2d; scope SS`); the cell shows names                                                                                                                                                                              |

`name`, `start`, `end`, `duration`, `progress` and `predecessors` are editable by default (your own column over one
of those keys too: the key says which field it edits); every other column isn't, and `id` never is. The
field's rule applies on top: Start needs the bar to be movable, End and Duration resizable, Progress `editing.progress`,
Predecessors `editing.dependencies.create`.

**Predecessors.** Entries are separated by `;` or `,`. Each is `<task> [FS|SS|FF|SF] [±n[d|w|h]]`, case-insensitive: `research`,
`research FS+2d`, `scope SS`, `a+2d`, `2FS-1w`. A task is an id, else a name that matches exactly one task (exact first,
then ignoring case). The type defaults to FS, the lag to 0 and its unit to days (`w` = 7 days, `h` = 1/24; with a
[working calendar](#working-calendar) the lag counts working days, `w` is the working week and `h` an hour of the working day). Empty text
removes every link. An unknown task, a name shared by several tasks, a repeated link, a loop or a parent ↔ child link is
an error with its message. Ids that contain `;` or `,` can't be referenced.

**Custom columns.**

```ts
columns = [
  {
    key: 'estimate',
    label: 'Estimate',
    width: 90,
    editable: row => row.task.type !== 'milestone', // true | false | per row
    editor: 'number', // 'text' | 'number' | 'date' | 'datetime-local' | 'select', or your own (below)
    editorOptions: { min: 1, max: 80 }, // number: min / max / step; select: { options: [{ value, label }] }
    exportValue: row => String(row.task.data?.['estimate'] ?? ''), // the editor's first value
    parse: text => ({ data: { estimate: Number(text) } }), // the text → the task fields; throw Error('…') to reject
    validate: patch => (Number(patch.data?.['estimate']) > 80 ? 'At most 80 hours' : null),
  },
];
```

Without `parse`, the text is written to `task[key]` when `key` is a `GanttTask` field, else to `data[key]` (a number
for `'number'`, a date for the date kinds; empty text clears it). In Angular the same fields are inputs of
`ganttColumn`: `editable` (also a bare attribute), `editor`, `editorOptions`, `exportValue`, `parse`, `validate`.

#### Custom editors

`editor` can be your own function. It gets a `CellEditorContext` (`row`, `column`, `value`, `labels`, `invalid`,
`setValue(text)`, `commit(move?)`, `cancel()`) and returns the editor's DOM node; call `setValue()` as the value
changes and `commit()` / `cancel()` to finish. The chart focuses the node (or its first focusable child) and
handles Enter, Tab and Escape unless the editor prevents them; chart shortcuts (`+ − T F`, Ctrl+A, Ctrl+Z) are ignored
inside an open cell editor.

```ts
// Web Component · React · Vue · Svelte: a function returning a node
const colour = ctx => {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = ctx.value;
  input.setAttribute('aria-label', ctx.labels.ariaCellEditor('Colour', ctx.row.task.name));
  input.addEventListener('input', () => ctx.setValue(input.value));
  return input;
};
columns = [
  { key: 'colour', label: 'Colour', width: 70, editable: true, editor: colour, parse: v => ({ style: { color: v } }) },
];
```

```html
<!-- Angular: a template (import GanttCellEditorDirective next to GanttColumnDefDirective) -->
<gantry [series]="tasks" [options]="{ editing: true }">
  <ng-container ganttColumn="colour" label="Colour" [width]="70" editable>
    <ng-template ganttCellEditor let-edit>
      <input #p type="color" [value]="edit.value" (input)="edit.setValue(p.value)" />
    </ng-template>
  </ng-container>
</gantry>
```

- Without `GanttCellEditorDirective` in `imports`, Angular takes the editor template for the cell template. A function
  (`[editor]="fn"`) works too and wins over the template.
- The node is mounted in the chart's shadow root in the Web Component and the wrappers: page CSS doesn't reach it, style
  it inline (the `--gantt-*` variables do). In Angular it is in the light DOM and gets the editor look through its
  `gantt-tl-editor` class.
- An editor with several focusable fields must handle Tab itself (`preventDefault()` and move the focus): the chart
  commits on Tab.
- `editCell(taskId, columnKey)` opens an editor from code, also on a row scrolled out of view. After a mouse click on
  your own button, `focusTask(id)` shows no focus ring on the bar (the browser's `:focus-visible` rules).

#### Links

With `editing.dependencies`, a bar shows a connector at each end while it is hovered, keyboard-focused or (touch) selected.

- **Drag** from a connector to another bar, **or click** (tap) a connector and then the target bar, **or press L** on a
  bar, move to another with the arrow keys and press Enter (or L).
- A link from A to B makes B depend on A (`B.dependency` gains `{ taskId: 'A' }`). The type follows the ends: A's end to
  B's start is FS, end → end FF, start → start SS, start → end SF; the keyboard makes FS. A new link has no lag (edit
  it in the Predecessors cell).
- While you draw, a dashed `path.gantt-link-preview` follows the pointer; an invalid target (the same task, a duplicate,
  a loop, a parent ↔ child link, a read-only task) is marked and announced, and letting go creates nothing. Escape
  cancels; a click on empty space cancels a click-mode link.
- **Delete:** click an arrow (a 10 px band), then <kbd>Delete</kbd> or <kbd>Backspace</kbd> (`dependencies.delete`);
  <kbd>Esc</kbd> deselects. The selected arrow is `gantt-arrow--selected` and announced.
- `addDependency(fromId, toId, type = 'FS', lag = 0)` and `removeDependency(fromId, toId, type?)` do the same from code
  (source `'api'`, validated, vetoable, undoable); both return whether they ran.

While a link is drawn the Web Component matches `:state(linking)` and Angular's host has the class `gantry-linking`.

#### Methods and the data source

| Method (Angular: on the component)                 | What it does                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `undo()` / `redo()` → `boolean`                    | Step through the history                                                              |
| `canUndo` / `canRedo`                              | Web Component getters; signals in Angular (`gantt.canUndo()`)                         |
| `clearHistory()`                                   | Forget every step                                                                     |
| `addDependency(from, to, type?, lag?)` → `boolean` | Link two tasks                                                                        |
| `removeDependency(from, to, type?)` → `boolean`    | Remove the links from `from` to `to`                                                  |
| `editCell(taskId, columnKey)` → `boolean`          | Open a cell's editor (`false`: that cell can't be edited)                             |
| `focusTask(id, { area })` → `boolean`              | Focus a bar (`'bar'`) or row (`'row'`); expands collapsed ancestors and scrolls to it |

With a data source, edits go through `dataSource.patch(items => items.map(…))` (also `GanttDataSource.patch()` in Angular):
they replace the loaded items without a fetch and keep the paging state, so the edit survives the next page; `reset()`
drops them. `PagedLoader.patch()` is the same in `@gantryjs/core`.

#### Breaking changes

- Angular **`(rowClick)`** emits the clicked row (`GanttFlatRow`) from both panes, like every other binding, instead of
  its `RowGeometry`: `$event.row.task` becomes `$event.task`.
- Angular **`series`** is a model (`[(series)]`); `[series]` alone still works.
- **`TaskResizeEvent`** has a required `edge: 'start' | 'end'`; `handle` is deprecated.
- Hand-built objects need the new fields: `GanttLabels` (24 required labels: `undo`, `redo`, `ariaCellEditor`, the `announce…`
  and `error…` ones), `ToolbarLabels` (`undo`, `redo`), `BarVisual` (`progressGrip`, `connectors`), `ArrowVisual`
  (`points`, `selected`), `ToolbarItem` (`disabled`), `ResolvedToolbar` (`undo`), `BarOverlayLink` (`sourceSide`) and `BarHit`
  (`'progress' | 'link-start' | 'link-end'`). `options.labels` stays partial.
- A rolled-up parent (`rollup.dates`) and an `editable: false` task no longer start a drag.
- In the Web Component, `updateTask()` / `appendTasks()` write the raw input (the data source's `patch()`), as Angular does.

### Export and print

```ts
options = {
  toolbar: { export: true }, // an Export menu in the toolbar (default false)
  export: {
    fileName: 'roadmap', // or format => `roadmap-${format}`; default 'gantt'
    formats: ['svg', 'png', 'csv', 'print'], // the Export menu's items, in order
    svg: { theme: 'light' }, // each format's defaults (tables below)
    png: { scale: 2 },
    csv: { delimiter: ';' },
    print: { paper: 'a4', orientation: 'landscape', fit: 'width' },
  },
};
```

```ts
const svg = await chart.exportSvg({ range: 'visible' }); // '<svg …>…</svg>'
const csv = await chart.exportCsv({ columns: 'all' }); // CSV text
const png = await chart.exportPng({ scale: 3 }); // a Blob
await chart.download('png', { fileName: 'plan', theme: 'dark' }); // true; false when vetoed
await chart.print({ paper: 'letter', orientation: 'portrait' }); // true once the print dialog returned
```

Exports are **drawn again from the chart's model** (`@gantryjs/core`), not copied from the screen: every shown
row, not only the ones mounted, with resolved colours and no CSS. Both renderers build the same snapshot, so the
Web Component (and React, Vue, Svelte) and Angular give byte-identical SVG and CSV for the same chart. Every method is
async; a call's options win over `options.export.<format>`, which wins over the defaults, and an invalid number
(a scale or limit ≤ 0, a negative margin or one that leaves no room on the paper, fewer than 1 page) keeps the
default. An export draws the chart as it is when the method is called: changing the tasks right after the call
doesn't change the file. Try it in the **Export and print**
cases of the [gallery](#examples-gallery).

| Option            | Default                          | What it does                                                                                                                                                                                                                                                          |
| ----------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolbar.export`  | `false`                          | The toolbar's [Export menu](#toolbar-legend-and-markers): one item per format, running `download()` or `print()`                                                                                                                                                      |
| `export.fileName` | `'gantt'`                        | A download's name, or a function of the format (`'svg' \| 'png' \| 'csv'`). Made safe on every OS (`/ \ : * ? " < > \|`, control and bidi characters, leading and trailing dots and spaces removed; at most 120 characters; `CON`, `NUL`… get a `_`), extension added |
| `export.formats`  | `['svg', 'png', 'csv', 'print']` | The Export menu's items, in order (unknown and repeated ones dropped; an empty list hides the button)                                                                                                                                                                 |
| `export.svg`      | below                            | `exportSvg()` and `download('svg')` defaults                                                                                                                                                                                                                          |
| `export.png`      | below                            | `exportPng()` and `download('png')` defaults                                                                                                                                                                                                                          |
| `export.csv`      | below                            | `exportCsv()` and `download('csv')` defaults                                                                                                                                                                                                                          |
| `export.print`    | below                            | `print()` defaults                                                                                                                                                                                                                                                    |

**Images** (`svg`, `png` and `print` options):

| Option          | Default                                       | What it does                                                                                                                                                                                                   |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`          | `'auto'`                                      | The view drawn: `'auto'` = the one shown (task list and timeline in `'split'`, the timeline in `'chart'`, the task list in `'table'`), or `'split'` / `'table'` / `'chart'`                                    |
| `range`         | `'all'`                                       | `'all'` = the tasks' whole range (and the sync group's), whatever the chart's width; `'visible'` = the part of the timeline on screen; `{ start, end }` = those dates (the timeline is extended, then clipped) |
| `theme`         | `'current'` (print: `'light'`)                | `'current'` = the palette shown (dark included); `'light'` / `'dark'` = that palette with the chart's theme overrides                                                                                          |
| `background`    | `'theme'`                                     | `'theme'`, `'transparent'` or a CSS colour (SVG and PNG; print always uses the theme's)                                                                                                                        |
| `legend`        | as the chart                                  | The legend strip at the bottom (default: `showLegend`, when it has entries)                                                                                                                                    |
| `today`         | `showToday`                                   | The today line and its header pointer                                                                                                                                                                          |
| `title`         | `labels.ariaChart`                            | The image's `<title>`; the print document's title (browsers use it as the PDF's name)                                                                                                                          |
| `description`   | `labels.exportDescription(count, start, end)` | The image's `<desc>` ("12 tasks from Mar 2, 2026 to Apr 30, 2026", dates in `formats.dateFormat`)                                                                                                              |
| `customBars`    | `'render'`                                    | `'render'` = custom bars as drawn on screen, `'builtin'` = as built-in bars (see [Custom bars](#custom-bars-in-exports))                                                                                       |
| `svg.scale`     | `1`                                           | The `<svg>`'s `width` / `height` times this (the `viewBox` stays)                                                                                                                                              |
| `svg.idPrefix`  | `gantry-export-<n>`                           | Prefix of the image's ids (`<prefix>-title`, `<prefix>-desc`…); the default is new for every image                                                                                                             |
| `png.scale`     | `2`                                           | Pixels per CSS pixel, lowered (in 0.01 steps) until the image fits the limits; below 1 the export fails with a `RangeError`                                                                                    |
| `png.maxSide`   | `16384`                                       | Largest width or height in pixels                                                                                                                                                                              |
| `png.maxPixels` | `16777216`                                    | Largest number of pixels (4096 × 4096, safe on iOS)                                                                                                                                                            |

**CSV** (`csv` options):

| Option               | Default     | What it does                                                                                                                                                                                                                    |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`            | `'visible'` | `'visible'` = the columns of the view shown (the split panel's in the chart view); `'all'` = every built-in and custom column; or a list of keys: columns, or [raw task fields](#csv) such as `parentId` (unknown keys dropped) |
| `rows`               | `'all'`     | `'all'` = every loaded task in display order, children of collapsed rows included; `'shown'` = the rows shown                                                                                                                   |
| `values`             | `'data'`    | `'data'` = values, `'display'` = the cell texts (table below)                                                                                                                                                                   |
| `delimiter`          | `','`       | `','`, `';'` or `'\t'`                                                                                                                                                                                                          |
| `header`             | `true`      | A first line with the column labels                                                                                                                                                                                             |
| `bom`                | `true`      | A UTF-8 byte order mark at the start of a downloaded file, so Excel reads it as UTF-8; `exportCsv()` never adds it                                                                                                              |
| `neutralizeFormulas` | `true`      | [Formula neutralisation](#csv) (CSV injection)                                                                                                                                                                                  |

**Print** (`print` options; the image options too):

| Option         | Default       | What it does                                                                                                                                                                       |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paper`        | `'a4'`        | `'a4'`, `'a3'`, `'letter'`, `'legal'`, `'tabloid'`, or `{ width, height, unit: 'mm' \| 'in' }`                                                                                     |
| `orientation`  | `'landscape'` | `'landscape'`, `'portrait'` or `'auto'` (landscape when the drawing is wider than tall)                                                                                            |
| `margin`       | `10`          | Page margin in mm; twice the margin must stay under the paper's shorter side (a larger one keeps the default; a paper too small for the margin fails with a `RangeError`)          |
| `fit`          | `'width'`     | `'width'` = the whole width scaled to the page width (never enlarged, at least `minScale`), then pages across; `'page'` = everything on one page; `'none'` = actual size × `scale` |
| `scale`        | `1`           | Size with `fit: 'none'`                                                                                                                                                            |
| `minScale`     | `0.5`         | Smallest scale of `fit: 'width'`                                                                                                                                                   |
| `repeatHeader` | `true`        | The header tiers on every page                                                                                                                                                     |
| `repeatTable`  | `true`        | The task list on every column of pages (see [Print](#print))                                                                                                                       |
| `pageNumbers`  | `true`        | A footer "Title · Page n of N" (`labels.printPage`)                                                                                                                                |
| `maxPages`     | `200`         | More pages fail with a `RangeError`                                                                                                                                                |

#### Methods and events

| Method (Angular: on the component)                | Resolves                                                                                                                                                                    | Rejects                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `exportSvg(options?)` → `Promise<string>`         | The `<svg>` element as text (no XML declaration: ready to inline)                                                                                                           | Only in `<gantry-element>`: when its export code can't be loaded (below)                                                         |
| `exportCsv(options?)` → `Promise<string>`         | CSV text without the byte order mark                                                                                                                                        | Only in `<gantry-element>`: when its export code can't be loaded (below)                                                         |
| `exportPng(options?)` → `Promise<Blob>`           | An `image/png` Blob at `scale`, or the largest scale under it that fits the limits                                                                                          | `RangeError` when it fits only below scale 1 (use `exportSvg()`, `print()` or a `range`); `Error` when the browser can't draw it |
| `download(format, options?)` → `Promise<boolean>` | `true` once the file is handed to the browser; `false` when `before-export` vetoed it. `format` is `'svg'`, `'png'` or `'csv'`; `options` are that format's plus `fileName` | As `exportPng()` for a PNG                                                                                                       |
| `print(options?)` → `Promise<boolean>`            | `true` once the browser's `print()` returned; `false` when vetoed, or while another print of the chart runs                                                                 | `RangeError` over `maxPages`; `Error` when a page can't be drawn                                                                 |

`exportSvg()`, `exportCsv()` and `exportPng()` return data and fire no event. `download()` and `print()` fire
`before-export` before any work: call `detail.preventDefault()` there, synchronously, to cancel (the Web
Component's event is also cancelable: `event.preventDefault()`); the call then resolves `false` and nothing else
happens. Angular emits `(beforeExport)` inside the call; `<gantry-element>` (and React, Vue, Svelte) loads its export
code on the first export (a lazy chunk) and fires `before-export` once it has loaded, so code right after the call
runs first. Either way the file is the chart as it was at the call. Then the file is made and saved (a temporary
`<a download>` with an object URL, revoked after 30 s) or the pages are printed, and `export` reports it. A failure
rejects the promise and fires no `export`; in `<gantry-element>` every method also rejects when its export code can't
be loaded (offline after a new deploy, say), and the next call tries again. An export started from the toolbar never
rejects: its failure goes to the alert region (`labels.announceExportFailed('PNG image')`, "Couldn’t export the PNG
image"; a print: `labels.announcePrintFailed`, "Couldn’t print the chart") and the console. Every run is announced:
`labels.announceExportReady(fileName)` ("roadmap.svg is ready"), `labels.announcePrintReady(pages)` ("Printing 3
pages"). Under a Content Security Policy, `exportPng()`, `download('png')` and `print()` need `img-src blob:`
([CSP](#content-security-policy)).

| Event (Angular output · React / Svelte callback · Vue)                   | `detail`                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `before-export` · `(beforeExport)` · `onBeforeExport` · `@before-export` | `GanttBeforeExportEvent` — `{ format, trigger, fileName, defaultPrevented, preventDefault() }`; `fileName` has its extension, `null` for print |
| `export` · `(export)` · `onExport` · `@export`                           | `GanttExportEvent` — `{ format, trigger, fileName, size, pages }`: `size` in bytes for a file, `pages` for a print (the other `null`)          |

`format` is `'svg' | 'png' | 'csv' | 'print'`, `trigger` `'toolbar' | 'api'`. The methods are on the element, so each
binding reaches them through its ref:

| Binding       | Call                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| Web Component | `await chart.download('svg')`                                                            |
| Angular       | `chart = viewChild.required(GantryComponent)`, then `await this.chart().download('svg')` |
| React         | `const chart = useRef<GantryElement>(null)`, then `await chart.current?.download('svg')` |
| Vue           | `<Gantry ref="chart">`, then `await chart.value?.element?.download('svg')`               |
| Svelte        | `<Gantry bind:element={chart}>`, then `await chart?.download('svg')`                     |

```ts
// Web Component: upload the SVG the toolbar would download
chart.addEventListener('before-export', e => {
  if (e.detail.format !== 'svg') return;
  e.preventDefault(); // synchronously; or e.detail.preventDefault()
  void chart.exportSvg().then(upload);
});
chart.addEventListener('export', e => console.log(e.detail.fileName, e.detail.size));
```

```html
<!-- Angular -->
<gantry
  [series]="tasks"
  [options]="{ toolbar: { export: true } }"
  (beforeExport)="$event.format === 'png' && $event.preventDefault()"
  (export)="log($event)"
/>
```

```tsx
// React (Svelte: the same callback props; Vue: @before-export / @export)
<Gantry
  ref={chart}
  tasks={tasks}
  options={{ toolbar: { export: true } }}
  onBeforeExport={d => {
    if (d.format === 'png') d.preventDefault();
  }}
  onExport={d => log(d)}
/>
```

#### What an export draws

- **Images** (SVG, PNG, print) draw the view as a document: **every shown row** (collapse state and sort kept, none
  left out by scrolling or virtualisation), the header tiers and the marker lane, row colours, non-working time (the
  hatch as a `<pattern>`), grid lines, annotations, the today line and pointer, dependency arrows (critical ones too),
  bars with their progress, labels, baselines, summary caps, rollup segments and critical tone, and the legend strip.
  Never the selection, hover, focus ring, grips, link connectors, previews, the drag ghost or readout, the tooltip,
  an open cell editor, the toolbar, the splitter or scrollbars. An empty chart draws the header and
  `labels.emptyState`. With a `range`, the bars it doesn't reach are left out (no custom bar is rendered for them);
  links to them are still drawn.
- **Collapsed rows** are left out of images, as on screen: call `expandAll()` first, or (headless)
  `createExportSource({ …, collapsedIds: [] })`. A CSV has them by default (`rows: 'all'`).
- **Theme.** Every colour is resolved for the export's palette: the file has presentation attributes (`fill`,
  `stroke`, `font-*`) only — no `var(`, no `<style>`, no styling classes, no `foreignObject`, no script — so it opens
  as drawn in Illustrator, Inkscape, Office and an `<img>`; nothing in it is loaded from elsewhere. The header's
  current-period tint becomes the today colour at 14 % opacity.
- **The SVG** is `role="img"` with `<title>` and `<desc>` (`aria-labelledby`) and `lang` (the locale), every text a
  real `<text>` (searchable, selectable; a cut task-list cell keeps its full text in a `<title>`), `data-task-id` on
  rows and bars, the painters' class names (`gantt-bar`, `g-tier`…) for post-processing and numbers rounded to 2
  decimals. A downloaded `.svg` starts with the XML declaration; `exportSvg()` returns the `<svg>` element alone.
- **A data source** exports the tasks loaded so far.

#### Custom bars in exports

- **Web Component, React, Vue, Svelte**: while `renderBar` is set, the export calls `renderBar(ctx, renderDefault)`
  for every row; `null` or `undefined` draws the built-in bar, a node (a decorated `renderDefault()` too) is
  serialized into the file.
- **Angular**: each row whose bar type resolves to a component other than the built-in ones (a subclass of a built-in
  bar counts as custom; a built-in component reused for another `barType` doesn't) is rendered off-screen once,
  serialized and destroyed. On the server custom bars are drawn as built-in bars.
- `ctx.theme` and `ctx.visual` are the export's (its palette, paints resolved), and the bar is never selected or
  draggable. The markup keeps SVG drawing elements only (shapes, text, gradients, patterns, filters, `a`, `use`,
  `image`): `script`, `style`, `foreignObject`, animations (`set`, `animate`…), `metadata`, HTML and other namespaces
  are dropped with their content, and so are `on*`, `tabindex` and `autofocus` attributes, `javascript:`,
  `vbscript:` and `data:` URLs (character references decoded; `data:image/png`, `jpeg`, `gif` and `webp` stay), any
  `href` but a `#fragment` or such an image, and any `url(…)` but `url(#…)` (a `style` keeps its other
  declarations): an export never loads anything from elsewhere. Then `var(--gantt-*)` is resolved with the export's
  theme (values escaped). Headless markup (`createExportSource({ customBar })`) follows the same rules
  (`sanitizeSvgMarkup` in `@gantryjs/core`).
- Only attributes and inline styles travel: classes and stylesheet rules (page CSS, `::part()`, an Angular
  component's `styles`) don't. Paint custom bars with attributes (a `fill` from
  `resolvePaint(ctx.visual.paint.body, ctx.theme)`, `[attr.fill]` in an Angular template), or export them as built-in
  bars with `customBars: 'builtin'` (also the way out for an Angular bar that measures the DOM or must be attached to
  render).

#### CSV

RFC 4180: `\r\n` between records (none after the last), fields that hold the delimiter, `"`, CR or LF quoted, `"`
doubled. Values per column (`values`; a column's `exportValue(row, ctx)` wins in both modes):

| Column                                         | `'data'` (default)                                                                               | `'display'`     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| `id`, `name`                                   | the text                                                                                         | the cell text   |
| `start`, `end`, `baselineStart`, `baselineEnd` | local ISO: `2026-03-02` at midnight, else `2026-03-02T09:30` (`:ss` when not zero)               | the cell text   |
| `duration`                                     | days of the drawn span, a number (`.` decimal, at most 2 decimals); working days with a calendar | the cell text   |
| `progress`                                     | 0–100, a number                                                                                  | `45%`           |
| `predecessors`                                 | ids: `research FS+2d; scope SS` (lags in working units with a calendar)                          | names, as shown |
| `status`, `type`                               | the key (`inProgress`, `milestone`; a custom status as it is)                                    | the label       |
| `variance`                                     | signed days, a number (working days with a calendar)                                             | the cell text   |
| your columns                                   | `render` text, else `task[key]` or `task.data[key]` (a date as local ISO, an object as JSON)     | the cell text   |
| a raw task field (no column has the key)       | the field as the chart holds it, under the key (below)                                           | the same        |

**Raw task fields.** A key of `columns` that no column has but that is a task field — `parentId`, `dependency`,
`collapsed`, `barType`, `status`, `editable`, `draggable`, `barColor`, `rowColor`, `textColor`, `progressColor`,
`className` (and `id`, `name`, `start`, `end`, `progress`, `type` when a column doesn't take them) — exports the field
as the chart holds it, with the key as its header, in both `values` modes: a date as local ISO, a number or boolean as
it is, `dependency` as predecessor ids (`research FS+2d; scope SS`, what the Predecessors cell reads back), an unset
field empty. So `exportCsv({ columns: ['id', 'name', 'parentId', 'start', 'end', 'dependency'] })` carries the tree
and the links. Objects (`baseline`, `style`, `data`) are not fields here.

**Formula neutralisation** (`neutralizeFormulas`, OWASP CSV injection): a cell — header cells included — that starts
with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`, unless it is a plain number (`-3`, `+2.5`, `1e3`), so a
spreadsheet shows `=HYPERLINK(…)` as text instead of running it. It is applied before quoting.

#### Print

`print()` paginates the drawing in core and prints it through a hidden `about:blank` frame built with DOM APIs (no
`srcdoc`, no HTML parsing: Trusted Types safe): each page is an `<img>` of an SVG page (`alt` = title and page), the
`@page` size and margin a constructable stylesheet, the footer real text; the document's title is `title` and its
`lang` the locale. It waits for every image, calls the frame's `print()`, then removes the frame on `afterprint` (or
after 60 s). Focus never moves into the frame.

- **Fit.** `'width'` scales the whole width to the page width, never above 1 and not below `minScale`, then adds pages
  across; `'page'` fits everything on one page (never enlarged); `'none'` prints at `scale`. The task list is never
  cut: the scale is lowered until it fits a page's width.
- **Breaks.** Pages break only between rows (a row taller than a page gets a page of its own); a horizontal break
  moves back to a bottom-tier cell boundary when that keeps at least half the page. Pages run down, then across, at
  96 px per inch.
- **Repeats.** `repeatHeader` draws the header on every page (without it, only the first page of each column has it).
  `repeatTable` draws the task list on every column of pages, but only while it takes at most half of the page's
  width: a wider task list is printed on the first column of pages only, and "Repeat task list" then changes nothing.
- The legend goes on the last page of the first column (on a page of its own when it doesn't fit), wrapped at that
  page's width. `pageNumbers` reserves a 24 px footer. Over `maxPages` the print fails with a `RangeError` ("The
  print would take N pages, more than maxPages (M)…"): use `fit: 'page'`, a `range` or a larger `maxPages`. A margin
  that leaves no room on the paper (twice the margin at least its shorter side) fails with a `RangeError` too.
- **Ctrl+P** prints the page as it is. Both bindings carry `@media print` rules: no toolbar, splitter, load-more
  footer, live regions, tooltip, readout, bar overlay, row hover or previews, exact colours, no scrollbars. But the
  chart is virtualised, so only the mounted rows print: `print()` prints every row. Your own print rules reach the
  Angular chart's light DOM (`gantry .gantt-…`); the Web Component's inner boxes need `gantry-element::part(…)`.

#### On the server and in Node

The export functions are pure core functions: they run in Node, workers and SSR with no DOM.
`createExportSource({ tasks, options })` builds the chart snapshot a binding would build (the same rows pipeline,
columns, styles, rollups and critical path), so the same input gives the same file:

```ts
import { writeFileSync } from 'node:fs';
import { createExportSource, exportChartCsv, exportChartPages, exportChartSvg, exportFileText } from '@gantryjs/core';

const source = createExportSource({
  tasks,
  options: { viewMode: 'Week', labels: { ariaChart: 'Roadmap' } },
  now: new Date(2026, 0, 15), // the today line (default: the current time)
  collapsedIds: [], // every row expanded (default: task.collapsed)
});
writeFileSync('roadmap.svg', exportFileText('svg', exportChartSvg(source, { theme: 'light' }))); // + XML declaration
writeFileSync('roadmap.csv', exportFileText('csv', exportChartCsv(source), { bom: true })); // + byte order mark
const { pages } = exportChartPages(source, { paper: 'letter' }); // one SVG per printed page
```

`createExportSource` also takes `columns`, `annotations`, `dark`, `sort` (`{ key, dir }`), `view`, `panelWidth`,
`showLegend` and `customBar` (a function of the bar's context returning SVG markup, or `null` for the built-in bar).
A PNG needs a canvas: in Node, turn the SVG into one with your own tool. In Angular, `exportSvg()` and `exportCsv()`
also work during server rendering (custom bars drawn as built-in), while `exportPng()`, `download()` and `print()`
reject with `Error('Gantry: download() needs a browser')` before `beforeExport`. The React, Vue and Svelte wrappers
render an empty `<gantry-element>` on the server: export there with core.

#### Limitations

- **Web fonts are not embedded.** The SVG names the theme's `fontFamily`; a PNG and a print draw the SVG as an image,
  which can't load web fonts, so the system's fallback font is used. End `fontFamily` with a generic family
  (`'Inter, system-ui, sans-serif'`).
- **Text is estimated.** With no DOM to measure, an export may cut a label with an ellipsis slightly differently
  from the screen.
- **Printing from a frame**: iOS Safari may print the whole page instead of the chart; Firefox's `print()` may return
  before its dialog closes, so `print()` resolves early and a preview left open for more than 60 s loses its pages.
  Chromium is tested end to end.
- **Ctrl+P** prints the mounted rows only; `print()` prints every row.
- **A data source** exports only the tasks loaded so far.
- **A PNG** is one image per call (no tiles): a plan larger than the canvas limits fails with a `RangeError` —
  export an SVG, print it, or pass a `range`.

### Dates, locales and format tokens

Everything user-facing is translatable. Dates are formatted with the platform's `Intl` API from a
BCP 47 locale and a dayjs-compatible pattern: no locale files to import, no runtime dependency.

```ts
options = {
  locale: 'it', // month and day names → Italian
  formats: { dateFormat: 'D MMM YYYY', readoutFormat: 'ddd D MMM' }, // columns and tooltip · drag readout
  labels: { todayButton: 'Oggi', more: 'Altro' }, // any subset: the rest stays English
};
```

- `locale`: any BCP 47 tag (`'it'`, `'de-CH'`, `'pt-BR'`, `'ja'`); unknown or malformed tags fall
  back to `'en'`, the default (deterministic output on every machine). The dayjs global locale is
  not read.
- Format tokens: `YYYY YY` · `M MM MMM MMMM` · `Q` · `D DD Do` · `d dd ddd dddd` · `H HH h hh` ·
  `m mm` · `s ss` · `A a` · `W WW` (week number, see [Week numbering](#week-numbering)) ·
  `[literal text]`. Names come from `Intl` (CLDR), so a few abbreviations differ slightly from
  dayjs's locale files (German `Mär`).
- `labels: Partial<GanttLabels>` overrides any UI string (buttons, tooltip, legend, header
  prefixes `W` / `Q` / `H`, duration text, column headers, aria-labels).
- `formats.dateFormat` formats the columns and the tooltip; `formats.header` overrides the header
  labels per zoom level; `formats.readoutFormat` formats the dates of the drag readout (default
  `'D MMM'`, with the time on hour scales).
- Angular also takes defaults for every chart below an injector level, see
  [Internationalisation & date formats](#internationalisation--date-formats).

**Time zones.**

- `new Date('2026-01-05')` (UTC midnight) is read as **that calendar day in local time**
  (`normalizeDateOnly: true`), so bars line up with day cells in every time zone; `parseDate()` helps too.
  A `Date` can't say whether it was meant as a day or as an instant, so a time that happens to fall on
  UTC midnight (17:00 in Los Angeles or 20:00 in New York in summer) is read as that day too: for plans
  with hours west of UTC pass strings with a time (`'2026-01-05T17:00'`) or set `normalizeDateOnly: false`.
- The x axis follows local calendar days, so daylight-saving changes never shift bars.
- `endDateMode: 'inclusive'` makes a date-only `end` cover that whole day (default `'exclusive'`).

### Theming

Colours, font and radius come from the theme (`options.theme`, `setTheme()`, `patchTheme()`,
light/dark/auto). The theme reaches the pixels only through CSS custom properties:

| Variable                           | Theme key          |     | Variable                                | Theme key                     |
| ---------------------------------- | ------------------ | --- | --------------------------------------- | ----------------------------- |
| `--gantt-bg`                       | `backgroundColor`  |     | `--gantt-grid-line`                     | `gridLine`                    |
| `--gantt-header-bg`                | `headerBackground` |     | `--gantt-grid-line-major`               | `gridLineMajor`               |
| `--gantt-bar`                      | `barColor`         |     | `--gantt-today`                         | `todayColor`                  |
| `--gantt-bar-radius`               | `barRadius`        |     | `--gantt-weekend-bg`                    | `weekendBg`                   |
| `--gantt-milestone`                | `milestoneColor`   |     | `--gantt-holiday-bg`                    | `holidayBg`                   |
| `--gantt-critical`                 | `criticalColor`    |     | `--gantt-off-hours-bg`                  | `offHoursBg`                  |
| `--gantt-arrow`                    | `arrowColor`       |     | `--gantt-intensive-bg`                  | `intensiveBg`                 |
| `--gantt-text` / `-sec` / `-muted` | text colours       |     | `--gantt-sel-bg` / `--gantt-sel-border` | selection                     |
| `--gantt-progress-overlay`         | `progressOverlay`  |     | `--gantt-today-label`                   | derived: current-period label |
| `--gantt-focus-ring`               | `focusRing`        |     | `--gantt-tooltip-bg` / `-bdr` / `-txt`  | tooltip                       |
| `--gantt-row-hover-bg`             | `rowHoverBg`       |     |                                         |                               |

- **Focus rings.** Every keyboard focus ring — toolbar controls, task-list rows, cells and header
  cells, the splitter and its toggle, the timeline viewport and the focused bar — is drawn in
  `--gantt-focus-ring` (theme key `focusRing`: `#2563EB` light, `#60A5FA` dark, `#3B82F6` in
  `LegacyLightTheme`; the values of `selectionBorder`, so the default look is unchanged).
  `--gantt-sel-border` stays the outline of the selected bar and row and the splitter / column
  resize hover.
- **Milestones.** The light theme's `milestoneColor` is `#7C3AED` (a white label reads 5.7:1 on
  it); `LegacyLightTheme` keeps the 1.x `#8B5CF6`.
- **Paints.** Every colour of the render model is a `Paint`: a theme token such as
  `var(--gantt-bar)`, or an explicit colour (`task.barColor`, a holiday `color`, `arrows.color`…)
  passed through as is. Both bindings apply paints as CSS properties (`style.fill`, never a
  presentation attribute), so a value like `'red;background:url(x)'` can't inject CSS.
- **Where the tokens live.** The Web Component writes them into a `:host` stylesheet in its
  shadow root, so page CSS on the element overrides them and a string `style` attribute no
  longer wipes them. Angular binds them as an inline `[style]` map on the `<gantry>` host (page
  CSS needs `!important` there; prefer `setTheme()` or a template `[style]` binding, see
  [Angular theming](#theming-1)).

  ```css
  gantry-element {
    --gantt-bar: #6366f1;
    --gantt-bar-text-on-bar: #ffffff; /* keep the label readable on the new fill */
  }
  ```

- **Contrast tokens.** Labels inside theme-coloured bars use three derived tokens:
  `--gantt-bar-text-on-bar`, `--gantt-bar-text-on-milestone` and `--gantt-bar-text-on-critical`,
  each `readableOn(fill, barTextColor)` (white or near-black when `barTextColor` is unreadable on
  the fill). The current-period header label uses a fourth, `--gantt-today-label`
  (`todayLabelColor(theme)`): `todayColor` when it reaches 4.5:1 on the 14 % today tint over
  `headerBackground`, else `todayColor` mixed towards `textPrimary` until it does (`#964B13` in
  the light theme; the dark theme keeps `#FBBF24`). `setTheme()` / `patchTheme()` recompute them;
  a page-CSS override of `--gantt-bar`, `--gantt-milestone`, `--gantt-critical` or `--gantt-today`
  must also set the matching token. Labels on an explicit `task.barColor` get a concrete readable
  colour; `task.textColor` and `bar.label.color` always win.
- **Row hover.** The row under a mouse or pen pointer is tinted in both panes with `--gantt-row-hover-bg`
  (theme key `rowHoverBg`: `rgba(15, 23, 42, 0.04)` light, `rgba(148, 163, 184, 0.08)` dark;
  `transparent` turns it off). It clears on leave, scroll and drag start, and is hidden in forced colours.
- **Progress overlay.** Bars without `task.progressColor` / `bar.progress.color` darken their
  progress part with `--gantt-progress-overlay` (theme key `progressOverlay`, `#000000`) at
  `bar.progress.opacity`.
- **Metrics.** `barRadius` (the default `bar.radius`), `fontSize` (bar labels use `fontSize − 1`)
  and `barTextColor` shape the layout, so change them through the theme API, not page CSS:
  `themeMetrics(theme)` returns them and `resolveConfig(options, i18n, themeMetrics(theme))`
  reads them. The resolved config holds no colours, so a colour-only theme change leaves the
  layout as it is.
- **Every token.** All 44 custom properties (the 40 theme keys and the four derived tokens) are
  listed in the Angular [token map](#theming-1) and the Web Component's [CSS custom
  properties][wc-css].
- **Custom renderers.** `ctx.visual.paint.{body,progress,label}` may be `var()` strings: apply
  them as style properties (`el.style.setProperty('fill', paint)`), or get a concrete colour with
  `resolvePaint(paint, ctx.theme)` (`ctx.theme` is the chart's resolved theme). `themeToCss(theme)`
  lists every custom property a theme writes, the contrast tokens included.

### Read-only CSS variables

The chart publishes its layout as custom properties on its host, to size your own overlays or
cells against it. They are outputs: set `rowHeight`, `bar.height` and `density` through the options.

| Hook                 | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| `--gantt-row-height` | the resolved row height (`36px` by default)                      |
| `--gantt-bar-height` | the resolved bar height (`21.6px` by default)                    |
| `data-density`       | `compact` · `normal` · `comfortable`                             |
| `data-narrow`        | present while the chart is narrower than `responsive.breakpoint` |

On the Web Component the two variables live in the host's theme sheet and `data-density` /
`data-narrow` on the `wrapper` part (inside the shadow root, so page CSS can't select them: use
the variables, or the `density` and `responsive` options). On Angular all four are on the
`<gantry>` host, together with `--gantry-control-size` (the toolbar's control size).

### Styling hooks across bindings

| Hook         | Web Component `<gantry-element>`                                                 | Angular `<gantry>`                            |
| ------------ | -------------------------------------------------------------------------------- | --------------------------------------------- |
| Theme tokens | `--gantt-*` on the element (page CSS wins)                                       | `--gantt-*` in `[style]` (needs `!important`) |
| Inner boxes  | `::part(wrapper \| toolbar \| panel \| splitter \| timeline \| legend \| state)` | the `.gantt-*` classes (light DOM)            |
| Dark theme   | `:state(dark)`                                                                   | class `gantry-dark`                           |
| Bar dragged  | `:state(dragging)`                                                               | class `gantry-dragging`                       |
| Loading      | `:state(loading)`                                                                | class `gantry-loading`                        |
| Link drawn   | `:state(linking)`                                                                | class `gantry-linking`                        |

React, Vue and Svelte render a `<gantry-element>`, so they use the Web Component column.

### Content Security Policy

- **Web Component**: works under `style-src 'self'; script-src 'self'; require-trusted-types-for
'script'` with no `'unsafe-inline'` or `'unsafe-eval'`. The shadow tree is built node by node
  (no `innerHTML`), the CSS is one constructable stylesheet shared by every instance plus a theme
  sheet per instance, and every style is a CSSOM write. A strict `style-src` needs constructable
  stylesheets (Chromium 73+, Firefox 101+, Safari 16.4+); there is no nonce option. Details in
  its [README][wc-csp].
- **Angular**: the chart binds styles through the CSSOM (`[style]` maps, never `style=""` strings
  or HTML parsing), so it adds no inline-style requirement of its own. Angular puts the component
  styles in `<style>` elements: give them the nonce with `ngCspNonce` on the root element or the
  `CSP_NONCE` token (`providers: [{ provide: CSP_NONCE, useValue: nonce }]`).
- React, Vue and Svelte inherit the Web Component's policy.
- **[Exports](#export-and-print)** (every binding): `exportPng()`, `download('png')` and `print()` draw the SVG from
  a `blob:` URL, so they need `img-src blob:` (`data:` is not needed); SVG and CSV downloads need nothing. No Trusted
  Types sink is used (no `innerHTML`, `srcdoc` or `DOMParser`), and the print frame's CSS is a constructable
  stylesheet. The Web Component loads its export code on the first export (`import()` of a chunk next to the
  element's), so `script-src` must allow where the element is served from.

### Server-side rendering (all bindings)

- **Angular**: SSR-safe, the HTML has the rows, bars, theme tokens and the `region` role (see
  [Server-side rendering](#server-side-rendering)).
- **React, Vue, Svelte**: `renderToString` / streaming emit the `<gantry-element>` tag with your
  class, style and children and touch no DOM API; the chart renders once the element is defined
  and the component hydrates. Reserve the box until then:

  ```css
  gantry-element:not(:defined) {
    display: block;
    width: 100%;
    height: 100%;
  }
  ```

- **Web Component alone**: importing `@gantryjs/vanilla` on the server is safe (the module top level
  guards `document` / `HTMLElement`); the chart paints in the browser.
- **Exports in Node**: `createExportSource()` with `exportChartSvg()`, `exportChartCsv()` or `exportChartPages()`
  from `@gantryjs/core` (see [On the server and in Node](#on-the-server-and-in-node)).

### Examples gallery

Thirty-two runnable cases (styles, rollup, synced charts, responsive layouts, theming, lazy loading, editing, export
and print, working calendars…),
each in **all five** frameworks with the same controls and a code tab. A "Known differences"
section on the Frameworks page lists what a framework does differently.

- Angular (the site): `/examples`
- Web Component: `/wc/examples.html`
- React: `/react/#/examples` · Vue: `/vue/#/examples` · Svelte: `/svelte/#/examples`

### Keyboard and focus

```ts
options = {
  keyboard: { characterShortcuts: true }, // false turns off + − T F (WCAG 2.1.4)
};
```

The chart's host is never a tab stop itself (the Web Component's shadow root delegates focus,
so `el.focus()` focuses the first stop inside). <kbd>Tab</kbd> moves through, in order:

1. the **toolbar**: one tab stop, the arrow keys move between its controls;
2. the **task list** (`role="treegrid"`): one tab stop (`tabindex="0"`) — the header cell or
   cell focused last, else the focused row, else the row focused last while it is mounted, else
   the first row in view, else (no rows: loading, empty, a failed first page) the first header
   cell. Every other row, cell and header cell, the collapse toggles and the sortable headers
   have `tabindex="-1"`;
3. the **splitter** (`.gantry-splitter-handle`, `role="separator"`), then its collapse toggle;
4. the **bars**: one tab stop — the bar of the focused row (in either pane), else the bar
   focused last while it is mounted, else the first bar in view. The timeline viewport
   (`role="group"`) is a tab stop only while no bar is mounted; its arrow keys then scroll it.

A focused row or bar stays mounted while it scrolls out of view (`.gantt-tl-row--pinned`), so
focus survives scrolling, and both panes' tab stops follow the row that last had focus. Every
stop shows a ring in `--gantt-focus-ring` on keyboard focus (the bar's is drawn around it in
`g.gantt-bar-overlay`, with its resize grips), never hidden under the sticky header: the task
list has `scroll-padding-top` = the header height, and the timeline adds the reach of a bar's
ring on every side (core `timelineScrollPadding`), so a focused bar lands with its whole ring in
view. When the focused control disappears (its row was removed or collapsed away), focus moves
to the bars' tab stop (the viewport while no bar is mounted; in the table view, the task list's
tab-stop row; while a state box covers the body, its Retry, else the toolbar). Pressing a draggable bar with the
mouse focuses the timeline viewport, so <kbd>Escape</kbd> cancels the drag.

| Focus on       | Key                                                         | Action                                                                                                                            |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar        | `←` / `→` (wrapping), `Home` / `End`                        | Move between the controls                                                                                                         |
|                | `Enter` / `Space`                                           | Press the button, check the radio                                                                                                 |
| Task-list row  | `↑` / `↓`                                                   | Previous / next row (the header row is above the first row)                                                                       |
|                | `PgUp` / `PgDn` · `Home` / `End`                            | One page up / down · first / last row                                                                                             |
|                | `→`                                                         | Collapsed group: expand it; otherwise move into the row's first cell                                                              |
|                | `←`                                                         | Expanded group: collapse it; otherwise go to the parent row                                                                       |
|                | `Enter`                                                     | Select only this row and fire `row-click`                                                                                         |
|                | `Space` · `Shift+Space` · `Ctrl/⌘+Space`                    | Select (toggles with `multiSelect`) · extend the range · toggle                                                                   |
| Task-list cell | `←` / `→`                                                   | Previous / next cell; `←` on the first cell goes back to the row                                                                  |
|                | `↑` / `↓` · `PgUp` / `PgDn`                                 | Same column, other row                                                                                                            |
|                | `Home` / `End` · `Ctrl/⌘+Home` / `End`                      | First / last cell · same column, first / last row                                                                                 |
|                | `Enter`, `Space`                                            | As on the row (a button or link inside a cell keeps them)                                                                         |
| Header cell    | `←` / `→` · `↓`                                             | Previous / next header cell · the first row, same column                                                                          |
|                | `Enter` / `Space`                                           | Sort by the column                                                                                                                |
| Bar            | `↑` / `↓` · `PgUp` / `PgDn` · `Home` / `End` (`Ctrl/⌘` too) | Focus the bar of the previous / next row, one page away, the first / last row (scrolled into view)                                |
|                | `←` / `→`                                                   | Pan the timeline by one bottom-tier header cell                                                                                   |
|                | `Space` · `Shift+Space` · `Ctrl/⌘+Space`                    | As in the task list                                                                                                               |
|                | `Enter` / `F2`                                              | **Move mode** on a bar that can move, resize or change progress; otherwise select only this row and fire `row-click`              |
|                | `L`                                                         | With `editing.dependencies`: start a [link](#links) from this bar; `Enter` / `L` on another bar creates it, `Escape` cancels      |
| Move mode      | `←` / `→`                                                   | Move the bar one unit earlier / later (a day; an hour on hour scales; a working day with a [working calendar](#working-calendar)) |
|                | `↑` / `↓`                                                   | With `editing.progress`: progress up / down by `step` %                                                                           |
|                | `Shift+←` / `→` · `Alt+←` / `→`                             | Resize the end · the start (task bars, with `enableResize`)                                                                       |
|                | `Enter` / `F2`                                              | Commit: `task-dragged` / `task-resized` / `task-progress-changed` as after a pointer drop, then the change is announced           |
|                | `Escape`, `Tab`, leaving the bar, a pointer press           | Cancel (announced)                                                                                                                |
| Task-list cell | `F2` · `Enter` · a character                                | With `editing.cells`: open the [cell's editor](#cells) (a character starts the text)                                              |
| Cell editor    | `Enter` · `Tab` / `Shift+Tab` · `Escape`                    | Commit · commit and edit the next / previous cell · cancel                                                                        |
| Selected arrow | `Delete` / `Backspace` · `Escape`                           | Remove the link · deselect it                                                                                                     |
| Splitter       | `←` / `→` · `Enter` / `Space`                               | Resize the panel · collapse / expand it                                                                                           |
| Anywhere       | `Escape`                                                    | Cancel move mode, a drag, a link or a cell edit, else close the tooltip, else clear the selection                                 |
|                | `Ctrl/⌘+Z` · `Ctrl/⌘+Shift+Z` / `Ctrl+Y`                    | With an [editing history](#history): undo · redo (not in text entry or move mode)                                                 |
|                | `Ctrl/⌘+A` (also with `Shift`)                              | Select all visible rows                                                                                                           |
|                | `+` (or `=`) · `-` · `T` · `F`                              | Zoom in · zoom out · scroll to today · [fit to screen](#zoom) — off with `characterShortcuts: false`                              |

- Move mode works like a pointer drag: the same snapping and minimum length, the drag ghost, the
  readout chip with the new dates, and an announcement of each step; a movable bar is one with
  `enableDrag` on, not `task.draggable: false` or `editable: false`, and its dates not rolled up. With
  `editing.progress`, `↑` / `↓` change the progress too, and the key help says so. While it is on, other plain keys do nothing.
- Shortcuts never fire while typing in an input, a select or a `contenteditable` cell, nor with
  `Alt` / `AltGr` held, nor inside an open cell editor; keys the chart doesn't use keep their browser
  default. `L`, `Delete` and `Ctrl/⌘+Z` / `Y` act only when their [editing](#editing) feature is on, and keep
  their default action otherwise.
- In a right-to-left layout the toolbar's `←` and `→` swap meaning.

### Touch and pointer

- **Mouse.** A press on a bar becomes a drag once the pointer has moved 3 px; a smaller move is
  a click, which selects the row. The cursor follows the part of the bar under the pointer:
  `grab` on a draggable bar's body, `ew-resize` on its handles, `grabbing` while it moves.
- **Touch and pen.** A press held still for 350 ms (within 8 px) picks the bar up; moving
  earlier scrolls the timeline as usual (`touch-action: pan-x pan-y` on the canvas), and a tap
  toggles the bar's tooltip. While a bar is dragged the page doesn't pan, and the long-press
  menu and text selection are off. A second finger cancels a press that hasn't become a drag.
- **Auto-scroll.** Dragging a bar within 32 px of the timeline viewport's left or right edge
  scrolls it (up to 18 px a frame), and the bar keeps following the pointer.
- **Resize handles.** Every resizable task bar at least 12 px wide has a pointer target at each
  end, `bar.handles.hitSize` px wide (default 24, the WCAG 2.5.8 target size), centred on the
  edge: it reaches at most a third of the bar inward, stays inside the row, and the two never
  overlap. Their grips show on the bar under a mouse or pen, on the keyboard-focused bar and, on
  touch screens, on the selected bars. Milestones are hit 3 px around their shape, summary bars
  down to their end caps.
- **Progress grip and connectors** (with [`editing`](#editing)). The hovered bar, the keyboard-focused bar and, on
  touch screens, the selected bars also show a progress grip (`rect.gantt-progress-grip`) and a link connector at each end
  (`rect.gantt-link-connector`); every target is at least 24 px both ways and stays inside its row. Drag the grip to
  change the progress (a live fill, snapped to `editing.progress.step`, one undo step on release), drag from a connector
  to another bar to link them, or tap a connector and then the target. A click on a dependency arrow selects it. The
  cursor follows the part: `ew-resize` on the grip, `crosshair` on a connector and while linking, `pointer` over an arrow.
  Grips and connectors are hit only where they show, so a press inside a narrow bar still moves it.
- **Cancel.** `Escape`, `pointercancel` and removing the chart cancel a drag: the bar goes back,
  and the click that ends it selects nothing.
- Both bindings hit-test bars by geometry (core `hitTestBar` on the row under the pointer), so a
  custom bar is hit by its visual box.

### Zoom

- **Ctrl/⌘ + wheel** over the timeline, and a **trackpad pinch** (browsers send it as a wheel
  with Ctrl): one zoom level per 100 px of scrolling. The plain wheel still scrolls, and over the
  task list Ctrl/⌘ + wheel is left to the browser (page zoom).
- **Two-finger pinch** on a touch screen: one level per ×1.25 of finger spread, around the
  fingers' midpoint. Safari's gesture events (its trackpad pinch, iOS) zoom the same way.
- Gestures keep the date under the pointer in place; the toolbar, the `+` / `-` keys and
  `zoomIn()` / `zoomOut()` / `setViewMode()` keep the centre. Nothing zooms while a bar is being
  moved. Every level change fires `view-mode-change` / `viewModeChange` and is announced
  (`labels.announceZoom`: "Zoom: Week").
- **Fit to screen**: the toolbar's Fit button (`toolbar.fit`), the `F` key and `fitToScreen()`
  switch to the finest of the `zoomLevels` at which every task fits the viewport (with a 32 px
  margin; the coarsest level when none does), then scroll the earliest task near the left edge.
  Nothing happens without tasks or before the chart is laid out.

### Screen readers

- The host is a `region` landmark named by `labels.ariaChart` (the Web Component through
  `ElementInternals`, with `role` / `aria-label` host attributes as the fallback; Angular with
  host attributes), `aria-busy` while the chart loads.
- The task list is a `treegrid` named by `labels.ariaTaskList` (`aria-multiselectable` with
  multiple selection, `aria-colcount`): the header row is `aria-rowindex="1"`; rows carry
  `aria-rowindex`, `aria-level`, `aria-posinset` / `aria-setsize` (their place among their
  siblings), `aria-selected` and, for groups, `aria-expanded`; cells and header cells
  `aria-colindex`.
- The timeline `<svg>` is a `listbox` named by `labels.ariaBars` ("Task bars";
  `aria-multiselectable`, `aria-orientation="vertical"`). Every bar, custom ones included, is an
  `option` named by `taskAccessibleName()` (name, type, dates, progress, critical path,
  baseline), with the `aria-roledescription` `labels.ariaTask`, `ariaMilestone`, `ariaGroup` or,
  for a custom `barType`, `ariaBarRole` ("task bar", "milestone", "summary bar", "bar"),
  `aria-selected`, and `aria-posinset` / `aria-setsize` counting all visible rows ("3 of 40").
  While its tooltip shows, the bar is `aria-describedby` it.
- The toolbar is a `toolbar` (`labels.ariaToolbar`); its zoom levels and views are
  `radiogroup`s of `radio`s with `aria-checked`. The splitter is a `separator` with
  `aria-valuenow` (the panel width in px), `aria-valuemin` (0 when the panel is collapsible, else
  `panel.minWidth`) and `aria-valuemax` (the widest panel it allows), next to its collapse toggle
  (`labels.showPanel` / `hidePanel`).
- A polite live region (`.gantt-sr-live`, `role="status"`) announces changes of the number of
  selected tasks, the data source's loading (`labels.loading`, then `announceLoaded(n)` /
  `allLoaded(n)`), zoom levels, expanding and collapsing from the keyboard, and move mode (its
  key help, each step, the commit or the cancel). Announcements are **debounced**: 250 ms after
  the last change only the last message is read, and a repeated message is read again. Errors go
  to `.gantt-sr-alert` (`role="alert"`) at once — once: while the error state's box (itself
  `role="alert"`) shows, that region stays empty. Every text is a `labels` entry
  (`announceSelection`, `announceZoom`, `announceExpanded`, `announceEditStart`, …).
- With [`editing`](#editing), every applied change is announced in words ("Design moved 2 days later", "Linked Research
  to Build"), and so are a rejected or vetoed one (`announceChangeRejected`), undo and redo (`announceUndo` /
  `announceRedo`), a link started, selected or deleted, and a cell edit's invalid value (the alert region). Task-list cells
  carry `aria-readonly` while cells are editable; the cell editor is named by `labels.ariaCellEditor(column, task)`,
  `aria-invalid` and `aria-describedby` its message.
- [Exports](#export-and-print): a download is announced (`labels.announceExportReady`, "roadmap.svg is ready"), and so
  is a print (`announcePrintReady`, "Printing 3 pages"); a failed export from the toolbar goes to the alert region
  (`announceExportFailed`, or `announcePrintFailed` for a print). The Export button is a menu button (`aria-haspopup="menu"`, `aria-expanded`), its menu a
  `menu` of `menuitem`s. An exported SVG is `role="img"` with a `<title>`, a `<desc>` and its texts as text; a
  printed page is an image whose `alt` is the title and the page number.

### Forced colors

Under `@media (forced-colors: active)` (Windows High Contrast and other forced palettes) both
bindings paint with system colours; the look outside that mode doesn't change.

| Part                                                                                       | Forced colour                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Bars · their progress                                                                      | `ButtonFace` with a `ButtonText` outline · `ButtonText` |
| Critical bars                                                                              | dashed outline                                          |
| Selected bar, selected row, current period, today, checked toolbar radio, every focus ring | `Highlight` (text on it `HighlightText`)                |
| Bar labels                                                                                 | `CanvasText` outside a bar, `ButtonText` inside         |
| Arrows                                                                                     | `CanvasText`                                            |
| Grid lines, annotations, non-working time, loading placeholders                            | `GrayText`                                              |
| Tooltip, drag readout, state boxes                                                         | `Canvas` / `CanvasText` with a border                   |
| Progress grip, link connectors, the link being drawn, the selected arrow                   | `Highlight`                                             |
| Invalid link targets, an invalid cell editor                                               | dashed `CanvasText`                                     |
| Cell editor                                                                                | `Field` / `FieldText`                                   |
| Disabled Undo / Redo                                                                       | `GrayText`                                              |
| The More or Export button while its menu is open                                           | `Highlight`                                             |

A custom `renderBar` SVG and custom Angular bar components keep their own paints unless they add
forced-colors rules of their own (built-in bars on the critical path carry the class
`gantt-bar--critical`). The focus ring and the grips of every bar, custom ones included, follow
the forced palette.

---

## Angular (`@gantryjs/angular`)

> Angular 22+ — zoneless, signal-based, SSR-safe, zero `@angular/animations`, zero `@angular/cdk`.
> npm package: **`@gantryjs/angular`** (formerly `ngx-gantry`) · component: `<gantry>` · class: `GantryComponent`.

## Install

```bash
npm i @gantryjs/angular
# peer deps: @angular/core & @angular/common ^22 (@gantryjs/core is installed automatically)
```

## Features

| Feature            | Detail                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Signals**        | State in `signal()` / `computed()` / `linkedSignal()`, the zoom level a `model()` (`[(viewMode)]`) — no RxJS                                                 |
| **Zoneless**       | Works with `provideZonelessChangeDetection()`, no `zone.js`                                                                                                  |
| **SSR-safe**       | No browser globals; observers, timers and listeners start after the first browser render                                                                     |
| **Custom bars**    | Any component extending `GanttBarBase`, provided per application, route or component with `provideGanttBar()`                                                |
| **Virtual scroll** | Rows windowed vertically; header cells, bands and grid lines horizontally — zero CDK                                                                         |
| **Lazy load**      | Paged `GanttDataSource` over the core `PagedLoader`: accumulates pages, retries automatically, error state with Retry                                        |
| **Drag & resize**  | Pointer Events for bars, the splitter and column widths: 3 px mouse threshold, 350 ms touch long-press, auto-scroll at the edges, 24 px resize targets       |
| **Selection**      | Single / Ctrl+Click toggle / Shift+Click range, and the same with `Space` / `Ctrl+Space` / `Shift+Space`                                                     |
| **Editing**        | `options.editing`: cell editors, a progress grip, drawn links, undo / redo and a cancelable `(beforeChange)` — see [Editing](#editing)                       |
| **Export & print** | `exportSvg()`, `exportPng()`, `exportCsv()`, `download()`, `print()`, a toolbar Export menu and `(beforeExport)` — see [Export and print](#export-and-print) |
| **Keyboard**       | One tab stop each for the toolbar, the task list (row-first treegrid) and the bars; keyboard move / resize mode; `+` `-` `T` `F` shortcuts                   |
| **Accessibility**  | `region` landmark, `treegrid` task list, bars as a `listbox`, debounced live regions, forced colors, WCAG 2.2 AA palette                                     |
| **Sorting**        | Click a sortable column header: ascending → descending → original order                                                                                      |
| **Tooltip**        | One native popover per chart (Popover API), on hover, focus and tap, `<ng-template ganttTooltip>` content — zero CDK Overlay                                 |
| **Zoom**           | Toolbar, `+` / `-`, Ctrl/⌘ + wheel and pinch at the pointer, fit to screen (`F`, `fitToScreen()`)                                                            |
| **States**         | `loading` skeleton, `errorMessage` with Retry (`retry` output), `[ganttEmpty]` content                                                                       |
| **Dark / light**   | Auto `prefers-color-scheme` + manual toggle                                                                                                                  |
| **Animations**     | CSS transitions (panel, table view), off with `prefers-reduced-motion`                                                                                       |
| **Dependencies**   | None at runtime besides `@gantryjs/core`                                                                                                                     |

---

## Quick start (standalone)

```ts
// app.component.ts
import { Component, signal } from '@angular/core';
import { GantryComponent, ViewMode, type GanttTask, type TaskDragEvent } from '@gantryjs/angular';

@Component({
  selector: 'app-root',
  imports: [GantryComponent],
  template: `
    <gantry
      style="height: 480px"
      [series]="tasks"
      [options]="{ rowHeight: 36, baseline: true }"
      [(viewMode)]="zoom"
      showLegend
      (taskDragged)="onDrag($event)"
    />
  `,
})
export class AppComponent {
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
    console.log(`${event.taskId} moved by ${event.daysMoved} days`);
  }
}
```

`<gantry>` needs no provider: the built-in bars, the English labels and the light theme work as
they are. Give it a height (or a flex parent): the task list and the timeline scroll inside it.
`provideGantt()` is optional and sets defaults for every chart below the injector level it is
provided at (see [Providers & setup](#providers--setup)):

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideGantt } from '@gantryjs/angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideGantt({ darkMode: 'auto', locale: 'it' })],
});
```

---

## Custom bar component

A custom bar is a component that extends `GanttBarBase`: an abstract directive that declares the
`ctx` input, so the bar only reads `this.ctx()` (don't declare your own `ctx`).

```ts
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { GantryComponent, GanttBarBase, provideGanttBar, type GanttTask } from '@gantryjs/angular';

@Component({
  selector: 'g[epicBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg:rect
      [attr.x]="geo().barX"
      [attr.y]="geo().y + 6"
      [attr.width]="geo().barWidth"
      [attr.height]="geo().height - 12"
      rx="8"
      [style.fill]="ctx().visual.paint.body"
    />
    <svg:text
      [attr.x]="geo().barX + 8"
      [attr.y]="geo().y + geo().height / 2"
      [style.fill]="ctx().visual.paint.label"
      font-size="12"
      dominant-baseline="central"
    >
      ⚡ {{ task().name }}
    </svg:text>
  `,
})
export class EpicBarComponent extends GanttBarBase {
  protected readonly geo = computed(() => this.ctx().geometry);
  protected readonly task = computed(() => this.ctx().row.task);
}

@Component({
  selector: 'app-plan',
  imports: [GantryComponent],
  // The charts of this component draw barType 'epic' with EpicBarComponent; other pages don't see it
  providers: [provideGanttBar({ type: 'epic', component: EpicBarComponent })],
  template: `<gantry style="height: 360px" [series]="tasks" />`,
})
export class PlanComponent {
  readonly tasks: GanttTask[] = [
    { id: 'e1', name: 'Payments', barType: 'epic', start: new Date('2026-02-02'), end: new Date('2026-04-30') },
  ];
}
```

- `ctx` is a `GanttBarContext`: `row` (the task and its tree position), `geometry`, `visual` (the
  `@gantryjs/core` bar model: path, label, progress, baseline and the paints
  `visual.paint.{body,progress,label}`, which may be `var(--gantt-*)` tokens — bind them as styles
  or use `resolvePaint(paint, ctx.theme)`), `theme`, `isSelected`, `isCritical`, `draggable` and
  `showBaseline`. The chart keeps the same `ctx` object while none of them change, so only the bars
  whose data changed re-render.
- The chart creates each bar's `<g>` host in the SVG namespace itself (whatever the selector) as a
  direct child of `g.gantt-bars-layer`, and dims it while it is dragged. Prefix the SVG elements
  of the template with `svg:`.
- The chart also stamps the host with the bar's accessibility, as for the built-in bars and the
  Web Component's: `role="option"` of the timeline's `listbox`, `aria-label`
  (`taskAccessibleName()`), `aria-roledescription` (`labels.ariaBarRole`, "bar", for a custom
  type), `aria-selected`, `aria-posinset` / `aria-setsize`, the roving `tabindex`, `data-task-id`,
  `data-bar-type` and `data-focus-key`. Don't set `role` or `aria-label` on your bar: the chart's
  values win (see [Screen readers](#screen-readers)).
- Drag, resize, selection, the keyboard, the tooltip, the focus ring and the resize grips use
  the row's geometry (`ctx.visual.hitBox`, `focusRect`, `handles`), so they work on any bar.
- In [forced colors](#forced-colors), the built-in bars' system-colour rules don't reach a custom
  component (style encapsulation): add a `@media (forced-colors: active)` block to its styles.
- Provide bars in `bootstrapApplication`, a route's `providers` or a component's `providers`
  (`provideGanttBar(...defs)`, or `provideGantt(config, withBars(...defs))`). Each chart resolves a
  type from the nearest level that defines it, so a level can also replace a built-in type (`task`,
  `milestone`, `group`); an unknown `barType` draws the `task` bar. The built-in bars are exported
  (`GanttTaskBarComponent`, `GanttMilestoneComponent`, `GanttGroupBarComponent`) to reuse them for
  another type: `provideGanttBar({ type: 'phase', component: GanttGroupBarComponent })`.

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

The next page loads as the last rows scroll into view. While the first page loads the chart
shows its [loading state](#loading-error-and-empty-states). A page that still fails after its
retries sets `ds.error()`, emits `loadError` / `load-error` / `onLoadError` (`{ error, page }`)
and pauses loading until `ds.retry()`: a failed first page shows the chart's error state, whose
**Retry** also emits `retry` (`{ source: 'dataSource' }`); a later page shows a message with a
**Retry** button in the task-list footer. `ds.reset()` reloads from the first page;
`ds.setStatic(items)` shows a fixed list. `createGanttDataSource(config)` is the same as
`new GanttDataSource(config)`; neither needs an injection context. The Web Component takes the same config (`gantt.dataSource = { fetcher, pageSize }`).

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
- The built-in date, baseline-date and duration columns are 112, 124 and 96 px wide, or as wide
  as their text needs in the chart's `locale` and `formats.dateFormat` (`'D. MMMM YYYY'` in
  German, say), so long dates are not cut.
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

Three ways to define the columns of the task list panel.

**a) Plain columns via the `columns` input** — `render` returns a text string:

```ts
import { ColumnDef } from '@gantryjs/angular';

columns: ColumnDef[] = [
  { key: 'name',  label: 'Task', width: 220 },              // built-in name cell
  { key: 'owner', label: 'Owner', width: 120,
    render: r => (r.task.data?.['owner'] as string) ?? '' },
];
```

**b) Rich cell templates** — for avatars, badges, progress bars, use `cellTemplate`
(from a `viewChild` `TemplateRef`):

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

**c) Declarative `ganttColumn`** inside `<gantry>` (import `GanttColumnDefDirective`):

```html
<gantry [series]="tasks">
  <ng-template ganttColumn="name" label="Initiative" [width]="210" />
  <ng-container ganttColumn="owner" label="Owner" [width]="120">
    <ng-template let-row>{{ row.task.data?.['owner'] }}</ng-template>
  </ng-container>
</gantry>
```

Its inputs are `ganttColumn` (the key), `label`, `width`, `minWidth`, `maxWidth`, `visible`,
`sortable`, `sortValue` and `render`, and for [cell editing](#cells) `editable` (also a bare attribute), `editor`,
`editorOptions`, `exportValue`, `parse` and `validate`; an `<ng-template ganttCellEditor let-edit>` is the column's
[custom editor](#custom-editors); a cell template goes inside an `<ng-container ganttColumn>`
(an `<ng-template ganttColumn>` can't hold one). The inputs you leave unset come from the column
with the same key: over one of your `[columns]` a definition overrides only what it sets (a new
cell keeps the column's sort rule); over a built-in column, a cell of your own sorts only with
`sortable` / `sortValue`.
`<gantry>` reads them through a content query, so a column inside `@if` or `<ng-container>` comes
and goes with it; a `ganttColumn` outside `<gantry>` is ignored.

The cell template context is `{ $implicit: row, row, ctx }` where `row: GanttFlatRow`
(so `row.task` is your `GanttTask`) and `ctx: ColumnContext` (`now`, `taskById`, …).

---

## Legend

```html
<gantry [series]="tasks" [annotations]="annotations" showLegend />
```

A legend strip under the chart (`div.gantt-legend.gantt-legend--bottom`; at the end of the
toolbar with `legend.position: 'toolbar'`) lists the **today** marker (when `showToday` is on),
every **annotation** (with its colour and label), and the **critical path** / **baseline** when
those options are on. Each entry has a shape as well as a colour (line, dashed line, bar, strip).
It is not shown in the table view. Its strings are localisable (`labels.legend`, `labels.today`,
`labels.annotation`, `labels.legendCritical`, `labels.legendBaseline`). See
[Toolbar, legend and markers](#toolbar-legend-and-markers).

---

## Theming

The theme reaches the chart as `--gantt-*` custom properties in a `[style]` binding on the
`<gantry>` host: every theme key plus the derived tokens `--gantt-bar-text-on-*` and
`--gantt-today-label`. It is plain template output, so the server renders it too (no effect, no
flash). Change it through the theme API:

```ts
gantt.patchTheme({ barColor: '#6366F1', todayColor: '#F59E0B' }); // merged into the overrides
gantt.setTheme({ barColor: '#6366F1' }); // replaces the overrides
gantt.resetTheme(); // drops them
provideGantt({ darkMode: 'auto', theme: { barColor: '#6366F1' } }); // default for every chart below
```

Each layer overrides the one before: the light or dark built-in theme, `provideGantt({ theme })`
(merged along the injector hierarchy), `options.theme`, then `setTheme()` / `patchTheme()`.

- **From the template.** Bind a token on the element with a `[style]` map or the `--global--`
  prefix: a template binding wins over the chart's host binding, and removing the value hands the
  token back to the theme. Angular 22 namespaces a plain `[style.--gantt-bar]` binding, which then
  loses to the host map. A string `style` attribute (`style="height: 480px"`) is kept.

  ```html
  <gantry [series]="tasks" [style]="{ '--gantt-grid-line': gridColor }" />
  <gantry [series]="tasks" [style.--global--gantt-today]="todayColor" />
  ```

- **From page CSS.** The inline tokens beat a stylesheet rule on `gantry`, so add `!important`
  (and set the matching contrast token when you change a fill):

  ```css
  gantry {
    --gantt-bar: #6366f1 !important;
    --gantt-bar-text-on-bar: #ffffff !important;
    --gantt-today: #f59e0b !important;
    --gantt-font: 'Inter', system-ui, sans-serif !important;
  }
  ```

- **Paints.** Bars, rows, bands and arrows bind their colours as CSS properties (`[style.fill]`),
  so page CSS that targeted their `fill` / `stroke` attributes no longer applies: restyle through
  the tokens (see [Theming](#theming) under Configuration).
- **Dark mode.** `[darkMode]="true | false | 'auto'"`; unset, `provideGantt({ darkMode })` applies,
  else light, and `options.darkMode` wins over both. `'auto'` follows `prefers-color-scheme` once
  the chart runs in the browser (the server renders light). While the dark theme is on, the host
  has the class `gantry-dark` (and `gantry-dragging` while a bar is dragged or resized,
  `gantry-loading` while a data-source page loads); there is no `data-theme` attribute:

  ```css
  gantry.gantry-dark {
    border-color: #334155;
  }
  ```

Built-in themes `LightTheme` / `DarkTheme` are exported. They meet WCAG 2.2 AA: bar labels reach
4.5:1 and bars, markers and arrows 3:1 against the background. Labels inside bars switch to white
or near-black when `barTextColor` is unreadable on a custom `barColor` (an explicit
`task.textColor` or `bar.label.color` is always kept); `contrastRatio()` and `readableOn()` are
exported from `@gantryjs/core`. Focus rings use `--gantt-focus-ring` (`focusRing`) and the light
milestones `#7C3AED` (see [Theming](#theming)). The 1.x colours are available as
`LegacyLightTheme` / `LegacyDarkTheme`. Full token map:

| `GanttTheme` field | CSS variable              |     | `GanttTheme` field               | CSS variable                    |
| ------------------ | ------------------------- | --- | -------------------------------- | ------------------------------- |
| `backgroundColor`  | `--gantt-bg`              |     | `arrowColor`                     | `--gantt-arrow`                 |
| `headerBackground` | `--gantt-header-bg`       |     | `tooltipBg`                      | `--gantt-tooltip-bg`            |
| `rowBg`            | `--gantt-row-bg`          |     | `tooltipBorder`                  | `--gantt-tooltip-bdr`           |
| `rowBgAlt`         | `--gantt-row-bg-alt`      |     | `tooltipText`                    | `--gantt-tooltip-txt`           |
| `barColor`         | `--gantt-bar`             |     | `selectionBg`                    | `--gantt-sel-bg`                |
| `barTextColor`     | `--gantt-bar-text`        |     | `selectionBorder`                | `--gantt-sel-border`            |
| `barRadius`        | `--gantt-bar-radius`      |     | `scrollbarTrack`                 | `--gantt-scrollbar-track`       |
| `milestoneColor`   | `--gantt-milestone`       |     | `scrollbarThumb`                 | `--gantt-scrollbar-thumb`       |
| `baselineColor`    | `--gantt-baseline`        |     | `weekendBg`                      | `--gantt-weekend-bg`            |
| `criticalColor`    | `--gantt-critical`        |     | `holidayBg`                      | `--gantt-holiday-bg`            |
| `panelBg`          | `--gantt-panel-bg`        |     | `offHoursBg`                     | `--gantt-off-hours-bg`          |
| `panelBorder`      | `--gantt-panel-border`    |     | `intensiveBg`                    | `--gantt-intensive-bg`          |
| `borderColor`      | `--gantt-border`          |     | `statusNotStarted`               | `--gantt-status-not-started`    |
| `gridLine`         | `--gantt-grid-line`       |     | `statusInProgress`               | `--gantt-status-in-progress`    |
| `gridLineMajor`    | `--gantt-grid-line-major` |     | `statusOverdue`                  | `--gantt-status-overdue`        |
| `todayColor`       | `--gantt-today`           |     | `statusDone`                     | `--gantt-status-done`           |
| `textPrimary`      | `--gantt-text`            |     | `progressOverlay`                | `--gantt-progress-overlay`      |
| `textSecondary`    | `--gantt-text-sec`        |     | derived: label on a bar          | `--gantt-bar-text-on-bar`       |
| `textMuted`        | `--gantt-text-muted`      |     | derived: label on a milestone    | `--gantt-bar-text-on-milestone` |
| `fontFamily`       | `--gantt-font`            |     | derived: label on a critical bar | `--gantt-bar-text-on-critical`  |
| `fontSize`         | `--gantt-font-size`       |     | derived: current-period label    | `--gantt-today-label`           |
| `focusRing`        | `--gantt-focus-ring`      |     | `rowHoverBg`                     | `--gantt-row-hover-bg`          |

---

## Internationalisation & date formats

Locales, labels, format tokens and `formats.readoutFormat` are described once, for every binding, in
[Dates, locales and format tokens](#dates-locales-and-format-tokens). Set them per instance in
`options`, or as defaults with `provideGantt()`:

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

Defaults for every chart below an injector level: `provideGantt({ locale: 'it', labels: {…}, formats: {…} })`
(merged per key along the hierarchy, see [Providers & setup](#providers--setup)).

---

## Providers & setup

Nothing is required: a `<gantry>` without providers has the built-in bars, the English labels and
the light theme. The providers set defaults for every chart below the injector level they are
given at — `bootstrapApplication`, a route's `providers` or a component's `providers` — and all
return `Provider[]`:

| Provider                             | Use                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `provideGantt(config?, ...features)` | Defaults (`GanttGlobalConfig`): `theme`, `darkMode`, `locale`, `labels`, `formats`.                  |
| `withBars(...defs)`                  | A `provideGantt` feature: custom bars at the same level, like `provideGanttBar(...defs)`.            |
| `provideGanttBar(...defs)`           | Custom bar components (`{ type, component }`), or a replacement for a built-in type.                 |
| `new GanttDataSource(config)`        | Not a provider: a lazy data source for `[dataSource]` (`createGanttDataSource(config)` is the same). |

```ts
// Application: defaults for every chart
bootstrapApplication(App, { providers: [provideGantt({ locale: 'it', darkMode: 'auto' })] });

// Route: one more label and a custom bar for the charts of this route
const routes: Routes = [
  {
    path: 'plan',
    component: PlanPage,
    providers: [provideGantt({ labels: { legend: 'Legenda' } }, withBars({ type: 'epic', component: EpicBar }))],
  },
];

// Component: a theme tweak for the charts inside this component only
@Component({ providers: [provideGantt({ theme: { todayColor: '#0F766E' } })], … })
```

- Each level merges its config over the level above: `theme`, `labels` (with `labels.viewModes`)
  and `formats` (with `formats.header`) per key, `darkMode` and `locale` replaced. So a component
  can change one label and keep the application's locale and theme. Two `provideGantt` at the same
  level: the last one wins.
- A chart's own `options` (and its `darkMode` input) win over these defaults.
- Bars resolve per chart: the built-in types first, then the `provideGanttBar` / `withBars` of each
  level from the outermost to the innermost (the nearest definition of a type wins).

---

## Inputs & Outputs

| Input                         | Type                              | Default                                                                               |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| `series` (model)              | `GanttTask[]`                     | `[]`: bind `[(series)]` to get the tasks the chart applied                            |
| `dataSource`                  | `GanttDataSource \| null`         | `null`                                                                                |
| `options`                     | `GanttOptions`                    | `{}`                                                                                  |
| `annotations`                 | `GanttAnnotation[]`               | `[]`                                                                                  |
| `columns`                     | `ColumnDef[]`                     | `[]` (`options.columns` wins)                                                         |
| `viewMode` (model)            | `ViewMode \| string \| undefined` | `undefined`: `options.viewMode`, else `'Month'`                                       |
| `darkMode`                    | `boolean \| 'auto' \| undefined`  | `undefined`: `provideGantt({ darkMode })`, else `false` (`options.darkMode` wins)     |
| `showToolbar`                 | `boolean`                         | `true`                                                                                |
| `enableDrag` / `enableResize` | `boolean`                         | `true`                                                                                |
| `tooltipEnabled`              | `boolean`                         | `true`                                                                                |
| `showLegend`                  | `boolean`                         | `false`                                                                               |
| `loading`                     | `boolean`                         | `false`: the [loading state](#loading-error-and-empty-states) while there are no rows |
| `errorMessage`                | `string \| null \| undefined`     | `null`: a non-blank message shows the error state with Retry                          |
| `syncGroup`                   | `GanttSyncGroup \| null`          | `null`: charts sharing a group share range, zoom, scroll and panel width              |

| Output                                    | Payload                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `viewModeChange`                          | the new zoom level (`ViewMode` or a custom level name)                                  |
| `taskDragged`                             | `TaskDragEvent`                                                                         |
| `taskResized`                             | `TaskResizeEvent`                                                                       |
| `selectionChange`                         | `SelectionChangeEvent`                                                                  |
| `rowClick` / `rowDblClick`                | `GanttFlatRow` (a double-click on an editable cell fires `rowDblClick` too)             |
| `stateChange`                             | `GanttState` — panel, view, zoom, column widths, collapsed rows or sort changed         |
| `loadError`                               | `{ error, page }` — a data-source page failed after its retries                         |
| `retry`                                   | `RetryEvent` — Retry pressed on the error state: `{ source: 'error' \| 'dataSource' }`  |
| `beforeChange`                            | `GanttBeforeChangeEvent` — `$event.preventDefault()` vetoes the change                  |
| `tasksChange`                             | `GanttTasksChangeEvent` — `{ tasks, change, applied }`                                  |
| `taskUpdated`                             | `TaskUpdatedEvent` — one per changed task                                               |
| `taskProgressChanged`                     | `TaskProgressEvent`                                                                     |
| `dependencyCreated` / `dependencyDeleted` | `DependencyChangeEvent`                                                                 |
| `historyChange`                           | `GanttHistoryState`                                                                     |
| `beforeExport`                            | `GanttBeforeExportEvent` — `$event.preventDefault()` cancels a `download()` / `print()` |
| `export`                                  | `GanttExportEvent` — `{ format, trigger, fileName, size, pages }`                       |

- **Boolean inputs** take attribute values: `<gantry showLegend>` is `true`, `showToolbar="false"`
  is `false`.
- **`viewMode` is a model.** `[(viewMode)]="zoom"` keeps a signal (or a field) in sync with the
  zoom level. `viewModeChange` reports the changes made by the toolbar, the `+` / `-` keys,
  `zoomIn()` / `zoomOut()` / `setViewMode()`, a restored state or a new `options.viewMode`; it does
  not fire for a value the parent sets through `[viewMode]`, nor on the first render. Between
  `[viewMode]` and `options.viewMode`, the one that changed last wins.
- **`series` is a model.** `[(series)]="tasks"` keeps the tasks you pass in sync with the edits the chart applies
  (drags, cells, links, undo…); `(tasksChange)` reports each one. See [Editing](#editing) for the events and
  `[series]` with `editing.controlled`.
- **`syncGroup`** takes a `createGanttSyncGroup()` group (see [Synchronised charts](#synchronised-charts)).
  A chart leaves its group when it is destroyed or the input changes.
- **`loading` / `errorMessage` / `retry`** drive the chart's
  [loading, error and empty states](#loading-error-and-empty-states); the empty state shows your
  `[ganttEmpty]` content (see [ng-content slots](#ng-content-slots)).

---

## Public API

`@gantryjs/angular` exports everything in `@gantryjs/core` (types such as `GanttTask`, `GanttOptions` and
`ViewMode`, the themes, the labels and the date, tree, critical-path and theme helpers) and these
Angular pieces:

| Export                                                                       | What                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GantryComponent`                                                            | `<gantry>`                                                                                                    |
| `GanttColumnDefDirective`                                                    | `ganttColumn` column definitions                                                                              |
| `GanttCellEditorDirective`, `CellEditorTemplateContext`                      | `<ng-template ganttCellEditor>` [cell editors](#custom-editors)                                               |
| `GanttTooltipTemplateDirective`, `GanttTooltipTemplateContext`               | `<ng-template ganttTooltip>` [tooltip content](#tooltip)                                                      |
| `provideGantt`, `withBars`, `GanttGlobalConfig`, `GanttFeature`              | optional defaults ([Providers & setup](#providers--setup))                                                    |
| `provideGanttBar`, `GanttBarDef`, `GanttBarBase`                             | [custom bars](#custom-bar-component)                                                                          |
| `GanttTaskBarComponent`, `GanttMilestoneComponent`, `GanttGroupBarComponent` | the built-in bars, reusable for another `barType`                                                             |
| `GanttDataSource`, `createGanttDataSource`, `GanttDataSourceConfig`          | [lazy loading](#lazy-load-with-ganttdatasource)                                                               |
| `ColumnDef`                                                                  | `ColumnDef<TemplateRef<ColumnCellContext>, TemplateRef<CellEditorTemplateContext> \| ((ctx) => HTMLElement)>` |
| `GanttDownloadOptions`                                                       | the options of `download(format, options)`: that format's options and `fileName`                              |

The services, the inner components (canvas, header, task list, toolbar, tooltip, load-more
footer) and the keyboard directive are internal: drive the chart through its inputs, outputs and
methods.

```ts
// Component methods (access via viewChild(GantryComponent))
gantt.zoomIn() / zoomOut()
gantt.setViewMode(ViewMode.Week)                 // reported through viewModeChange
gantt.fitToScreen()                              // the finest level that shows every task, then scroll to the first
gantt.view()                                     // 'split' | 'table' | 'chart' (read-only signal)
gantt.setView('table') / togglePanel()
gantt.scrollToToday() / scrollToDate(date) / scrollToTask(id)   // optional ScrollBehavior
gantt.getBarVisual(id): BarVisual | undefined    // geometry and paints, also for rows out of view
gantt.criticalIds()                              // ReadonlySet<string>: the tasks on the critical path (signal)
gantt.getSelectedTasks(): GanttTask[]
gantt.setSelectedTasks(ids) / clearSelection() / selectAll()
gantt.updateTask(id, patch) / appendTasks(tasks) // silent writes: no events, no history
gantt.undo() / redo(): boolean                   // editing history; gantt.canUndo() / canRedo() are signals
gantt.clearHistory()
gantt.addDependency(fromId, toId, type?, lag?) / removeDependency(fromId, toId, type?): boolean
gantt.editCell(taskId, columnKey): boolean       // open a cell editor (editing.cells)
gantt.focusTask(id, { area?: 'bar' | 'row' }): boolean
gantt.collapseAll() / expandAll()
gantt.setColumnVisible(key, visible, view?) / toggleColumnVisible(key, view?)
gantt.setTheme(override) / patchTheme(patch) / resetTheme()
gantt.getState(): GanttState / setState(state, emit = true)
await gantt.exportSvg(options?) / exportCsv(options?)        // Promise<string>; exportPng(options?): Promise<Blob>
await gantt.download('svg' | 'png' | 'csv', options?)       // Promise<boolean>: false when (beforeExport) vetoed it
await gantt.print(options?)                                  // Promise<boolean>: every row, on as many pages as it takes
```

---

## Server-side rendering

`@gantryjs/angular` is SSR-safe. It reads no browser globals (`DOCUMENT` and `Renderer2` instead of
`window` / `document`), and everything browser-only — the `ResizeObserver`, the load-more
`IntersectionObserver`, the one-minute clock, the scroll listeners, `matchMedia` for
`darkMode: 'auto'`, the tooltip popover — starts after the first browser render
(`afterNextRender`) and stops when the chart is destroyed (`DestroyRef`). The server HTML already
has the rows, the bars, the theme tokens and the `region` role; with `darkMode: 'auto'` it is
light until the browser reports the colour scheme. `exportSvg()` and `exportCsv()` work during server rendering too
(custom bars drawn as built-in); `exportPng()`, `download()` and `print()` reject there, before `beforeExport` (see
[On the server and in Node](#on-the-server-and-in-node)).

---

## ng-content slots

```html
<gantry [series]="tasks" [loading]="pending()">
  <!-- Toolbar extras: between Today and the view switch -->
  <button ganttToolbar>Export CSV</button>

  <!-- Task list footer -->
  <div tlFooter>{{ tasks.length }} total tasks</div>

  <!-- Empty state (no tasks and nothing loading); default: labels.emptyState -->
  <div ganttEmpty>No tasks yet. <button (click)="add()">Add one</button></div>

  <!-- Tooltip content (import GanttTooltipTemplateDirective) -->
  <ng-template ganttTooltip let-task="task">{{ task.name }}</ng-template>

  <!-- Below the gantt -->
  <div ganttFooter>© 2026 My Company</div>
</gantry>
```

- `[ganttToolbar]` controls are tab stops of their own, outside the toolbar's arrow-key set.
- `[ganttEmpty]` content wrapped in `@if` fills the slot even while the condition is false
  (Angular content projection), and the default `labels.emptyState` text then doesn't show:
  put the condition inside the element, or set `labels.emptyState` instead.

---

## Coming from `ngx-gantry` 1.x

| 1.x                                                                         | 2.0                                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm i ngx-gantry`, `import { … } from 'ngx-gantry'`                        | `npm i @gantryjs/angular`, `import { … } from '@gantryjs/angular'`                                                |
| `provideGanttLib(config)`, `GanttModule.forRoot(config)`                    | `provideGantt(config)` — optional; the built-in bars need no provider                                             |
| `provideGanttBar(def)` in `bootstrapApplication`                            | `provideGanttBar(...defs)` at application, route or component level, or `provideGantt(config, withBars(...defs))` |
| `inject(GanttBarRegistry).register(def)`                                    | `provideGanttBar(def)` in the `providers` of the page or route                                                    |
| custom bar with its own `ctx = input.required()` and `get context()`        | `extends GanttBarBase` (it declares `ctx`)                                                                        |
| `options.viewMode` written back from `(viewModeChange)`                     | `[(viewMode)]="zoom"`                                                                                             |
| `gantry[data-theme='dark']`                                                 | `gantry.gantry-dark`                                                                                              |
| `body > .gantt-tooltip`, `.gantt-tooltip-popover`                           | `gantry .gantt-tooltip` (`dl.gantt-tooltip-rows` > `div.gantt-tooltip-row` > `dt` + `dd`)                         |
| `.gantt-panel-scroll` · `.gantt-timeline-scroll` · `.gantt-timeline-header` | `.gantry-panel` · `.gantry-canvas-viewport` · `.gantry-canvas-header-sticky`                                      |
| `<gantry [style.--gantt-bar]="c">`                                          | `[style]="{ '--gantt-bar': c }"` or `[style.--global--gantt-bar]="c"`                                             |
| `import { GanttLayoutService, … } from 'ngx-gantry'`                        | internal: use `<gantry>`'s inputs, outputs and methods                                                            |
| `<gantry [visibleRows]>`, `GanttTooltipDirective`, `GanttModule`            | removed                                                                                                           |

Every change is listed in the [changelog](https://github.com/ErlonRr/gantryjs/blob/main/CHANGELOG.md).

---

## Live showcase (the demo site)

`apps/demo-angular` is the **Gantry site**, built with `@gantryjs/angular`:

- **Home** — what Gantry is, with live charts;
- **Playground** — every option at hand: the code follows your choices in the syntax of each
  framework and the link keeps the setup (`?setup=`);
- **Examples** — a product roadmap (custom columns, locales), a project board, lazy loading with a
  data source and custom bar components, each with its usage code;
- **Theming** — the `--gantt-*` custom properties with presets, a contrast check and the code;
- **Frameworks** — install and use it as a Web Component or in Angular, React, Vue and Svelte;
- **API** — the `<gantry-element>` properties, methods, events, CSS custom properties, parts and
  states, generated from the Custom Elements Manifest.

The Web Component playground (`apps/demo-vanilla`) and the React, Vue and Svelte demos share the
site's look through the private `apps/demo-kit` package: design tokens and components
(`site.css`, `gs-` classes only, so no page style reaches a chart), the light/dark switch, links,
icons, the playground model (`PLAYGROUND_SECTIONS`, read by both playgrounds) and the API model.

```bash
pnpm start                 # dev server (ng serve gantry-demo)
pnpm build:demo            # static build → dist/gantry-demo (relative base href)
```

Deploy `dist/gantry-demo/browser` to any static host (GitHub Pages, Netlify,
Vercel — `vercel.json` builds and deploys it). The site uses path routes: add an SPA fallback
(`404.html` = `index.html`, or a `_redirects` / rewrite rule) so a deep link such as `/playground`
loads on refresh.

## Development tooling

### Monorepo layout

A pnpm workspace (`pnpm-workspace.yaml`):

| Path                                                | What                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/core`                                     | `@gantryjs/core` — framework-free logic, shared by every binding     |
| `packages/vanilla`                                  | `@gantryjs/vanilla` — the `<gantry-element>` Web Component           |
| `packages/react`, `packages/vue`, `packages/svelte` | thin framework bindings over the Web Component                       |
| `packages/angular`                                  | `@gantryjs/angular` — the Angular library (imports `@gantryjs/core`) |
| `apps/demo-angular`                                 | the Gantry site (Angular showcase)                                   |
| `apps/demo-*`                                       | one Vite demo per framework                                          |
| `apps/demo-kit`                                     | the demos' shared look, theme switch and playground model            |

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

Workspace packages expose a `@gantryjs/source` export condition pointing at
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

**Vitest** runs two projects: the framework-free core (render model, timeline math, formatter, CPM, interaction
and state helpers) in plain Node, and the `<gantry-element>` Web Component in happy-dom. `ng test` runs the
`@gantryjs/angular` specs (Vitest + happy-dom, zoneless TestBed), including a server-render smoke test.

```bash
pnpm test           # core + Web Component, then @gantryjs/angular
pnpm test:watch     # Vitest watch mode
pnpm test:angular   # @gantryjs/angular only
pnpm test:tz        # core in other time zones
```

Specs live in `packages/core/src/__tests__/`, `packages/vanilla/src/__tests__/` and
`packages/angular/src/**/*.spec.ts`; the browser suites (paint parity, accessibility, CSP, lifecycle, performance,
screenshots) are in `e2e/`.

### Angular workspace

The showcase (`gantry-demo`) and the library are built with the esbuild-based
`@angular/build` builders (`application`, `dev-server`, `ng-packagr`); there is no
webpack in the toolchain. The live showcase replaces a component workshop such as Storybook.

---

## Dependencies

| Package          | License | Size                        |
| ---------------- | ------- | --------------------------- |
| `@gantryjs/core` | MIT     | shared logic from this repo |

`@gantryjs/core` itself has no runtime dependencies (dates are formatted with `Intl`).
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

For complete release history, view the full [CHANGELOG.md](https://github.com/ErlonRr/gantryjs/blob/main/CHANGELOG.md).

</details>
