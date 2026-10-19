// Milestones (`type: TaskType.Milestone`) in three shapes (`milestone.shape`), and baseline bars
// (`task.baseline`, shown with `baseline: true`) under the actual dates; the Variance column reads the difference.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  MILESTONE_SHAPES,
  MILESTONES_BASELINES_INITIAL,
  milestonesBaselinesOptions,
  milestonesBaselinesTasks,
  type MilestoneShape,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-milestones-baselines-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="milestones-baselines-shape-label">Milestone shape</span>
          <div class="gs-seg" role="group" aria-labelledby="milestones-baselines-shape-label">
            @for (s of shapes; track s.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="shape() === s.value"
                (click)="shape.set(s.value)"
              >
                {{ s.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Baselines</span>
          <input type="checkbox" role="switch" [checked]="baseline()" (change)="baseline.set(box.checked)" #box />
        </label>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
    </div>
  `,
})
export class MilestonesBaselinesExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly shapes = MILESTONE_SHAPES;
  /** The plan, with `baseline: { start, end }` on the tasks that slipped or ran early */
  protected readonly tasks = milestonesBaselinesTasks(new Date());

  protected readonly shape = signal<MilestoneShape>(MILESTONES_BASELINES_INITIAL.shape);
  protected readonly baseline = signal(MILESTONES_BASELINES_INITIAL.baseline);
  protected readonly options = computed(() => milestonesBaselinesOptions(this.shape(), this.baseline()));
}
