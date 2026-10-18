# Gantry

> A free, full-featured, open-source Gantt chart for **every framework** — Angular, React, Vue, Svelte, or plain JavaScript.
> Interactive drag & resize (mouse, touch and keyboard), dependencies, critical path, baselines, virtual scrolling, theming and i18n — accessible (WCAG 2.2 AA, forced colors), MIT licensed, zero runtime dependencies.

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
    handles: { hitSize: 24 }, // width of each resize target in px (see Touch and pointer)
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
and its colours in `ctx.visual.paint` (see [Theming](#theming)). The chart gives every bar,
custom ones included, its role, name and roving `tabindex` (see [Screen readers](#screen-readers)),
hit-tests it by its visual box, and draws its focus ring and resize grips in an overlay
(`g.gantt-bar-overlay`, from `ctx.visual.focusRect` and `ctx.visual.handles.{left,right}.grip`),
so a renderer draws only the bar. `ctx.visual.handles` is `{ left, right }` (each a `hit` rect
and a `grip`) or `null` when the bar can't be resized.

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

### Toolbar, legend and markers

```ts
options = {
  toolbar: { zoom: true, fit: true, today: true, viewToggle: true }, // `false` hides the toolbar
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

### Dates and time zones

- `new Date('2026-01-05')` (UTC midnight) is read as **that calendar day in local time**
  (`normalizeDateOnly: true`), so bars line up with day cells in every time zone; `parseDate()` helps too.
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
- **Progress overlay.** Bars without `task.progressColor` / `bar.progress.color` darken their
  progress part with `--gantt-progress-overlay` (theme key `progressOverlay`, `#000000`) at
  `bar.progress.opacity`.
- **Metrics.** `barRadius` (the default `bar.radius`), `fontSize` (bar labels use `fontSize − 1`)
  and `barTextColor` shape the layout, so change them through the theme API, not page CSS:
  `themeMetrics(theme)` returns them and `resolveConfig(options, i18n, themeMetrics(theme))`
  reads them. The resolved config holds no colours, so a colour-only theme change leaves the
  layout as it is.
- **Every token.** All 43 custom properties (the theme keys and the four derived tokens) are
  listed in the Angular [token map](#theming-1) and the Web Component's [CSS custom
  properties][wc-css].
- **Custom renderers.** `ctx.visual.paint.{body,progress,label}` may be `var()` strings: apply
  them as style properties (`el.style.setProperty('fill', paint)`), or get a concrete colour with
  `resolvePaint(paint, ctx.theme)` (`ctx.theme` is the chart's resolved theme). `themeToCss(theme)`
  lists every custom property a theme writes, the contrast tokens included.

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

| Focus on       | Key                                                         | Action                                                                                               |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Toolbar        | `←` / `→` (wrapping), `Home` / `End`                        | Move between the controls                                                                            |
|                | `Enter` / `Space`                                           | Press the button, check the radio                                                                    |
| Task-list row  | `↑` / `↓`                                                   | Previous / next row (the header row is above the first row)                                          |
|                | `PgUp` / `PgDn` · `Home` / `End`                            | One page up / down · first / last row                                                                |
|                | `→`                                                         | Collapsed group: expand it; otherwise move into the row's first cell                                 |
|                | `←`                                                         | Expanded group: collapse it; otherwise go to the parent row                                          |
|                | `Enter`                                                     | Select only this row and fire `row-click`                                                            |
|                | `Space` · `Shift+Space` · `Ctrl/⌘+Space`                    | Select (toggles with `multiSelect`) · extend the range · toggle                                      |
| Task-list cell | `←` / `→`                                                   | Previous / next cell; `←` on the first cell goes back to the row                                     |
|                | `↑` / `↓` · `PgUp` / `PgDn`                                 | Same column, other row                                                                               |
|                | `Home` / `End` · `Ctrl/⌘+Home` / `End`                      | First / last cell · same column, first / last row                                                    |
|                | `Enter`, `Space`                                            | As on the row (a button or link inside a cell keeps them)                                            |
| Header cell    | `←` / `→` · `↓`                                             | Previous / next header cell · the first row, same column                                             |
|                | `Enter` / `Space`                                           | Sort by the column                                                                                   |
| Bar            | `↑` / `↓` · `PgUp` / `PgDn` · `Home` / `End` (`Ctrl/⌘` too) | Focus the bar of the previous / next row, one page away, the first / last row (scrolled into view)   |
|                | `←` / `→`                                                   | Pan the timeline by one bottom-tier header cell                                                      |
|                | `Space` · `Shift+Space` · `Ctrl/⌘+Space`                    | As in the task list                                                                                  |
|                | `Enter` / `F2`                                              | **Move mode** on a movable bar; otherwise select only this row and fire `row-click`                  |
| Move mode      | `←` / `→`                                                   | Move the bar one unit earlier / later (a day; an hour on hour scales)                                |
|                | `Shift+←` / `→` · `Alt+←` / `→`                             | Resize the end · the start (task bars, with `enableResize`)                                          |
|                | `Enter` / `F2`                                              | Commit: `task-dragged` / `task-resized` as after a pointer drop, then the change is announced        |
|                | `Escape`, `Tab`, leaving the bar, a pointer press           | Cancel (announced)                                                                                   |
| Splitter       | `←` / `→` · `Enter` / `Space`                               | Resize the panel · collapse / expand it                                                              |
| Anywhere       | `Escape`                                                    | Cancel move mode or a drag, else close the tooltip, else clear the selection                         |
|                | `Ctrl/⌘+A` (also with `Shift`)                              | Select all visible rows                                                                              |
|                | `+` (or `=`) · `-` · `T` · `F`                              | Zoom in · zoom out · scroll to today · [fit to screen](#zoom) — off with `characterShortcuts: false` |

- Move mode works like a pointer drag: the same snapping and minimum length, the drag ghost, the
  readout chip with the new dates, and an announcement of each step; a movable bar is one with
  `enableDrag` on and `task.draggable !== false`. While it is on, other plain keys do nothing.
- Shortcuts never fire while typing in an input, a select or a `contenteditable` cell, nor with
  `Alt` / `AltGr` held; keys the chart doesn't use keep their browser default. `L`,
  `Delete` and `Ctrl/⌘+Z` / `Y` are reserved for editing (dependency links, undo / redo), which
  comes in a later release: for now they keep their default action too.
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

| Feature            | Detail                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Signals**        | State in `signal()` / `computed()` / `linkedSignal()`, the zoom level a `model()` (`[(viewMode)]`) — no RxJS                                           |
| **Zoneless**       | Works with `provideZonelessChangeDetection()`, no `zone.js`                                                                                            |
| **SSR-safe**       | No browser globals; observers, timers and listeners start after the first browser render                                                               |
| **Custom bars**    | Any component extending `GanttBarBase`, provided per application, route or component with `provideGanttBar()`                                          |
| **Virtual scroll** | Rows windowed vertically; header cells, bands and grid lines horizontally — zero CDK                                                                   |
| **Lazy load**      | Paged `GanttDataSource` over the core `PagedLoader`: accumulates pages, retries automatically, error state with Retry                                  |
| **Drag & resize**  | Pointer Events for bars, the splitter and column widths: 3 px mouse threshold, 350 ms touch long-press, auto-scroll at the edges, 24 px resize targets |
| **Selection**      | Single / Ctrl+Click toggle / Shift+Click range, and the same with `Space` / `Ctrl+Space` / `Shift+Space`                                               |
| **Keyboard**       | One tab stop each for the toolbar, the task list (row-first treegrid) and the bars; keyboard move / resize mode; `+` `-` `T` `F` shortcuts             |
| **Accessibility**  | `region` landmark, `treegrid` task list, bars as a `listbox`, debounced live regions, forced colors, WCAG 2.2 AA palette                               |
| **Sorting**        | Click a sortable column header: ascending → descending → original order                                                                                |
| **Tooltip**        | One native popover per chart (Popover API), on hover, focus and tap, `<ng-template ganttTooltip>` content — zero CDK Overlay                           |
| **Zoom**           | Toolbar, `+` / `-`, Ctrl/⌘ + wheel and pinch at the pointer, fit to screen (`F`, `fitToScreen()`)                                                      |
| **States**         | `loading` skeleton, `errorMessage` with Retry (`retry` output), `[ganttEmpty]` content                                                                 |
| **Dark / light**   | Auto `prefers-color-scheme` + manual toggle                                                                                                            |
| **Animations**     | CSS transitions (panel, table view), off with `prefers-reduced-motion`                                                                                 |
| **Dependencies**   | None at runtime besides `@gantryjs/core`                                                                                                               |

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

**c) Declarative `<ng-template ganttColumn>`** inside `<gantry>` (import `GanttColumnDefDirective`):

```html
<gantry [series]="tasks">
  <ng-template ganttColumn="name" label="Initiative" [width]="210" />
  <ng-template ganttColumn="owner" label="Owner" [width]="120">
    <ng-template let-row>{{ row.task.data?.['owner'] }}</ng-template>
  </ng-template>
</gantry>
```

Its inputs are `ganttColumn` (the key), `label`, `width`, `minWidth`, `maxWidth`, `visible`,
`sortable` and `render`; the ones you leave unset come from the built-in column with the same key.
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
| `focusRing`        | `--gantt-focus-ring`      |     |                                  |                                 |

---

## Internationalisation & date formats

Everything user-facing is translatable. Dates are formatted with the platform's `Intl` API from a
BCP 47 locale and a dayjs-compatible pattern — no locale files to import, no runtime dependency.
Set per instance via `options`, or as defaults with `provideGantt()`.

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
| `series`                      | `GanttTask[]`                     | `[]`                                                                                  |
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

| Output                     | Payload                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `viewModeChange`           | the new zoom level (`ViewMode` or a custom level name)                                 |
| `taskDragged`              | `TaskDragEvent`                                                                        |
| `taskResized`              | `TaskResizeEvent`                                                                      |
| `selectionChange`          | `SelectionChangeEvent`                                                                 |
| `rowClick` / `rowDblClick` | `RowGeometry` / `GanttFlatRow`                                                         |
| `stateChange`              | `GanttState` — panel, view, zoom, column widths, collapsed rows or sort changed        |
| `loadError`                | `{ error, page }` — a data-source page failed after its retries                        |
| `retry`                    | `RetryEvent` — Retry pressed on the error state: `{ source: 'error' \| 'dataSource' }` |

- **Boolean inputs** take attribute values: `<gantry showLegend>` is `true`, `showToolbar="false"`
  is `false`.
- **`viewMode` is a model.** `[(viewMode)]="zoom"` keeps a signal (or a field) in sync with the
  zoom level. `viewModeChange` reports the changes made by the toolbar, the `+` / `-` keys,
  `zoomIn()` / `zoomOut()` / `setViewMode()`, a restored state or a new `options.viewMode`; it does
  not fire for a value the parent sets through `[viewMode]`, nor on the first render. Between
  `[viewMode]` and `options.viewMode`, the one that changed last wins.
- **`loading` / `errorMessage` / `retry`** drive the chart's
  [loading, error and empty states](#loading-error-and-empty-states); the empty state shows your
  `[ganttEmpty]` content (see [ng-content slots](#ng-content-slots)).

---

## Public API

`@gantryjs/angular` exports everything in `@gantryjs/core` (types such as `GanttTask`, `GanttOptions` and
`ViewMode`, the themes, the labels and the date, tree, critical-path and theme helpers) and these
Angular pieces:

| Export                                                                       | What                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GantryComponent`                                                            | `<gantry>`                                                 |
| `GanttColumnDefDirective`                                                    | `<ng-template ganttColumn>` column definitions             |
| `GanttTooltipTemplateDirective`, `GanttTooltipTemplateContext`               | `<ng-template ganttTooltip>` [tooltip content](#tooltip)   |
| `provideGantt`, `withBars`, `GanttGlobalConfig`, `GanttFeature`              | optional defaults ([Providers & setup](#providers--setup)) |
| `provideGanttBar`, `GanttBarDef`, `GanttBarBase`                             | [custom bars](#custom-bar-component)                       |
| `GanttTaskBarComponent`, `GanttMilestoneComponent`, `GanttGroupBarComponent` | the built-in bars, reusable for another `barType`          |
| `GanttDataSource`, `createGanttDataSource`, `GanttDataSourceConfig`          | [lazy loading](#lazy-load-with-ganttdatasource)            |
| `ColumnDef`                                                                  | `ColumnDef<TemplateRef<ColumnCellContext>>`                |

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
gantt.updateTask(id, patch) / appendTasks(tasks)
gantt.collapseAll() / expandAll()
gantt.setColumnVisible(key, visible, view?) / toggleColumnVisible(key, view?)
gantt.setTheme(override) / patchTheme(patch) / resetTheme()
gantt.getState(): GanttState / setState(state, emit = true)
```

---

## Server-side rendering

`@gantryjs/angular` is SSR-safe. It reads no browser globals (`DOCUMENT` and `Renderer2` instead of
`window` / `document`), and everything browser-only — the `ResizeObserver`, the load-more
`IntersectionObserver`, the one-minute clock, the scroll listeners, `matchMedia` for
`darkMode: 'auto'`, the tooltip popover — starts after the first browser render
(`afterNextRender`) and stops when the chart is destroyed (`DestroyRef`). The server HTML already
has the rows, the bars, the theme tokens and the `region` role; with `darkMode: 'auto'` it is
light until the browser reports the colour scheme.

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
