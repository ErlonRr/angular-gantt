// ─────────────────────────────────────────────────────────────
//  gantry-demo · shell/demo-registry.ts
//
//  Single list of demos surfaced in the IDE-style sidebar and the
//  "usage" docs panel. Add a demo here + a matching route in
//  app.routes.ts — the shell picks it up automatically.
// ─────────────────────────────────────────────────────────────

export const PACKAGE_NAME = 'ngx-gantry';
export const INSTALL_CMD = 'npm i ngx-gantry';
export const REPO_URL = 'https://github.com/ErlonRr/angular-gantt';
export const NPM_URL = 'https://www.npmjs.com/package/ngx-gantry';
export const DOCS_URL = 'https://github.com/ErlonRr/angular-gantt#readme';

export interface DemoEntry {
  /** Route path (without leading slash) */
  path: string;
  /** Sidebar label */
  label: string;
  /** One-line description shown under the label */
  description: string;
  /** Glyph shown in the leading badge */
  icon: string;
  /** Grouping bucket */
  category: DemoCategory;
  /** Longer "what this shows" blurb for the usage panel */
  blurb: string;
  /** Copy-pasteable usage snippet */
  usage: string;
}

export type DemoCategory = 'Showcase' | 'Core' | 'Performance' | 'Extensibility';

/** Category display order in the sidebar */
export const DEMO_CATEGORY_ORDER: DemoCategory[] = ['Showcase', 'Core', 'Performance', 'Extensibility'];

export const DEMOS: DemoEntry[] = [
  {
    path: 'roadmap',
    label: 'Product roadmap',
    description: 'Squads · milestones · custom columns',
    icon: '★',
    category: 'Showcase',
    blurb:
      'Groups (squads), release milestones, dependencies and baselines, plus rich custom panel columns (owner avatar + status badge) and a live EN/IT locale switch.',
    usage: `import { Component, computed, viewChild, type TemplateRef } from '@angular/core';
import { GantryComponent, type ColumnDef, type ColumnCellContext } from 'ngx-gantry';

@Component({
  imports: [GantryComponent],
  template: \`
    <ng-template #statusCell let-row>
      <span class="badge">{{ row.task.data?.['status'] }}</span>
    </ng-template>

    <gantry [series]="tasks" [columns]="columns()"
            [options]="{ locale: 'it' }" showLegend />
  \`,
})
export class Roadmap {
  statusTpl = viewChild<TemplateRef<ColumnCellContext>>('statusCell');
  columns = computed<ColumnDef[]>(() => [
    { key: 'name',   label: 'Initiative', width: 210 },
    { key: 'status', label: 'Status', width: 100, cellTemplate: this.statusTpl() },
  ]);
}

// Or declare a column inside <gantry> (GanttColumnDefDirective):
// <ng-template ganttColumn="owner" label="Owner" [width]="120">
//   <ng-template let-row>{{ row.task.data?.['owner'] }}</ng-template>
// </ng-template>`,
  },
  {
    path: 'demo',
    label: 'Project board',
    description: 'Dependencies · baseline · critical path',
    icon: '▦',
    category: 'Core',
    blurb:
      'The everyday board: task tree with groups & milestones, FS/FF/SS/SF dependencies with lag, baselines, the critical path, annotations, drag & resize, selection, and a two-way [(viewMode)] zoom level.',
    usage: `import { GantryComponent, type GanttTask, DependencyType, provideGantt } from 'ngx-gantry';

// main.ts (optional: built-in bars need no provider) — defaults for every chart
bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideGantt({ darkMode: 'auto' })] });

tasks: GanttTask[] = [
  { id: 'a', name: 'Discovery', start: new Date('2026-01-05'), end: new Date('2026-01-31'), progress: 100 },
  { id: 'b', name: 'Build', start: new Date('2026-02-01'), end: new Date('2026-03-15'),
    dependency: { taskId: 'a', type: DependencyType.FS, lag: 2 },
    baseline: { start: new Date('2026-02-01'), end: new Date('2026-03-01') } },
];
// two-way zoom level: the toolbar, + / - and setViewMode() write it back
zoom = signal<string | undefined>('Month');

// template — boolean inputs accept attributes (showLegend = [showLegend]="true")
<gantry [series]="tasks" [(viewMode)]="zoom"
        [options]="{ baseline: true, criticalPath: true }"
        showLegend />`,
  },
  {
    path: 'lazy',
    label: 'Lazy load',
    description: '120 tasks · paginated datasource',
    icon: '⚡',
    category: 'Performance',
    blurb:
      'A paginated data source (the shared core PagedLoader, exposed as signals) with auto/manual "load more" — fetches rows on demand instead of loading everything up front.',
    usage: `import { createGanttDataSource } from 'ngx-gantry';

ds = createGanttDataSource({  // same as new GanttDataSource({ … })
  fetcher: (page, size) =>
    fetch('/api/tasks?page=' + page + '&size=' + size).then(r => r.json()),
  pageSize: 25,  // a shorter page is the last one
  retries: 2,    // then ds.error() is set until ds.retry()
});

// template — the next page loads as the last rows scroll into view
<gantry [dataSource]="ds" (loadError)="report($event.error)" />`,
  },
  {
    path: 'custom-bar',
    label: 'Custom bars',
    description: 'provideGanttBar · custom epic bars',
    icon: '◆',
    category: 'Extensibility',
    blurb:
      'Plug any Angular component in as a bar type with provideGanttBar — here an "epic" bar drawn with your own SVG, provided for this page only and selected per task with barType.',
    usage: `import { GanttBarBase, provideGanttBar } from 'ngx-gantry';

@Component({
  selector: 'g[epicBar]',
  template: \`<svg:rect [attr.x]="geo().barX" [attr.y]="geo().y + 5"
    [attr.width]="geo().barWidth" [attr.height]="geo().height - 10" rx="6" fill="#6366F1" />\`,
})
export class EpicBar extends GanttBarBase {
  // GanttBarBase declares the ctx input: row, geometry, core visual, theme, state
  geo = computed(() => this.ctx().geometry);
}

@Component({
  // this page only (also: a route's providers or bootstrapApplication); the nearest level wins
  providers: [provideGanttBar({ type: 'epic', component: EpicBar })],
  template: \`<gantry [series]="tasks" />\`,
})
export class PlanPage {
  tasks = [{ id: 'e1', name: 'Payments', barType: 'epic', start, end }];
}`,
  },
];

/** Resolve the active demo from a router URL (e.g. "/roadmap"). */
export function demoForUrl(url: string): DemoEntry | undefined {
  const path = url.split('?')[0].split('#')[0].replace(/^\//, '');
  return DEMOS.find(d => d.path === path);
}
