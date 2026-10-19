// Three pipelines on one timeline: the same `createGanttSyncGroup()` in every chart's `[syncGroup]`
// keeps the range, the zoom level, the horizontal scroll and the task-list width in step.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GantryComponent, createGanttSyncGroup } from '@gantryjs/angular';
import { MULTI_PIPELINE_NAMES, multiPipelineOptions, multiPipelineTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-multi-pipeline-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-stack">
        @for (p of pipelines; track p.name; let first = $first) {
          <div>
            <p class="gs-case-caption">{{ p.name }} pipeline</p>
            <!-- Only the first chart shows its toolbar: its zoom reaches the others through the group -->
            <gantry
              class="gs-chart gs-case-chart"
              [series]="p.tasks"
              [options]="p.options"
              [syncGroup]="group"
              [showToolbar]="first"
              [darkMode]="dark()"
            />
          </div>
        }
      </div>
      <p class="gs-case-hint">Zoom, scroll or drag the splitter in any chart: the other two follow.</p>
    </div>
  `,
})
export class MultiPipelineExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;

  /** One group per component (each chart joins it on render and leaves it when destroyed) */
  protected readonly group = createGanttSyncGroup();

  private readonly now = new Date();
  protected readonly pipelines = MULTI_PIPELINE_NAMES.map(name => ({
    name,
    tasks: multiPipelineTasks(name, this.now),
    options: multiPipelineOptions(name),
  }));
}
