# @gantryjs/vanilla

The Gantry Gantt chart as a framework-agnostic **Web Component**: `<gantry-element>`.
Use it from plain JavaScript or any framework. React, Vue and Svelte users can install
the thin bindings [`@gantryjs/react`](https://github.com/ErlonRr/gantryjs/tree/main/packages/react), [`@gantryjs/vue`](https://github.com/ErlonRr/gantryjs/tree/main/packages/vue) and
[`@gantryjs/svelte`](https://github.com/ErlonRr/gantryjs/tree/main/packages/svelte) instead; Angular users, [`@gantryjs/angular`](https://github.com/ErlonRr/gantryjs/tree/main/packages/angular).

Free and MIT licensed. Interactive drag & resize (mouse, touch and keyboard), dependency arrows
(FS/SS/FF/SF + lag), critical path, baselines, milestones, groups, virtual scrolling, zoom
gestures, sorting, lazy loading, loading / error / empty states, light/dark theming, i18n, and
accessibility (one tab stop per pane, ARIA, debounced announcements, forced colors).

## Install

```bash
npm i @gantryjs/vanilla
```

## Usage

```html
<gantry-element id="gantt" style="height: 500px"></gantry-element>

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
</script>
```

Give the element a height (it fills its container: `display: block; height: 100%`). That size
comes from the element's own `:host` style, so it applies once the element is defined: a page that
renders the tag before the script runs (server-side rendering, a deferred bundle) reserves the box
with one rule of its own:

```css
gantry-element:not(:defined) {
  display: block;
  width: 100%;
  height: 100%;
}
```

## Configuration

`options` accepts every `GanttOptions` field — header tiers & week formats, zoom presets,
period delimiters, weekends / holidays / working hours, bar & arrow sizes, panel splitter,
table view and saved state, the toolbar, legend and marker lane, the tooltip and the keyboard
shortcuts. See the full guide, [Configuration](https://github.com/ErlonRr/gantryjs#configuration), and in particular:

- [Toolbar, legend and markers](https://github.com/ErlonRr/gantryjs#toolbar-legend-and-markers),
  [Tooltip](https://github.com/ErlonRr/gantryjs#tooltip) and
  [Loading, error and empty states](https://github.com/ErlonRr/gantryjs#loading-error-and-empty-states);
- [Keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus),
  [Touch and pointer](https://github.com/ErlonRr/gantryjs#touch-and-pointer), [Zoom](https://github.com/ErlonRr/gantryjs#zoom),
  [Screen readers](https://github.com/ErlonRr/gantryjs#screen-readers) and [Forced colors](https://github.com/ErlonRr/gantryjs#forced-colors).

## Properties

| Property                      | Type                                                                          | Default  |                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tasks`                       | `GanttTask[]`                                                                 | `[]`     | Tasks (tree via `parentId`). Replace the array to update. Ignored while a `dataSource` is set.                            |
| `options`                     | `GanttOptions`                                                                | `{}`     | `viewMode`, `rowHeight`, `baseline`, `criticalPath`, `showToday`, `panelWidth`, `locale`, `labels`, `formats`, `theme`, … |
| `columns`                     | `VanillaColumnDef[]`                                                          | built-in | Left-panel columns (`options.columns` wins). `render(row)` returns text; `cellTemplate(row, ctx)` a DOM `Node` or text.   |
| `annotations`                 | `GanttAnnotation[]`                                                           | `[]`     | Highlighted date ranges / markers                                                                                         |
| `darkMode`                    | `boolean \| 'auto'`                                                           | `false`  | `'auto'` follows `prefers-color-scheme`                                                                                   |
| `showToolbar`                 | `boolean`                                                                     | `true`   | Zoom, _Fit_, zoom levels, _Today_ and the view switch (`options.toolbar`)                                                 |
| `enableDrag` / `enableResize` | `boolean`                                                                     | `true`   | Per task: `task.draggable = false`                                                                                        |
| `tooltipEnabled`              | `boolean`                                                                     | `true`   | Task tooltip on hover, keyboard focus and tap (`options.tooltip`)                                                         |
| `showLegend`                  | `boolean`                                                                     | `false`  | Legend strip: today marker, annotations, critical path and baseline (`options.legend`)                                    |
| `dataSource`                  | `{ fetcher(page, pageSize), pageSize?, initialPage?, retries?, retryDelay? }` | `null`   | Lazy paging (or a `GanttDataSource`); replaces `tasks` while set. A failed page shows Retry and pauses until `retry()`    |
| `renderBar`                   | `(ctx, renderDefault) => SVGElement \| null`                                  | —        | Replace or decorate a bar's SVG                                                                                           |
| `loading`                     | `boolean`                                                                     | `false`  | You are loading the tasks: a skeleton while there are no rows, `aria-busy` over rows already shown                        |
| `errorMessage`                | `string \| null`                                                              | `null`   | A non-blank message shows the error state with a Retry button (`retry` event); it wins over every other state             |

- Assigning `undefined` restores a property's default (`el.options = undefined`).
- Properties set before `<gantry-element>` is defined (an element created or parsed before the
  module loaded) are applied when it upgrades.
- Read-only: `viewMode` (the active zoom level), `view` (`'split' | 'table' | 'chart'`) and
  `criticalIds` (the tasks on the critical path).
- `GANTRY_PROPERTIES` lists the settable properties in this order (what the React / Vue / Svelte
  bindings forward).

### Attributes

| Attribute         | Property         | Value                                     |
| ----------------- | ---------------- | ----------------------------------------- |
| `dark-mode`       | `darkMode`       | present / `"true"`, `"false"` or `"auto"` |
| `show-toolbar`    | `showToolbar`    | present = `true`, `"false"` = `false`     |
| `enable-drag`     | `enableDrag`     | present = `true`, `"false"` = `false`     |
| `enable-resize`   | `enableResize`   | present = `true`, `"false"` = `false`     |
| `tooltip-enabled` | `tooltipEnabled` | present = `true`, `"false"` = `false`     |
| `show-legend`     | `showLegend`     | present = `true`, `"false"` = `false`     |
| `loading`         | `loading`        | present = `true`, `"false"` = `false`     |
| `error-message`   | `errorMessage`   | the message (a blank one shows no error)  |
| `view-mode`       | `setViewMode()`  | a `ViewMode` or a `zoomLevels` name       |

Removing an attribute restores the property's default (removing `view-mode` changes nothing).
The element never writes attributes back.

## Events

All are `CustomEvent`s (they bubble and cross the shadow boundary); the payload is in `event.detail`.

| Event                        | `detail`                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `task-dragged`               | `TaskDragEvent` — `{ taskId, oldStart, oldEnd, newStart, newEnd, daysMoved }`           |
| `task-resized`               | `TaskResizeEvent` — `{ taskId, handle, oldStart, oldEnd, newStart, newEnd, daysDelta }` |
| `selection-change`           | `{ selectedIds: string[] }`                                                             |
| `row-click` / `row-dblclick` | `GanttFlatRow`                                                                          |
| `view-mode-change`           | `{ viewMode }` — fired when the active zoom level changes                               |
| `state-change`               | `GanttState` — panel width / collapsed, view, zoom, column widths, collapsed rows, sort |
| `load-error`                 | `{ error, page }` — a data-source page failed after its automatic retries               |
| `retry`                      | `RetryEvent` — Retry pressed on the error state: `{ source: 'error' \| 'dataSource' }`  |

`retry` carries `{ source: 'error' }` for the `errorMessage` state (load again, then clear
`errorMessage`) and `{ source: 'dataSource' }` after a failed first data-source page (the element
also calls `dataSource.retry()`; a later page's Retry in the task-list footer only retries).

`addEventListener` is typed: `gantt.addEventListener('task-dragged', e => e.detail.daysMoved)`.
`GantryEventDetailMap` / `GantryEventMap` type the payloads, and `GANTRY_EVENTS` maps each event
to its binding callback name (`'task-dragged'` → `onTaskDragged`).

## Methods

| Method                                                                              |                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `zoomIn()` / `zoomOut()` / `setViewMode(mode)`                                      | Change the zoom level (a `ViewMode` or a `zoomLevels` name)                          |
| `fitToScreen()`                                                                     | Zoom to the finest level that shows every task, then scroll to the first one         |
| `setView('split' \| 'table' \| 'chart')` / `togglePanel()`                          | Switch view; `togglePanel()` collapses / expands the task list (restoring its width) |
| `scrollToToday(behavior?)` / `scrollToDate(date, behavior?)`                        | Centre a date in the timeline                                                        |
| `scrollToTask(id, behavior?)`                                                       | Scroll a task into view (both axes)                                                  |
| `getSelectedTasks()` / `setSelectedTasks(ids)` / `clearSelection()` / `selectAll()` | Selection                                                                            |
| `updateTask(id, patch)` / `appendTasks(tasks)`                                      | Edit or extend the task list                                                         |
| `collapseAll()` / `expandAll()`                                                     | Groups                                                                               |
| `setColumnVisible(key, visible, view?)` / `toggleColumnVisible(key, view?)`         | Column visibility in both views, or only `'split'` / `'table'`                       |
| `getState()` / `setState(state)`                                                    | UI state snapshot (see `state-change`)                                               |
| `getBarVisual(id)`                                                                  | A bar's computed geometry (e.g. to anchor a popover), also for rows out of view      |
| `setTheme(theme)` / `patchTheme(patch)` / `resetTheme()`                            | Replace / merge / drop the custom theme overrides (see [Theming](#theming))          |

## Slots

| Slot    | Content                                                                                |
| ------- | -------------------------------------------------------------------------------------- |
| `empty` | Shown in the empty state (no tasks and nothing loading) instead of `labels.emptyState` |

```html
<gantry-element>
  <div slot="empty">No tasks yet. <button type="button" id="add">Add one</button></div>
</gantry-element>
```

## Keyboard and focus

The element is not a tab stop itself: its shadow root delegates focus (`el.focus()` focuses the
first control inside). The tab stops, in order:

1. the toolbar: one stop, `←` / `→` (wrapping) and `Home` / `End` move between its controls,
   `Enter` / `Space` press a button or check a radio;
2. the task list (`role="treegrid"`): one stop, row first — `↑` / `↓`, `PgUp` / `PgDn`,
   `Home` / `End` move between rows (the header row is above the first), `→` / `←` expand or
   collapse a group or move into the cells and back, `Enter` activates a row or sorts a column,
   `Space` / `Shift+Space` / `Ctrl+Space` select;
3. the splitter (`.gantry-splitter-handle`, `role="separator"`: `←` / `→` resize the panel,
   `Enter` / `Space` collapse it), then its collapse toggle;
4. the bars (`role="option"` in the timeline's `listbox`): one stop — `↑` / `↓`, `PgUp` /
   `PgDn`, `Home` / `End` move between bars, `←` / `→` pan the timeline, `Space` selects, and
   `Enter` / `F2` start **move mode** (`←` / `→` move the bar, `Shift` / `Alt` + `←` / `→`
   resize its end / start, `Enter` commits with `task-dragged` / `task-resized`, `Escape`
   cancels). The timeline viewport is a tab stop only while no bar is mounted.

Anywhere inside: `Escape` cancels move mode or a drag, else closes the tooltip, else clears the
selection; `Ctrl/⌘ + A` selects all; `+` / `-` zoom, `T` scrolls to today and `F` fits the tasks
to the screen (off with `options.keyboard.characterShortcuts: false`). Shortcuts don't fire while
typing in an input or with `Alt` / `AltGr` held. Every stop shows a ring in `--gantt-focus-ring`
on keyboard focus; the focused bar's ring and resize grips are drawn over it. When the focused
control disappears, focus moves to the bars' tab stop (the viewport while none is mounted; in the
table view, the task list's tab-stop row).

The full key table is in [Keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus),
the pointer and touch gestures in [Touch and pointer](https://github.com/ErlonRr/gantryjs#touch-and-pointer)
and [Zoom](https://github.com/ErlonRr/gantryjs#zoom).

Screen readers: the host is a `region` named by `labels.ariaChart`, through `ElementInternals`
(engines without ARIA on `ElementInternals` get `role="region"` and `aria-label` host attributes
when the element connects; a `role` or `aria-label` you set wins), and `aria-busy` while the
chart loads. A polite live region (`.gantt-sr-live`, `role="status"`) announces selection, load,
zoom, expand / collapse and move-mode changes, debounced (250 ms, the last message wins);
errors go to `.gantt-sr-alert` (`role="alert"`). See
[Screen readers](https://github.com/ErlonRr/gantryjs#screen-readers).

## Theming

Pass any subset of `GanttTheme` via `options.theme` or `setTheme()` / `patchTheme()`
(colours, font, radii); `resetTheme()` drops what `setTheme()` / `patchTheme()` set, back to the
light / dark base plus `options.theme`. The resolved theme is written as `--gantt-*` CSS custom
properties into a `:host` stylesheet inside the element's shadow root, so page CSS on the element
overrides them and replacing the `style` attribute doesn't wipe them.

```css
gantry-element {
  --gantt-bar: #6366f1;
  --gantt-bar-text-on-bar: #ffffff; /* label colour on that fill */
}
```

- Bar labels on theme fills use the contrast tokens `--gantt-bar-text-on-bar`,
  `--gantt-bar-text-on-milestone` and `--gantt-bar-text-on-critical`, and the current-period
  header label uses `--gantt-today-label` (`todayColor`, darkened or lightened towards
  `textPrimary` until it reads 4.5:1 on its 14 % today tint). `setTheme()` recomputes them; when
  you override `--gantt-bar`, `--gantt-milestone`, `--gantt-critical` or `--gantt-today` in CSS,
  set the matching token too.
- Progress parts of theme-coloured bars use `--gantt-progress-overlay` (`progressOverlay`,
  `#000000`) at `bar.progress.opacity`; `task.progressColor` and `bar.progress.color` win.
- Every keyboard focus ring (toolbar, task list, splitter, viewport, the focused bar) is
  `--gantt-focus-ring` (`focusRing`: `#2563EB` light, `#60A5FA` dark); `--gantt-sel-border` is
  the outline of the selected bar and row. Light milestones are `#7C3AED` (`LegacyLightTheme`
  keeps `#8B5CF6`).
- `barRadius`, `fontSize` and `barTextColor` change the layout: set them with `setTheme()` /
  `options.theme`, not page CSS. With `darkMode: 'auto'` the chart re-renders when the OS colour
  scheme flips.
- A custom `renderBar` gets `ctx.visual.paint.{body,progress,label}`, which may be `var()`
  strings: apply them as style properties (`el.style.setProperty('fill', paint)`) or resolve them
  with `resolvePaint(paint, ctx.theme)`. The `renderDefault()` it receives paints with the
  `--gantt-*` variables, so its SVG needs them in scope (inside the element, or on an ancestor).
  The element gives the returned node its role, name, `tabindex` and `data-*` attributes, and
  draws its focus ring and resize grips (`ctx.visual.focusRect`, `ctx.visual.handles`) itself.
- **Forced colors** (Windows High Contrast): under `@media (forced-colors: active)` the chart
  paints with system colours — bars `ButtonFace` / `ButtonText`, critical bars dashed, selection,
  today and focus rings `Highlight`, lines `GrayText`. A custom `renderBar` SVG keeps its own
  paints unless it adds forced-colors rules of its own. See [Forced colors](https://github.com/ErlonRr/gantryjs#forced-colors).

### CSS custom properties

| Variable                  | Theme key          |     | Variable                        | Theme key                        |
| ------------------------- | ------------------ | --- | ------------------------------- | -------------------------------- |
| `--gantt-bg`              | `backgroundColor`  |     | `--gantt-arrow`                 | `arrowColor`                     |
| `--gantt-header-bg`       | `headerBackground` |     | `--gantt-tooltip-bg`            | `tooltipBg`                      |
| `--gantt-row-bg`          | `rowBg`            |     | `--gantt-tooltip-bdr`           | `tooltipBorder`                  |
| `--gantt-row-bg-alt`      | `rowBgAlt`         |     | `--gantt-tooltip-txt`           | `tooltipText`                    |
| `--gantt-bar`             | `barColor`         |     | `--gantt-sel-bg`                | `selectionBg`                    |
| `--gantt-bar-text`        | `barTextColor`     |     | `--gantt-sel-border`            | `selectionBorder`                |
| `--gantt-bar-radius`      | `barRadius`        |     | `--gantt-scrollbar-track`       | `scrollbarTrack`                 |
| `--gantt-milestone`       | `milestoneColor`   |     | `--gantt-scrollbar-thumb`       | `scrollbarThumb`                 |
| `--gantt-baseline`        | `baselineColor`    |     | `--gantt-weekend-bg`            | `weekendBg`                      |
| `--gantt-critical`        | `criticalColor`    |     | `--gantt-holiday-bg`            | `holidayBg`                      |
| `--gantt-panel-bg`        | `panelBg`          |     | `--gantt-off-hours-bg`          | `offHoursBg`                     |
| `--gantt-panel-border`    | `panelBorder`      |     | `--gantt-intensive-bg`          | `intensiveBg`                    |
| `--gantt-border`          | `borderColor`      |     | `--gantt-status-not-started`    | `statusNotStarted`               |
| `--gantt-grid-line`       | `gridLine`         |     | `--gantt-status-in-progress`    | `statusInProgress`               |
| `--gantt-grid-line-major` | `gridLineMajor`    |     | `--gantt-status-overdue`        | `statusOverdue`                  |
| `--gantt-today`           | `todayColor`       |     | `--gantt-status-done`           | `statusDone`                     |
| `--gantt-text`            | `textPrimary`      |     | `--gantt-progress-overlay`      | `progressOverlay`                |
| `--gantt-text-sec`        | `textSecondary`    |     | `--gantt-bar-text-on-bar`       | derived: label on a bar          |
| `--gantt-text-muted`      | `textMuted`        |     | `--gantt-bar-text-on-milestone` | derived: label on a milestone    |
| `--gantt-font`            | `fontFamily`       |     | `--gantt-bar-text-on-critical`  | derived: label on a critical bar |
| `--gantt-font-size`       | `fontSize`         |     | `--gantt-today-label`           | derived: current-period label    |
| `--gantt-focus-ring`      | `focusRing`        |     |                                 |                                  |

### Parts

| Part       | Element                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `wrapper`  | the root box (toolbar and panes)                                                          |
| `toolbar`  | the toolbar                                                                               |
| `panel`    | the task-list panel                                                                       |
| `splitter` | the splitter box (its handle is the `role="separator"` child)                             |
| `timeline` | the timeline viewport (header + chart, scrolls on both axes)                              |
| `legend`   | the legend (`showLegend`): a strip under the panes, or in the toolbar (`legend.position`) |
| `state`    | the loading / error / empty box over the chart body, attached while it shows              |

```css
gantry-element::part(toolbar) {
  border-bottom: 2px solid var(--gantt-border);
}
```

### Custom states

| State              | While                                             |
| ------------------ | ------------------------------------------------- |
| `:state(dark)`     | the dark theme is active (`darkMode` or `'auto'`) |
| `:state(dragging)` | a bar is dragged or resized                       |
| `:state(loading)`  | `loading` is on, or a data-source page is loading |

```css
gantry-element:state(dark) {
  outline-color: #475569;
}
```

The element sets no `data-theme` or `tabindex` attribute; use `:state(dark)`. Chromium 90–124 only
support the legacy `:--dark` syntax.

## Content Security Policy

The element works under a strict policy without `'unsafe-inline'`, `'unsafe-eval'` or Trusted
Types policies, e.g. `style-src 'self'; script-src 'self'; require-trusted-types-for 'script';
trusted-types 'none'`:

- its shadow tree is built node by node (no HTML parsing, no `innerHTML`);
- its CSS is one constructable stylesheet per document, shared by every instance, plus a
  per-instance theme sheet, both through `adoptedStyleSheets`;
- every style is a CSSOM property write; the host gets no `style` attribute.

A strict `style-src` needs constructable stylesheets (Chromium 73+, Firefox 101+, Safari 16.4+).
Older engines fall back to a `<style>` element in the shadow root and the theme variables on the
host's inline style, which needs `style-src 'unsafe-inline'`. There is no nonce option.

## Exports

`@gantryjs/vanilla` exports `GantryElement`, `GanttDataSource`, the tables `GANTRY_PROPERTIES` and
`GANTRY_EVENTS`, the types `GantryProperties`, `GantryEventDetailMap`, `GantryEventMap`,
`GantryEventCallbacks`, `GanttBarRenderer`, `GanttDataSourceConfig`, `VanillaColumnDef` and
`VanillaCellTemplate`, and everything in `@gantryjs/core` (model types, `LightTheme` / `DarkTheme`,
labels, date and theme helpers). Importing it registers `<gantry-element>`.

The package ships a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest)
(`custom-elements.json`, the `customElements` field of its `package.json`) describing the
element's attributes, properties, methods, events, parts, custom states and CSS custom
properties, for IDEs, Storybook and linters.

## i18n

Set `options.locale` (any BCP 47 tag; dates are formatted with `Intl`, nothing to import),
`options.labels` for any UI string, and `options.formats` for header/date formats.

## License

MIT
