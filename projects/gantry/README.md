# Gantry — `ngx-gantry`

> A free, **zoneless**, **signal-based** Gantt chart for **Angular 20+**.
> Zero `@angular/animations`, zero CDK, zero RxJS — only `dayjs`.

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
  providers: [
    provideZonelessChangeDetection(),
    provideGanttLib({ darkMode: 'auto' }),
  ],
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
    <gantry
      [series]="tasks"
      [options]="{ viewMode: 'Month', rowHeight: 36, baseline: true }"
      [showLegend]="true"
    />
  `,
})
export class AppComponent {
  tasks: GanttTask[] = [
    { id: '1', name: 'Discovery', start: new Date('2026-01-05'), end: new Date('2026-01-31'), progress: 100 },
    { id: '2', name: 'Build', start: new Date('2026-02-01'), end: new Date('2026-03-15'), progress: 40, dependency: '1' },
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
- Lazy loading (`createGanttDataSource` — `resource()` + `linkedSignal`)
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
