// Capacity and working time (`resources`, `calendar`): Ana's capacity moves the line her load is
// measured against, the Engineering team is two people, and with the working calendar on the weekend
// and the holiday carry no load. The chart and the status line follow the controls.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  CAPACITIES,
  CAPACITY_HINT,
  CAPACITY_INITIAL,
  capacityOptions,
  capacityResources,
  capacitySummary,
  capacityTasks,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-resource-capacity-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="resource-capacity-capacity-label">Ana's capacity</span>
          <div class="gs-seg" role="group" aria-labelledby="resource-capacity-capacity-label">
            @for (c of capacityChoices; track c.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="anaCapacity() === c.value"
                (click)="anaCapacity.set(c.value)"
              >
                {{ c.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Working calendar</span>
          <input
            id="resource-capacity-calendar"
            type="checkbox"
            role="switch"
            [checked]="calendar()"
            (change)="calendar.set(box.checked)"
            #box
          />
        </label>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [resources]="resources()"
        [options]="options()"
        [darkMode]="dark()"
      />
      <p class="gs-case-status">{{ summary() }}</p>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class ResourceCapacityExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly capacityChoices = CAPACITIES;
  protected readonly hint = CAPACITY_HINT;

  // The holiday is placed around the same `now` as the tasks
  private readonly now = new Date();
  protected readonly tasks = capacityTasks(this.now);

  protected readonly anaCapacity = signal(CAPACITY_INITIAL.anaCapacity);
  protected readonly calendar = signal(CAPACITY_INITIAL.calendar);
  protected readonly resources = computed(() =>
    capacityResources({ anaCapacity: this.anaCapacity(), calendar: this.calendar() }),
  );
  protected readonly options = computed(() =>
    capacityOptions({ anaCapacity: this.anaCapacity(), calendar: this.calendar() }, this.now),
  );
  protected readonly summary = computed(() => capacitySummary(this.tasks, this.resources(), this.options()));
}
