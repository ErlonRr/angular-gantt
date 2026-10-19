// The chart's loading, empty and error states: the `[loading]` and `[errorMessage]` inputs (Retry
// emits `(retry)`) and your own empty-state content projected with `ganttEmpty`.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  STATES_EMPTY_ACTION,
  STATES_EMPTY_TEXT,
  STATES_INITIAL_MODE,
  STATES_MODES,
  STATES_OPTIONS,
  statesProps,
  statesTasks,
  type StatesMode,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-states-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="states-mode-label">State</span>
          <div class="gs-seg" role="group" aria-labelledby="states-mode-label">
            @for (m of modes; track m.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="mode() === m.value"
                (click)="mode.set(m.value)"
              >
                {{ m.label }}
              </button>
            }
          </div>
        </div>
      </div>

      @let state = props();
      <gantry
        class="gs-chart gs-case-chart"
        [series]="state.tasks"
        [options]="options"
        [loading]="state.loading"
        [errorMessage]="state.errorMessage"
        [darkMode]="dark()"
        (retry)="mode.set('tasks')"
      >
        <!-- Shown instead of the built-in text while there are no tasks.
             No @if around it: see Framework differences -->
        <div ganttEmpty class="gs-case-empty">
          <p>{{ emptyText }}</p>
          <button type="button" class="gs-btn gs-btn--sm" (click)="mode.set('tasks')">{{ emptyAction }}</button>
        </div>
      </gantry>
    </div>
  `,
})
export class StatesExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly modes = STATES_MODES;
  protected readonly options = STATES_OPTIONS;
  protected readonly emptyText = STATES_EMPTY_TEXT;
  protected readonly emptyAction = STATES_EMPTY_ACTION;

  private readonly tasks = statesTasks(new Date());
  protected readonly mode = signal<StatesMode>(STATES_INITIAL_MODE);
  /** `tasks` (only in 'tasks'), `loading` and `errorMessage` for the chosen state */
  protected readonly props = computed(() => statesProps(this.mode(), this.tasks));
}
