// Default styles by kind, parent, level and rule (`options.styles`), under each task's own `style`.
// Field by field the later layer wins; the legend lists the layers in the order they apply.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import { STYLES_OPTIONS, STYLES_PRECEDENCE, stylesTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-styles-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options" [darkMode]="dark()" />
      <p class="gs-case-hint">Field by field, a later layer wins over an earlier one; class names add up.</p>
      <ol class="gs-case-legend" aria-label="Style layers, first to last">
        @for (step of layers; track step.layer) {
          <li>
            <!-- No colour: the layer keeps the colour it inherits (a neutral swatch) -->
            <span class="gs-case-swatch" [style.background-color]="step.color" aria-hidden="true"></span>
            {{ step.layer }} <code class="gs-code-inline">{{ step.option }}</code>
          </li>
        }
      </ol>
    </div>
  `,
})
export class StylesExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  /** `styles`: kind, parent, levels and rule */
  protected readonly options = STYLES_OPTIONS;
  /** The tree, one task with a `style` of its own (the last layer) */
  protected readonly tasks = stylesTasks(new Date());
  protected readonly layers = STYLES_PRECEDENCE;
}
