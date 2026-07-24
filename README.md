# Gantry

> Angular 20+ Gantt chart library — 100% free, zoneless, signal-based, zero @angular/animations.
> Package: `gantry` · component: `<gantry>`.

## Features

| Feature | Detail |
|---|---|
| **Signals** | All state via `signal()` / `computed()` / `effect()` — no RxJS |
| **Zoneless** | Works with `provideZonelessChangeDetection()` |
| **Bar registry** | Plug in any custom bar component via `provideGanttBar()` |
| **Virtual scroll** | `IntersectionObserver`-based, zero CDK |
| **Lazy load** | Angular 20 `resource()` + `linkedSignal` accumulation |
| **Drag & resize** | Pointer Events API + `setPointerCapture()` |
| **Selection** | Single / Ctrl+Click toggle / Shift+Click range |
| **Keyboard** | `Escape`, `Ctrl+A`, `+/-` zoom, `T` today |
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
import { provideGanttLib } from 'gantry';
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
import { GantryComponent, GanttTask, ViewMode } from 'gantry';

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
import { GanttModule } from 'gantry';

@NgModule({
  imports: [GanttModule.forRoot({ darkMode: 'auto' })],
})
export class AppModule {}
```

---

## Custom bar component

```ts
import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { GanttBarBase, GanttBarContext, provideGanttBar } from 'gantry';

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

## Development tooling

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

Zero `zone.js` required. Zero `@angular/animations`. Zero CDK (tooltip uses native Popover API).
