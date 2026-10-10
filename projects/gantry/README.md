# Gantry — `ngx-gantry`

> A free, **zoneless**, **signal-based** Gantt chart for **Angular 22+**.
> Zero `@angular/animations`, zero CDK, zero RxJS — only `dayjs`.

![Gantry Banner](https://raw.githubusercontent.com/ErlonRr/angular-gantt/main/assets/angular-gantt.png)

![Gantry Showcase Demo](https://raw.githubusercontent.com/ErlonRr/angular-gantt/main/assets/angular-gantt.gif)

```bash
npm i ngx-gantry
```

Peer dependencies: `@angular/core` and `@angular/common` `>= 20.2`.

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
import { Component } from '@angular/core';
import { GantryComponent, GanttTask } from 'ngx-gantry';

@Component({
  selector: 'app-root',
  imports: [GantryComponent],
  template: `
    <gantry [series]="tasks" [options]="{ viewMode: 'Month', rowHeight: 36, baseline: true }" [showLegend]="true" />
  `,
})
export class AppComponent {
  tasks: GanttTask[] = [
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

## Features

- Groups, milestones, collapse/expand, per-row styling
- Dependencies (`FS` / `FF` / `SS` / `SF` + lag) and full **critical path**
- Baselines, progress, native-Popover tooltips
- Drag & resize via Pointer Events (per-task opt-out)
- Selection: single / Ctrl-click / Shift-range / keyboard
- Custom bars (`provideGanttBar`) and custom panel columns (`<ng-template ganttColumn>`)
- Lazy loading (`GanttDataSource`: paging, automatic retries, error state with Retry, `loadError` output)
- Views: Day / Week / Month / Quarter / Year with zoom
- Annotations, today marker, optional legend
- Light / dark / auto theming via CSS custom properties
- **i18n** — localisable UI strings + dayjs `locale` + custom date/header formats

## i18n

```ts
import 'dayjs/locale/it';
<gantry [options]="{ locale: 'it', labels: { todayButton: 'Oggi' } }" />
```

## Documentation & source

Full docs, demos and issues:
**https://github.com/ErlonRr/angular-gantt**

## License

[MIT](https://github.com/ErlonRr/angular-gantt/blob/main/LICENSE) © Erlon Rrustemaj

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
