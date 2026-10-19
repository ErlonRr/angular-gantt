// The example pages of the site: each one is a route (app.routes.ts) listed on /examples. The
// header imports EXAMPLES to keep "Examples" active on these routes.

export interface ExampleEntry {
  /** Route path, without the leading slash. */
  path: string;
  title: string;
  /** One line, under the title on the /examples card. */
  description: string;
  /** The options and APIs the example is about. */
  tags: readonly string[];
  /** The lead of the example page: one line (the chart below must start in the first viewport). */
  blurb: string;
  /** File name shown on the usage snippet. */
  file: string;
  /** Copy-pasteable usage snippet. */
  usage: string;
}

export const EXAMPLES: readonly ExampleEntry[] = [
  {
    path: 'roadmap',
    title: 'Product roadmap',
    description: 'Squads as groups, release milestones and custom panel columns.',
    tags: ['TaskType.Group', 'cellTemplate', 'baseline', 'locale', 'labels'],
    blurb: 'Squads as groups, release milestones, and Owner and Status columns from templates.',
    file: 'roadmap.component.ts',
    usage: `import { Component, computed, viewChild, type TemplateRef } from '@angular/core';
import { GantryComponent, type ColumnDef, type ColumnCellContext } from '@gantryjs/angular';

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
// <ng-container ganttColumn="owner" label="Owner" [width]="120">
//   <ng-template let-row>{{ row.task.data?.['owner'] }}</ng-template>
// </ng-container>`,
  },
  {
    path: 'demo',
    title: 'Project board',
    description: 'Dependencies with lag, baselines, the critical path and selection.',
    tags: ['dependency', 'criticalPath', 'baseline', '[(viewMode)]', 'selectionChange'],
    blurb: 'Dependencies with lag, baselines, the critical path, selection and two-way zoom.',
    file: 'board.component.ts',
    usage: `import { GantryComponent, type GanttTask, DependencyType, provideGantt } from '@gantryjs/angular';

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
    title: 'Lazy loading',
    description: '120 tasks fetched 25 at a time from a paged data source.',
    tags: ['GanttDataSource', 'pageSize', 'retries', 'loadError'],
    blurb: 'Rows load 25 at a time as you scroll. A failed page is retried, then offers Retry.',
    file: 'tasks.component.ts',
    usage: `import { GanttDataSource } from '@gantryjs/angular';

ds = new GanttDataSource({  // or createGanttDataSource({ … })
  fetcher: (page, size) =>
    fetch('/api/tasks?page=' + page + '&size=' + size).then(r => r.json()),
  pageSize: 25,  // a shorter page is the last one
  retries: 2,    // then ds.error() is set until ds.retry()
});

// signals: ds.items(), ds.loadedCount(), ds.isLoading(), ds.hasMore(), ds.error()
// methods: ds.loadNext(), ds.retry(), ds.reset()

// template — the next page loads as the last rows scroll into view
<gantry [dataSource]="ds" (loadError)="report($event.error)" />`,
  },
  {
    path: 'custom-bar',
    title: 'Custom bars',
    description: 'Your own Angular component draws a bar type.',
    tags: ['provideGanttBar', 'GanttBarBase', 'barType'],
    blurb: 'provideGanttBar turns your own Angular component into a bar type, picked per task.',
    file: 'plan.component.ts',
    usage: `import { GanttBarBase, provideGanttBar } from '@gantryjs/angular';

@Component({
  selector: 'g[epicBar]',
  template: \`<svg:rect [attr.x]="geo().barX" [attr.y]="geo().y + 5"
    [attr.width]="geo().barWidth" [attr.height]="geo().height - 10" rx="6" fill="#4f46e5" />\`,
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

/** The example of a route path ("roadmap"). */
export function exampleAt(path: string): ExampleEntry {
  const found = EXAMPLES.find(e => e.path === path);
  if (!found) throw new Error(`No example at /${path}`);
  return found;
}
