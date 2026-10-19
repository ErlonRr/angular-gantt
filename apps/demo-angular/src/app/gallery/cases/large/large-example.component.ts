// 10,000 tasks in a tree, virtualised in both panes: only the rows in view are in the DOM. Each row
// count builds its plan once (a `computed`), and `[series]` gets a new array: Angular compares by
// reference. The task count sits in the chart's own toolbar (`[ganttToolbar]` content).
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import { LARGE_COUNT, LARGE_COUNTS, LARGE_OPTIONS, largeCaseTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-large-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, DecimalPipe],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="large-rows-label">Rows</span>
          <div class="gs-seg" role="group" aria-labelledby="large-rows-label">
            @for (c of counts; track c.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="count() === c.value"
                (click)="count.set(c.value)"
              >
                {{ c.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks()" [options]="options" [darkMode]="dark()">
        <span ganttToolbar class="gs-pill">{{ tasks().length | number }} tasks</span>
      </gantry>
      <p class="gs-case-hint">Scroll either pane: only the rows in view are in the DOM.</p>
    </div>
  `,
})
export class LargeExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly counts = LARGE_COUNTS;
  protected readonly options = LARGE_OPTIONS;
  private readonly now = new Date();

  protected readonly count = signal(LARGE_COUNT);
  /** The plan for the row count: rebuilt only when the count changes */
  protected readonly tasks = computed(() => largeCaseTasks(this.count(), this.now));
}
