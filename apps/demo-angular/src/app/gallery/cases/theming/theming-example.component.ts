// Theme presets as `options.theme` (one set of overrides per mode), the chart's `[darkMode]`, CSS
// custom properties bound with `[style]` (a template binding wins over the chart's inline tokens),
// and page CSS scoped to `gantry`: the chart renders in the light DOM, with `gantt-*` classes inside
// and the host classes `gantry-dark`, `gantry-dragging` and `gantry-loading`.
import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  THEMING_CSS_VARIABLES,
  THEMING_INITIAL,
  THEMING_MODES,
  THEMING_PRESETS,
  themingDark,
  themingOptions,
  themingTasks,
  type ThemingMode,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-theming-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Page CSS: the rules below reach into the chart (scoped to its class, so nothing else)
  encapsulation: ViewEncapsulation.None,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="theming-theme-label">Theme</span>
          <div class="gs-seg" role="group" aria-labelledby="theming-theme-label">
            @for (p of presets; track p.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="preset() === p.value"
                (click)="preset.set(p.value)"
              >
                {{ p.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="theming-mode-label">Mode</span>
          <div class="gs-seg" role="group" aria-labelledby="theming-mode-label">
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

      <gantry
        class="gs-chart gs-case-chart themed-chart"
        [style]="cssVariables"
        [series]="tasks"
        [options]="options()"
        [darkMode]="dark()"
      />
      <p class="gs-case-hint">
        The font, focus ring and row hover colour are CSS variables set on the element; page CSS draws the toolbar line
        and the dark-mode frame.
      </p>
    </div>
  `,
  styles: `
    /* The toolbar element: an accent line on top, in the bar colour of the preset */
    gantry.themed-chart gantt-toolbar {
      border-top: 3px solid var(--gantt-bar);
    }
    /* The dark theme's host class: the frame takes the bar colour too */
    gantry.themed-chart.gantry-dark {
      border-color: var(--gantt-bar);
    }
  `,
})
export class ThemingExampleComponent {
  private readonly siteDark = inject(AppThemeService).isDark;
  protected readonly presets = THEMING_PRESETS;
  protected readonly modes = THEMING_MODES;
  protected readonly cssVariables = THEMING_CSS_VARIABLES;
  protected readonly tasks = themingTasks(new Date());

  protected readonly preset = signal(THEMING_INITIAL.preset);
  protected readonly mode = signal<ThemingMode>(THEMING_INITIAL.mode);
  protected readonly dark = computed(() => themingDark(this.mode(), this.siteDark()));
  /** The preset's overrides for the mode the chart shows */
  protected readonly options = computed(() => themingOptions(this.preset(), this.dark()));
}
