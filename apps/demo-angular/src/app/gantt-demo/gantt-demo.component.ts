import { ChangeDetectionStrategy, Component, computed, signal, viewChild, inject } from '@angular/core';
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
import { EXAMPLE_STYLES, ExampleHeadComponent, ExampleUsageComponent } from '../pages/examples/example-parts';

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

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

@Component({
  selector: 'app-gantt-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, ExampleHeadComponent, ExampleUsageComponent],
  template: `
    <header appExampleHead="demo"></header>

    <div class="gs-card">
      <div class="gs-card-head gs-toolbar">
        <div class="gs-seg" role="group" aria-label="Features">
          <button type="button" class="gs-seg-btn" [attr.aria-pressed]="!!opts().baseline" (click)="toggle('baseline')">
            Baseline
          </button>
          <button
            type="button"
            class="gs-seg-btn"
            [attr.aria-pressed]="!!opts().criticalPath"
            (click)="toggle('criticalPath')"
          >
            Critical path
          </button>
        </div>
        <div class="gs-seg" role="group" aria-label="Zoom">
          @for (level of zoomLevels; track level) {
            <button
              type="button"
              class="gs-seg-btn"
              [attr.aria-pressed]="shownZoom() === level"
              (click)="zoom.set(level)"
            >
              {{ level }}
            </button>
          }
        </div>
        <span class="gs-spacer"></span>
        <button type="button" class="gs-btn gs-btn--sm" (click)="addTask()">Add task</button>
        <button type="button" class="gs-btn gs-btn--sm" (click)="gantt().collapseAll()">Collapse all</button>
        <button type="button" class="gs-btn gs-btn--sm" (click)="gantt().expandAll()">Expand all</button>
        <button type="button" class="gs-btn gs-btn--sm" (click)="gantt().selectAll()">Select all</button>
        <button type="button" class="gs-btn gs-btn--sm" (click)="gantt().clearSelection()">Clear</button>
      </div>

      <gantry
        #ganttRef
        class="gs-chart ex-chart"
        [series]="tasks()"
        [options]="opts()"
        [annotations]="annotations"
        [darkMode]="theme.isDark()"
        [(viewMode)]="zoom"
        showToolbar
        enableDrag
        enableResize
        tooltipEnabled
        showLegend
        (viewModeChange)="lastEvent.set('Zoom level: ' + $event)"
        (taskDragged)="onDrag($event)"
        (taskResized)="onResize($event)"
        (selectionChange)="onSel($event)"
      >
        <!-- Projected into the chart's own toolbar (the ganttToolbar slot) -->
        <span ganttToolbar class="gs-pill">{{ selCount() }} selected</span>
        <p ganttToolbar class="ex-status demo-status" role="status" [title]="lastEvent()">{{ lastEvent() }}</p>
      </gantry>
    </div>

    <app-example-usage path="demo" />
  `,
  styles: [
    EXAMPLE_STYLES,
    `
      .demo-status {
        max-width: 320px;
        padding: 0 4px;
        font-size: 13px;
      }
    `,
  ],
})
export class GanttDemoComponent {
  protected readonly gantt = viewChild.required<GantryComponent>('ganttRef');
  protected readonly theme = inject(AppThemeService);

  readonly tasks = signal<GanttTask[]>(DEMO.tasks);
  readonly selCount = signal(0);
  readonly lastEvent = signal('No events yet: drag a bar or select rows');
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

  /**
   * Two-way zoom level (`[(viewMode)]`): the buttons above set it, and the chart writes back the
   * level its toolbar, `+` / `-` keys or API choose. Unset, `options.viewMode` decides (the e2e
   * parity test passes it through `?options=`).
   */
  readonly zoom = signal<string | undefined>(undefined);
  readonly zoomLevels = [ViewMode.Week, ViewMode.Month, ViewMode.Quarter];
  protected readonly shownZoom = computed(() => this.zoom() ?? this.opts().viewMode ?? ViewMode.Month);

  toggle(key: 'baseline' | 'criticalPath') {
    this._opts.update(o => ({ ...o, [key]: !o[key] }));
  }

  addTask() {
    const id = `task-${Date.now()}`;
    const start = snapToDay(new Date());
    const end = addDays(start, 14);
    const name = `New task ${id.slice(-4)}`;
    this.tasks.update(ts => [...ts, { id, name, parentId: 'p1', start, end, progress: 0 }]);
    this.lastEvent.set(`Added “${name}”, starting today`);
  }

  onDrag(e: TaskDragEvent) {
    this.lastEvent.set(`Moved ${this.nameOf(e.taskId)} by ${signed(e.daysMoved)} days`);
  }
  onResize(e: TaskResizeEvent) {
    const edge = e.handle === 'left' ? 'start' : 'end';
    this.lastEvent.set(`Resized the ${edge} of ${this.nameOf(e.taskId)} by ${signed(e.daysDelta)} days`);
  }
  onSel(e: SelectionChangeEvent) {
    this.selCount.set(e.selectedIds.length);
    const names = e.selectedIds.slice(0, 3).map(id => this.nameOf(id));
    const more = e.selectedIds.length > 3 ? ` and ${e.selectedIds.length - 3} more` : '';
    this.lastEvent.set(e.selectedIds.length ? `Selected ${names.join(', ')}${more}` : 'Selection cleared');
  }

  private nameOf(id: string): string {
    const name = this.tasks().find(t => t.id === id)?.name;
    return name ? `“${name}”` : id;
  }
}
