# Gantry — `ngx-gantry`

> A free, **zoneless**, **signal-based** Gantt chart for **Angular 22+**.
> Zero `@angular/animations`, zero CDK, zero RxJS — no runtime dependency besides `@gantryjs/core`.

![Gantry Banner](https://raw.githubusercontent.com/ErlonRr/gantryjs/main/assets/gantry-banner.png)

![Gantry Showcase Demo](https://raw.githubusercontent.com/ErlonRr/gantryjs/main/assets/gantry-demo.gif)

```bash
npm i ngx-gantry
```

Peer dependencies: `@angular/core` and `@angular/common` `^22.0.0`.

## Quick start (standalone)

```ts
// app.component.ts
import { Component, signal } from '@angular/core';
import { GantryComponent, ViewMode, type GanttTask } from 'ngx-gantry';

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
import { provideGantt } from 'ngx-gantry';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideGantt({ darkMode: 'auto', locale: 'it' })],
});
```

## Features

- Groups, milestones, collapse/expand, per-row styling
- Dependencies (`FS` / `FF` / `SS` / `SF` + lag) and full **critical path**
- Baselines, progress, one native-popover tooltip per chart
- Drag & resize via Pointer Events (per-task opt-out)
- Selection: single / Ctrl-click / Shift-range / keyboard
- Custom bars (`GanttBarBase` + `provideGanttBar` at application, route or component level) and
  custom panel columns (`<ng-template ganttColumn>`)
- Lazy loading (`GanttDataSource`: paging, automatic retries, error state with Retry, `loadError` output)
- Views: Hour / Day / Week / Month / Quarter / Year with zoom, two-way `[(viewMode)]`
- Rows windowed vertically, header cells, bands and grid lines horizontally
- Annotations, today marker, optional legend
- Light / dark / auto theming via CSS custom properties
- Accessible: a `region` landmark with internal tab stops, `treegrid` task list, live regions,
  WCAG 2.2 AA palette
- SSR-safe: no browser globals, browser work starts after the first render
- **i18n** — localisable UI strings + any BCP 47 `locale` (via `Intl`) + custom date/header formats

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
- [Inputs & Outputs](https://github.com/ErlonRr/gantryjs#inputs--outputs) and the
  [public API](https://github.com/ErlonRr/gantryjs#public-api)
- [Theming](https://github.com/ErlonRr/gantryjs#theming-1),
  [keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus) and
  [server-side rendering](https://github.com/ErlonRr/gantryjs#server-side-rendering)
- [Upgrading from 1.x](https://github.com/ErlonRr/gantryjs#upgrading-from-1x)

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
