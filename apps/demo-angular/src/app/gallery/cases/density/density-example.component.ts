// Compact, normal or comfortable rows, header and toolbar (`density`). The chart sets its row
// and bar heights as read-only CSS variables on its element; the side list copies them after each
// render and takes its row pitch from them, so it follows the chart without knowing the density.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  DENSITIES,
  DENSITY_CSS_VARIABLES,
  DENSITY_INITIAL,
  densityOptions,
  densityTasks,
  type DensityCssVariable,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-density-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="density-density-label">Density</span>
          <div class="gs-seg" role="group" aria-labelledby="density-density-label">
            @for (d of densities; track d.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="density() === d.value"
                (click)="density.set(d.value)"
              >
                {{ d.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <div class="gs-case-split">
        <div>
          <p id="density-list-caption" class="gs-case-caption">Page content at the chart’s row pitch</p>
          <ul class="density-list" aria-labelledby="density-list-caption" [style]="layout()">
            @for (t of tasks; track t.id) {
              <li>
                <span>{{ t.name }}</span>
              </li>
            }
          </ul>
        </div>
        <gantry #chart class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
      </div>
      <p class="gs-case-hint">
        The chart sets
        <code class="gs-code-inline">--gantt-row-height: {{ layout()['--gantt-row-height'] }}</code> and
        <code class="gs-code-inline">--gantt-bar-height: {{ layout()['--gantt-bar-height'] }}</code> on its element.
      </p>
    </div>
  `,
  styles: `
    /* The side list: its rows take the chart's --gantt-row-height, its markers --gantt-bar-height. */
    .density-list {
      margin: 0;
      padding: 0;
      border: 1px solid var(--gs-border);
      border-radius: var(--gs-radius);
      list-style: none;
      overflow: hidden;
    }
    .density-list li {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      height: var(--gantt-row-height);
      padding: 0 10px;
      border-bottom: 1px solid var(--gs-border);
      color: var(--gs-text);
      font-size: 13px;
    }
    .density-list li:last-child {
      border-bottom: 0;
    }
    .density-list li::before {
      content: '';
      flex: none;
      width: 4px;
      height: var(--gantt-bar-height);
      border-radius: 2px;
      background: var(--gs-accent-solid);
    }
    .density-list span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class DensityExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly densities = DENSITIES;
  protected readonly tasks = densityTasks(new Date());

  protected readonly density = signal(DENSITY_INITIAL);
  protected readonly options = computed(() => densityOptions(this.density()));

  private readonly chart = viewChild.required<string, ElementRef<HTMLElement>>('chart', { read: ElementRef });
  /** `--gantt-row-height` and `--gantt-bar-height`, as the chart last set them on its element */
  protected readonly layout = signal<Partial<Record<DensityCssVariable, string>>>({});

  constructor() {
    // After each render with new options: the chart has rewritten its variables by then
    afterRenderEffect(() => {
      this.options();
      const style = getComputedStyle(this.chart().nativeElement);
      this.layout.set(Object.fromEntries(DENSITY_CSS_VARIABLES.map(name => [name, style.getPropertyValue(name)])));
    });
  }
}
