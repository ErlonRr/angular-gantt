# Gantry — `@gantryjs/angular`

> A free, **zoneless**, **signal-based** Gantt chart for **Angular 22+**.
> Zero `@angular/animations`, zero CDK, zero RxJS — no runtime dependency besides `@gantryjs/core`.
> Formerly published as `ngx-gantry` (1.x).

![Gantry Banner](https://raw.githubusercontent.com/ErlonRr/gantryjs/main/assets/gantry-banner.png)

![Gantry Showcase Demo](https://raw.githubusercontent.com/ErlonRr/gantryjs/main/assets/gantry-demo.gif)

```bash
npm i @gantryjs/angular
```

Peer dependencies: `@angular/core` and `@angular/common` `^22.0.0`.

## Quick start (standalone)

```ts
// app.component.ts
import { Component, signal } from '@angular/core';
import { GantryComponent, ViewMode, type GanttTask } from '@gantryjs/angular';

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
    />
  `,
})
export class AppComponent {
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
}
```

No provider is needed. `provideGantt()` optionally sets defaults (theme, dark mode, locale, labels,
formats, custom bars) for every chart below the application, route or component it is provided in:

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

## Features

- Groups, milestones, collapse/expand, per-row styling
- Dependencies (`FS` / `FF` / `SS` / `SF` + lag) and full **critical path**
- Baselines, progress, one native-popover tooltip per chart: on hover, keyboard focus and tap,
  anchored to its bar, custom content with `<ng-template ganttTooltip>` or `options.tooltip.render`
- Drag & resize via Pointer Events (per-task opt-out): a 3 px mouse threshold, a 350 ms touch
  long-press, auto-scroll at the edges, 24 px resize targets (`bar.handles.hitSize`)
- Keyboard: one tab stop each for the toolbar, the task list (row-first treegrid) and the bars;
  keyboard move / resize mode (`Enter` / `F2`); `+` `-` `T` `F` shortcuts
  (`keyboard.characterShortcuts`)
- Editing (`options.editing`): cell editors (`<ng-template ganttCellEditor>` for your own), a progress grip, links drawn
  from a bar's connector, undo / redo, a cancelable `(beforeChange)` and `[(series)]`
- Export and print: `exportSvg()`, `exportPng()`, `exportCsv()`, `download(format)` and `print()` (every row, the
  header and task list on every printed page), a toolbar Export menu (`toolbar.export`) and a cancelable
  `(beforeExport)` — see below
- Zoom with the toolbar, the keys, Ctrl/⌘ + wheel or a pinch (anchored at the pointer), and
  `fitToScreen()` / the Fit button
- Chart states: `[loading]` skeleton, `[errorMessage]` with Retry (`(retry)`), `[ganttEmpty]`
  content
- Selection: single / Ctrl-click / Shift-range / keyboard
- Custom bars (`GanttBarBase` + `provideGanttBar` at application, route or component level) and
  custom panel columns (`ganttColumn` definitions with an `<ng-template let-row>` cell)
- Lazy loading (`GanttDataSource`: paging, automatic retries, error state with Retry, `loadError` output)
- Views: Hour / Day / Week / Month / Quarter / Year with zoom, two-way `[(viewMode)]`
- Rows windowed vertically, header cells, bands and grid lines horizontally
- Annotations, today marker, a marker lane for their labels (`markers.lane`), an optional legend
  strip (`legend.position`)
- Light / dark / auto theming via CSS custom properties
- Accessible: a `region` landmark with internal tab stops, `treegrid` task list, bars as a
  `listbox` (custom bars too), debounced live regions, forced-colors support, WCAG 2.2 AA palette
- SSR-safe: no browser globals, browser work starts after the first render
- **i18n** — localisable UI strings + any BCP 47 `locale` (via `Intl`) + custom date/header formats

## Export and print

```ts
import { Component, viewChild } from '@angular/core';
import { GantryComponent, type GanttDownloadOptions, type GanttExportEvent } from '@gantryjs/angular';

@Component({
  selector: 'app-plan',
  imports: [GantryComponent],
  template: `
    <button type="button" (click)="save()">Save PNG</button>
    <button type="button" (click)="chart().print({ paper: 'letter' })">Print</button>
    <gantry
      [series]="tasks"
      [options]="{ toolbar: { export: true }, export: { fileName: 'roadmap' } }"
      (beforeExport)="$event.format === 'csv' && $event.preventDefault()"
      (export)="saved($event)"
    />
  `,
})
export class PlanComponent {
  readonly chart = viewChild.required(GantryComponent);
  // …tasks

  async save(): Promise<void> {
    const options: GanttDownloadOptions = { theme: 'light', fileName: 'plan' };
    await this.chart().download('png', options); // false when (beforeExport) vetoed it
  }

  saved(e: GanttExportEvent): void {
    console.log(e.fileName ?? `${e.pages} pages`, e.size);
  }
}
```

The methods are async: `exportSvg()` / `exportCsv()` resolve text, `exportPng()` a Blob, `download()` and `print()`
whether they ran. Exports are drawn from the chart's model (every row, not only the mounted ones) and give the same
SVG and CSV as `<gantry-element>`. `download()` and `print()`, from your code or the toolbar's Export menu, emit
`(beforeExport)` first (call `$event.preventDefault()` synchronously to cancel), then `(export)`. Custom bar
components are rendered off-screen once each and saved as drawn: only attributes and inline styles travel, not the
component's `styles` (bind `[attr.fill]`, or pass `customBars: 'builtin'`). During server rendering `exportSvg()` and
`exportCsv()` work (custom bars drawn as built-in); `exportPng()`, `download()` and `print()` need a browser. Options,
defaults and limits: [Export and print](https://github.com/ErlonRr/gantryjs#export-and-print).

## i18n

```ts
<gantry [options]="{ locale: 'it', labels: { todayButton: 'Oggi' } }" />
```

## Documentation & source

Every option is documented once, for every binding, in the
[Configuration](https://github.com/ErlonRr/gantryjs#configuration) section of the main README.
The Angular API:

- [Quick start](https://github.com/ErlonRr/gantryjs#quick-start-standalone) and
  [providers & setup](https://github.com/ErlonRr/gantryjs#providers--setup)
- [Custom bars](https://github.com/ErlonRr/gantryjs#custom-bar-component) and
  [custom columns](https://github.com/ErlonRr/gantryjs#custom-columns-left-panel)
- [Lazy loading](https://github.com/ErlonRr/gantryjs#lazy-load-with-ganttdatasource)
- [Editing](https://github.com/ErlonRr/gantryjs#editing): events, controlled mode, cells, links and undo
- [Export and print](https://github.com/ErlonRr/gantryjs#export-and-print): SVG, PNG, CSV, paginated print, the
  toolbar's Export menu, `(beforeExport)` / `(export)` and server-side exports
- [Inputs & Outputs](https://github.com/ErlonRr/gantryjs#inputs--outputs), the
  [public API](https://github.com/ErlonRr/gantryjs#public-api) and the
  [content slots](https://github.com/ErlonRr/gantryjs#ng-content-slots)
- [Synchronised charts](https://github.com/ErlonRr/gantryjs#synchronised-charts) (`[syncGroup]`),
  [task styles](https://github.com/ErlonRr/gantryjs#task-styles) and
  [responsive layout and density](https://github.com/ErlonRr/gantryjs#responsive-layout-and-density)
- [Tooltip](https://github.com/ErlonRr/gantryjs#tooltip) and
  [loading, error and empty states](https://github.com/ErlonRr/gantryjs#loading-error-and-empty-states)
- [Theming](https://github.com/ErlonRr/gantryjs#theming-1),
  [keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus),
  [touch and pointer](https://github.com/ErlonRr/gantryjs#touch-and-pointer), [zoom](https://github.com/ErlonRr/gantryjs#zoom),
  [screen readers](https://github.com/ErlonRr/gantryjs#screen-readers), [forced colors](https://github.com/ErlonRr/gantryjs#forced-colors) and
  [server-side rendering](https://github.com/ErlonRr/gantryjs#server-side-rendering)
- [Coming from ngx-gantry 1.x](https://github.com/ErlonRr/gantryjs#coming-from-ngx-gantry-1x)

Demos and issues: **https://github.com/ErlonRr/gantryjs**

## License

[MIT](https://github.com/ErlonRr/gantryjs/blob/main/LICENSE) © Erlon Rrustemaj

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
