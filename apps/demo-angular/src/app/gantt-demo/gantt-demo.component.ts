import { ChangeDetectionStrategy, Component, signal, viewChild, inject } from '@angular/core';
import {
  GantryComponent,
  type GanttTask,
  type GanttAnnotation,
  ViewMode,
  type GanttOptions,
  type TaskDragEvent,
  type TaskResizeEvent,
  type SelectionChangeEvent,
} from 'ngx-gantry';
import { createDemoData } from '@gantry/core/demo';
import { addDays, snapToDay } from '@gantry/core';
import { AppThemeService } from '../shell/app-theme.service';

// Same plan as the Web Component demos, moved so today sits inside it
const DEMO = createDemoData();

/** `?options=<json>` merged over the page defaults (invalid JSON is ignored). */
function optionsFromUrl(): GanttOptions {
  if (typeof location === 'undefined') return {};
  try {
    return JSON.parse(new URLSearchParams(location.search).get('options') ?? '{}') as GanttOptions;
  } catch {
    return {};
  }
}

@Component({
  selector: 'app-gantt-demo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="demo-bar">
      <div class="demo-group">
        <span class="demo-label">Features</span>
        <button [class.on]="opts().baseline" (click)="toggle('baseline')">Baseline</button>
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
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .demo-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        padding: 8px 14px;
        background: hsl(var(--card));
        border-bottom: 1px solid hsl(var(--border));
        flex-shrink: 0;
      }
      .demo-group {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .demo-label {
        font-family: var(--app-font-mono);
        font-size: 10px;
        color: hsl(var(--muted-fg));
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .demo-bar button {
        padding: 4px 10px;
        font-size: 12px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        background: hsl(var(--muted));
        color: hsl(var(--fg));
        border: 1px solid hsl(var(--border));
        transition: background 0.1s;
      }
      .demo-bar button:hover {
        background: hsl(var(--accent));
      }
      .demo-bar button.on {
        background: hsl(var(--primary));
        border-color: hsl(var(--primary));
        color: hsl(var(--primary-fg));
      }
      .demo-badge {
        padding: 2px 8px;
        background: hsl(var(--primary));
        color: hsl(var(--primary-fg));
        border-radius: 10px;
        font-size: 12px;
        min-width: 22px;
        text-align: center;
      }
      .demo-event {
        margin-left: auto;
        font-family: var(--app-font-mono);
        font-size: 11px;
        color: hsl(var(--muted-fg));
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      gantry {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class GanttDemoComponent {
  protected readonly gantt = viewChild.required<GantryComponent>('ganttRef');
  protected readonly theme = inject(AppThemeService);

  readonly tasks = signal<GanttTask[]>(DEMO.tasks);
  readonly selCount = signal(0);
  readonly lastEvent = signal('—');
  readonly annotations: GanttAnnotation[] = DEMO.annotations;

  private readonly _opts = signal<GanttOptions>({
    viewMode: ViewMode.Month,
    rowHeight: 36,
    baseline: true,
    criticalPath: false,
    showToday: true,
    panelVisible: true,
    enableDrag: true,
    enableResize: true,
    enableSelection: true,
    // Try any configuration from the URL: /demo?options={"viewMode":"Day"} (also used by the e2e parity test)
    ...optionsFromUrl(),
  });
  readonly opts = this._opts.asReadonly();

  toggle(key: keyof GanttOptions) {
    this._opts.update(o => ({ ...o, [key]: !o[key] }));
  }

  addTask() {
    const id = `task-${Date.now()}`;
    const start = snapToDay(new Date());
    const end = addDays(start, 14);
    this.tasks.update(ts => [
      ...ts,
      {
        id,
        name: `New task ${id.slice(-4)}`,
        parentId: 'p1',
        start,
        end,
        progress: 0,
      },
    ]);
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
    if (e.selectedIds.length) this.lastEvent.set(`Selected: ${e.selectedIds.slice(0, 3).join(', ')}`);
  }
}
