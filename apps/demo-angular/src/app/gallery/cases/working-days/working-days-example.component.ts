// A working calendar (`calendar`): durations count working days, so a bar dragged across a weekend or
// a holiday keeps its working days and stretches over the days off, and edits skip non-working time
// (`skipNonWorking`). `[(series)]` hands the edited tasks back for the status line.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  WORKING_DAYS_HINT,
  WORKING_DAYS_INITIAL,
  WORKING_DURATIONS,
  WORKING_SHADINGS,
  workingDaysOptions,
  workingDaysTasks,
  workingSummary,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-working-days-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="working-days-durations-label">Durations</span>
          <div class="gs-seg" role="group" aria-labelledby="working-days-durations-label">
            @for (d of durationChoices; track d.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="durations() === d.value"
                (click)="durations.set(d.value)"
              >
                {{ d.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Skip non-working time</span>
          <input
            id="working-days-skip"
            type="checkbox"
            role="switch"
            [checked]="skipNonWorking()"
            (change)="skipNonWorking.set(box.checked)"
            #box
          />
        </label>
        <div class="gs-case-control">
          <span id="working-days-shading-label">Shading</span>
          <div class="gs-seg" role="group" aria-labelledby="working-days-shading-label">
            @for (s of shadingChoices; track s.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="shading() === s.value"
                (click)="shading.set(s.value)"
              >
                {{ s.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <gantry class="gs-chart gs-case-chart" [(series)]="tasks" [options]="options()" [darkMode]="dark()" />
      <p class="gs-case-status">{{ summary() }}</p>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class WorkingDaysExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly durationChoices = WORKING_DURATIONS;
  protected readonly shadingChoices = WORKING_SHADINGS;
  protected readonly hint = WORKING_DAYS_HINT;

  // The holidays are placed around the same `now` as the tasks
  private readonly now = new Date();
  /** The plan: an edit writes the new tasks back through `[(series)]` */
  protected readonly tasks = signal(workingDaysTasks(this.now));

  protected readonly durations = signal(WORKING_DAYS_INITIAL.durations);
  protected readonly skipNonWorking = signal(WORKING_DAYS_INITIAL.skipNonWorking);
  protected readonly shading = signal(WORKING_DAYS_INITIAL.shading);
  protected readonly options = computed(() =>
    workingDaysOptions(
      { durations: this.durations(), skipNonWorking: this.skipNonWorking(), shading: this.shading() },
      this.now,
    ),
  );
  protected readonly summary = computed(() => workingSummary(this.tasks(), this.options()));
}
