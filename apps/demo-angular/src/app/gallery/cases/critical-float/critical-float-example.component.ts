// The critical path, lags and float counted in working time: `calendar.durations` picks working or
// calendar days and `nonWorkingTime.weekends` the days off. The Float column is a `ColumnDef` with a
// `render` function; the line under the chart follows each edit written back by `[(series)]`.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  CRITICAL_DURATIONS,
  CRITICAL_FLOAT_HINT,
  CRITICAL_FLOAT_INITIAL,
  criticalFloatOptions,
  criticalFloatTasks,
  criticalSummary,
  type CriticalFloatState,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-critical-float-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="critical-float-durations-label">Durations</span>
          <div class="gs-seg" role="group" aria-labelledby="critical-float-durations-label">
            @for (choice of durations; track choice.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="state().durations === choice.value"
                (click)="update({ durations: choice.value })"
              >
                {{ choice.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Work on Saturdays</span>
          <input
            id="critical-float-saturdays"
            type="checkbox"
            role="switch"
            [checked]="state().saturdays"
            (change)="update({ saturdays: saturdays.checked })"
            #saturdays
          />
        </label>
      </div>

      <gantry class="gs-chart gs-case-chart" [(series)]="tasks" [options]="options()" [darkMode]="dark()" />
      <p class="gs-case-status">{{ summary() }}</p>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class CriticalFloatExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly durations = CRITICAL_DURATIONS;
  protected readonly hint = CRITICAL_FLOAT_HINT;
  // Each accepted edit writes the new array here (`[(series)]`)
  protected readonly tasks = signal(criticalFloatTasks(new Date()));
  protected readonly state = signal<CriticalFloatState>(CRITICAL_FLOAT_INITIAL);
  protected readonly options = computed(() => criticalFloatOptions(this.state()));
  protected readonly summary = computed(() => criticalSummary(this.tasks(), this.options()));

  protected update(change: Partial<CriticalFloatState>): void {
    this.state.update(state => ({ ...state, ...change }));
  }
}
