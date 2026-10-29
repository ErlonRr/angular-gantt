// A shift calendar (`calendar.unit: 'hour'`): working hours with a lunch break and a short Friday
// (`nonWorkingTime.workingHours`); bars skip the hours off, and Duration cells read and parse hours,
// a day being `calendar.hoursPerDay`. The Scale buttons follow the chart's own zoom (`viewModeChange`).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  SHIFT_FRIDAYS,
  SHIFT_HINT,
  SHIFT_HOURS_PER_DAY,
  SHIFT_INITIAL,
  SHIFT_VIEW_MODES,
  shiftOptions,
  shiftTasks,
  type ShiftFriday,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-shift-calendar-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="shift-calendar-scale-label">Scale</span>
          <div class="gs-seg" role="group" aria-labelledby="shift-calendar-scale-label">
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
        <div class="gs-case-control">
          <label for="shift-calendar-hours">Hours per day</label>
          <!-- Picked by index: the options' values are strings, the hours are numbers -->
          <select
            #hours
            id="shift-calendar-hours"
            class="gs-select"
            (change)="hoursPerDay.set(hoursChoices[hours.selectedIndex].value)"
          >
            @for (h of hoursChoices; track h.value) {
              <option [value]="h.value" [selected]="h.value === hoursPerDay()">{{ h.label }}</option>
            }
          </select>
        </div>
        <div class="gs-case-control">
          <span id="shift-calendar-friday-label">Friday</span>
          <div class="gs-seg" role="group" aria-labelledby="shift-calendar-friday-label">
            @for (f of fridays; track f.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="friday() === f.value"
                (click)="friday.set(f.value)"
              >
                {{ f.label }}
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
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class ShiftCalendarExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly viewModes = SHIFT_VIEW_MODES;
  protected readonly hoursChoices = SHIFT_HOURS_PER_DAY;
  protected readonly fridays = SHIFT_FRIDAYS;
  protected readonly hint = SHIFT_HINT;
  protected readonly tasks = shiftTasks(new Date());

  /** Hours or Days, or a level picked in the chart's toolbar (then no Scale button is pressed) */
  protected readonly viewMode = signal<string | undefined>(SHIFT_INITIAL.viewMode);
  protected readonly hoursPerDay = signal(SHIFT_INITIAL.hoursPerDay);
  protected readonly friday = signal<ShiftFriday>(SHIFT_INITIAL.friday);
  protected readonly options = computed(() =>
    shiftOptions({
      viewMode: this.viewMode() ?? SHIFT_INITIAL.viewMode,
      hoursPerDay: this.hoursPerDay(),
      friday: this.friday(),
    }),
  );
}
