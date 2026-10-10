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
    usage: `import { GantryComponent, ColumnDef, ColumnCellContext } from 'ngx-gantry';

@Component({
  imports: [GantryComponent],
  template: \`
    <ng-template #statusCell let-row>
      <span class="badge">{{ row.task.data?.['status'] }}</span>
    </ng-template>

    <gantry [series]="tasks" [columns]="columns()"
            [options]="{ locale: 'it' }" [showLegend]="true" />
  \`,
})
export class Roadmap {
  statusTpl = viewChild<TemplateRef<ColumnCellContext>>('statusCell');
  columns = computed<ColumnDef[]>(() => [
    { key: 'name',   label: 'Initiative', width: 210 },
    { key: 'status', label: 'Status', width: 100, cellTemplate: this.statusTpl() },
  ]);
}`,
  },
  {
    path: 'demo',
    label: 'Project board',
    description: 'Dependencies · baseline · critical path',
    icon: '▦',
    category: 'Core',
    blurb:
      'The everyday board: task tree with groups & milestones, FS/FF/SS/SF dependencies with lag, baselines, the critical path, annotations, drag & resize, and selection.',
    usage: `import { GantryComponent, GanttTask, DependencyType } from 'ngx-gantry';

tasks: GanttTask[] = [
  { id: 'a', name: 'Discovery', start: new Date('2026-01-05'), end: new Date('2026-01-31'), progress: 100 },
  { id: 'b', name: 'Build', start: new Date('2026-02-01'), end: new Date('2026-03-15'),
    dependency: { taskId: 'a', type: DependencyType.FS, lag: 2 },
    baseline: { start: new Date('2026-02-01'), end: new Date('2026-03-01') } },
];

// template
<gantry [series]="tasks"
        [options]="{ baseline: true, criticalPath: true }"
        [showLegend]="true" />`,
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

ds = createGanttDataSource({
  fetcher: (page, size) =>
    fetch('/api/tasks?page=' + page + '&size=' + size).then(r => r.json()),
  pageSize: 25,
});

// template
<gantry [dataSource]="ds" />`,
  },
  {
    path: 'custom-bar',
    label: 'Custom bars',
    description: 'Bar registry · custom epic bars',
    icon: '◆',
    category: 'Extensibility',
    blurb:
      'Plug any Angular component in as a bar type via the bar registry — here an "epic" bar drawn with your own SVG, selected per task with barType.',
    usage: `import { GanttBarBase, GanttBarContext, provideGanttBar } from 'ngx-gantry';

@Component({
  selector: 'g[epicBar]',
  template: \`<svg:rect [attr.x]="geo().barX" [attr.y]="geo().y + 5"
    [attr.width]="geo().barWidth" [attr.height]="geo().height - 10" rx="6" fill="#6366F1" />\`,
})
export class EpicBar extends GanttBarBase {
  ctx = input.required<GanttBarContext>();
  geo = computed(() => this.ctx().geometry);
  override get context() { return this.ctx(); }
}

// providers:  provideGanttBar({ type: 'epic', component: EpicBar })
// task data:  { id: 'e1', barType: 'epic', /* … */ }`,
  },
];

/** Resolve the active demo from a router URL (e.g. "/roadmap"). */
export function demoForUrl(url: string): DemoEntry | undefined {
  const path = url.split('?')[0].split('#')[0].replace(/^\//, '');
  return DEMOS.find(d => d.path === path);
}
