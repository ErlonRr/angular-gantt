// Bars drawn by your own component: `provideGanttBar` in this component's `providers` maps
// `barType: 'epic'` to `EpicBarComponent` (a `GanttBarBase`, see epic-bar.component.ts) for the
// charts inside it only; the other bars keep the built-in look.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GantryComponent, provideGanttBar } from '@gantryjs/angular';
import {
  CUSTOM_BARS_OPTIONS,
  CUSTOM_BAR_TYPE,
  RISKS,
  RISK_COLORS,
  RISK_LABELS,
  customBarsTasks,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';
import { EpicBarComponent } from './epic-bar.component';

@Component({
  selector: 'app-custom-bars-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: CUSTOM_BAR_TYPE, component: EpicBarComponent })],
  template: `
    <div class="gs-case">
      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options" [darkMode]="dark()" />
      <p class="gs-case-hint">An epic underlines its progress; its badge shows its risk (L, M or H).</p>
      <ul class="gs-case-legend" aria-label="Risk badges">
        @for (risk of risks; track risk) {
          <li>
            <span class="gs-case-swatch" [style.background-color]="colors[risk]"></span>
            {{ labels[risk] }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class CustomBarsExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly options = CUSTOM_BARS_OPTIONS;
  protected readonly tasks = customBarsTasks(new Date());

  protected readonly risks = RISKS;
  protected readonly colors = RISK_COLORS;
  protected readonly labels = RISK_LABELS;
}
