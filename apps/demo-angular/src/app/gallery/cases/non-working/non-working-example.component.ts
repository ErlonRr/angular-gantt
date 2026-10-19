// Non-working time (`nonWorkingTime`): weekends and holidays shaded, hatched or greyed out (`style`);
// on the hour scale, the hours outside `workingHours` and an `intensiveHours` window too. The Scale
// buttons follow the chart's own zoom (`viewModeChange`).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  NON_WORKING_INITIAL,
  NON_WORKING_STYLES,
  NON_WORKING_VIEW_MODES,
  nonWorkingOptions,
  nonWorkingTasks,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-non-working-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="non-working-style-label">Non-working time</span>
          <div class="gs-seg" role="group" aria-labelledby="non-working-style-label">
            @for (s of styles; track s.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="style() === s.value"
                (click)="style.set(s.value)"
              >
                {{ s.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="non-working-scale-label">Scale</span>
          <div class="gs-seg" role="group" aria-labelledby="non-working-scale-label">
            @for (m of viewModes; track m.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="viewMode() === m.value"
                (click)="viewMode.set(m.value)"
              >
                {{ m.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [options]="options()"
        [darkMode]="dark()"
        (viewModeChange)="viewMode.set($event)"
      />
    </div>
  `,
})
export class NonWorkingExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly styles = NON_WORKING_STYLES;
  protected readonly viewModes = NON_WORKING_VIEW_MODES;

  // The holidays are placed around the same `now` as the tasks
  private readonly now = new Date();
  protected readonly tasks = nonWorkingTasks(this.now);

  protected readonly style = signal(NON_WORKING_INITIAL.style);
  /** Days or Hours, or a level picked in the chart's toolbar (then no Scale button is pressed) */
  protected readonly viewMode = signal<string | undefined>(NON_WORKING_INITIAL.viewMode);
  protected readonly options = computed(() => nonWorkingOptions(this.style(), this.viewMode(), this.now));
}
