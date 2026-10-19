// The four dependency types with lag and lead (`task.dependency`), the critical path
// (`criticalPath`) and orthogonal or straight arrows (`arrows.routing`).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  DEPENDENCIES_INITIAL,
  DEPENDENCIES_ROUTINGS,
  DEPENDENCY_LEGEND,
  dependenciesOptions,
  dependenciesTasks,
  type ArrowRouting,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-dependencies-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="dependencies-arrows-label">Arrows</span>
          <div class="gs-seg" role="group" aria-labelledby="dependencies-arrows-label">
            @for (r of routings; track r.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="routing() === r.value"
                (click)="routing.set(r.value)"
              >
                {{ r.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Critical path</span>
          <input
            type="checkbox"
            role="switch"
            [checked]="criticalPath()"
            (change)="criticalPath.set(box.checked)"
            #box
          />
        </label>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
      <!-- The link types of this plan -->
      <dl class="gs-case-keys">
        @for (link of legend; track link.type) {
          <dt>
            <code class="gs-code-inline">{{ link.type }}</code> {{ link.label }}
          </dt>
          <dd>{{ link.example }}</dd>
        }
      </dl>
    </div>
  `,
})
export class DependenciesExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly routings = DEPENDENCIES_ROUTINGS;
  protected readonly legend = DEPENDENCY_LEGEND;
  protected readonly tasks = dependenciesTasks(new Date());

  protected readonly routing = signal<ArrowRouting>(DEPENDENCIES_INITIAL.routing);
  protected readonly criticalPath = signal(DEPENDENCIES_INITIAL.criticalPath);
  protected readonly options = computed(() => dependenciesOptions(this.routing(), this.criticalPath()));
}
