import {
  ChangeDetectionStrategy, Component, signal, viewChild, inject,
} from '@angular/core';
import {
  GantryComponent, GanttTask, GanttAnnotation,
  TaskType, DependencyType, ViewMode, GanttOptions,
  TaskDragEvent, TaskResizeEvent, SelectionChangeEvent,
} from 'ngx-gantry';
import { AppThemeService } from '../shell/app-theme.service';

// ── helpers ──────────────────────────────────────────────────
const d = (iso: string) => new Date(iso);

const TASKS: GanttTask[] = [
  {
    id: 'p1', name: 'Project Alpha', type: TaskType.Group,
    start: d('2026-01-05'), end: d('2026-05-30'),
    progress: 48, barColor: '#6366F1',
  },
  {
    id: 'p1-a', name: 'Discovery', parentId: 'p1',
    start: d('2026-01-05'), end: d('2026-01-31'), progress: 100,
    baseline: { start: d('2026-01-05'), end: d('2026-02-07') },
  },
  {
    id: 'p1-b', name: 'Architecture', parentId: 'p1',
    start: d('2026-01-20'), end: d('2026-02-20'), progress: 90,
    dependency: 'p1-a',
    baseline: { start: d('2026-01-25'), end: d('2026-02-25') },
  },
  {
    id: 'p1-b1', name: 'Backend', parentId: 'p1-b',
    start: d('2026-02-10'), end: d('2026-03-20'), progress: 65,
    dependency: 'p1-b',
  },
  {
    id: 'p1-b2', name: 'Frontend', parentId: 'p1-b',
    start: d('2026-02-20'), end: d('2026-04-01'), progress: 30,
    dependency: { taskId: 'p1-b', type: DependencyType.SS, lag: 10 },
  },
  {
    id: 'p1-c', name: 'QA & Testing', parentId: 'p1',
    start: d('2026-03-25'), end: d('2026-04-25'), progress: 0,
    dependency: [
      { taskId: 'p1-b1', type: DependencyType.FS },
      { taskId: 'p1-b2', type: DependencyType.FS },
    ] as any,
  },
  {
    id: 'ms-p1', name: 'v1.0 Release', parentId: 'p1',
    type: TaskType.Milestone,
    start: d('2026-05-15'), end: d('2026-05-15'),
    progress: 0, dependency: 'p1-c', barColor: '#F59E0B',
  },
  {
    id: 'p2', name: 'Project Beta', type: TaskType.Group,
    start: d('2026-03-01'), end: d('2026-07-31'),
    progress: 22, barColor: '#10B981',
  },
  {
    id: 'p2-a', name: 'Research', parentId: 'p2',
    start: d('2026-03-01'), end: d('2026-03-31'), progress: 100,
  },
  {
    id: 'p2-b', name: 'Prototype', parentId: 'p2',
    start: d('2026-04-01'), end: d('2026-05-15'), progress: 45,
    dependency: 'p2-a',
    baseline: { start: d('2026-04-01'), end: d('2026-05-01') },
  },
  {
    id: 'p2-c', name: 'User testing', parentId: 'p2',
    start: d('2026-05-10'), end: d('2026-06-10'), progress: 5,
    dependency: 'p2-b',
  },
  {
    id: 'ms-p2', name: 'Beta launch', parentId: 'p2',
    type: TaskType.Milestone,
    start: d('2026-07-15'), end: d('2026-07-15'),
    progress: 0, dependency: 'p2-c', barColor: '#10B981',
  },
];

const ANNOTATIONS: GanttAnnotation[] = [
  {
    x1:    d('2026-03-02'),
    x2:    d('2026-03-06'),
    color: '#8B5CF6',
    opacity: 0.07,
    label: { text: 'Code freeze', color: '#8B5CF6', fontWeight: '600' },
  },
  {
    x1:    d('2026-04-20'),
    color: '#EF4444',
    label: { text: 'Board review', color: '#EF4444' },
  },
];

@Component({
  selector: 'app-gantt-demo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="demo-bar">
      <div class="demo-group">
        <span class="demo-label">Features</span>
        <button [class.on]="opts().baseline"     (click)="toggle('baseline')">Baseline</button>
        <button [class.on]="opts().criticalPath" (click)="toggle('criticalPath')">Critical path</button>
      </div>
      <div class="demo-group">
        <span class="demo-label">Tasks</span>
        <button (click)="addTask()">+ Add</button>
        <button (click)="gantt().collapseAll()">Collapse all</button>
        <button (click)="gantt().expandAll()">Expand all</button>
      </div>
      <div class="demo-group">
        <span class="demo-label">Selection</span>
        <button (click)="gantt().selectAll()">Select all</button>
        <button (click)="gantt().clearSelection()">Clear</button>
        <span class="demo-badge">{{ selCount() }}</span>
      </div>
      <div class="demo-event">{{ lastEvent() }}</div>
    </div>

    <gantry
      #ganttRef
      [series]="tasks()"
      [options]="opts()"
      [annotations]="annotations"
      [darkMode]="theme.mode()"
      [showToolbar]="true"
      [enableDrag]="true"
      [enableResize]="true"
      [tooltipEnabled]="true"
      [showLegend]="true"
      (taskDragged)="onDrag($event)"
      (taskResized)="onResize($event)"
      (selectionChange)="onSel($event)"
    />
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .demo-bar {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      padding: 8px 14px; background: hsl(var(--card));
      border-bottom: 1px solid hsl(var(--border)); flex-shrink: 0;
    }
    .demo-group { display: flex; align-items: center; gap: 5px; }
    .demo-label {
      font-family: var(--app-font-mono);
      font-size: 10px; color: hsl(var(--muted-fg)); font-weight: 600;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .demo-bar button {
      padding: 4px 10px; font-size: 12px; border-radius: var(--app-radius-sm); cursor: pointer;
      background: hsl(var(--muted)); color: hsl(var(--fg)); border: 1px solid hsl(var(--border));
      transition: background .1s;
    }
    .demo-bar button:hover { background: hsl(var(--accent)); }
    .demo-bar button.on   { background: hsl(var(--primary)); border-color: hsl(var(--primary)); color: hsl(var(--primary-fg)); }
    .demo-badge {
      padding: 2px 8px; background: hsl(var(--primary)); color: hsl(var(--primary-fg));
      border-radius: 10px; font-size: 12px; min-width: 22px; text-align: center;
    }
    .demo-event {
      margin-left: auto; font-family: var(--app-font-mono);
      font-size: 11px; color: hsl(var(--muted-fg));
      max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    gantry { flex: 1; min-height: 0; }
  `],
})
export class GanttDemoComponent {
  protected readonly gantt = viewChild.required<GantryComponent>('ganttRef');
  protected readonly theme = inject(AppThemeService);

  readonly tasks     = signal<GanttTask[]>(TASKS);
  readonly selCount  = signal(0);
  readonly lastEvent = signal('—');
  readonly annotations = ANNOTATIONS;

  private readonly _opts = signal<GanttOptions>({
    viewMode:       ViewMode.Month,
    rowHeight:      36,
    baseline:       true,
    criticalPath:   false,
    showToday:      true,
    panelVisible:   true,
    enableDrag:     true,
    enableResize:   true,
    enableSelection: true,
  });
  readonly opts = this._opts.asReadonly();

  toggle(key: keyof GanttOptions) {
    this._opts.update(o => ({ ...o, [key]: !o[key as keyof typeof o] }));
  }

  addTask() {
    const id  = `task-${Date.now()}`;
    const start = new Date();
    const end   = new Date(start.getTime() + 14 * 86400000);
    this.tasks.update(ts => [...ts, {
      id, name: `New task ${id.slice(-4)}`, parentId: 'p1', start, end, progress: 0,
    }]);
    this.lastEvent.set(`Added: ${id}`);
  }

  onDrag(e: TaskDragEvent) {
    this.lastEvent.set(`Drag: ${e.taskId} ${e.daysMoved > 0 ? '+' : ''}${e.daysMoved}d`);
  }
  onResize(e: TaskResizeEvent) {
    this.lastEvent.set(`Resize [${e.handle}]: ${e.taskId} ${e.daysDelta > 0 ? '+' : ''}${e.daysDelta}d`);
  }
  onSel(e: SelectionChangeEvent) {
    this.selCount.set(e.selectedIds.length);
    if (e.selectedIds.length) this.lastEvent.set(`Selected: ${e.selectedIds.slice(0,3).join(', ')}`);
  }
}
