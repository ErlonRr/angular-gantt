// One chart in four languages: `locale` names the months and days (through `Intl`, nothing to
// import), `formats.dateFormat` the dates and `labels` every UI string. Task names stay as they are.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import { I18N_INITIAL, I18N_LOCALES, i18nOptions, i18nTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-i18n-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="i18n-language-label">Language</span>
          <div class="gs-seg" role="group" aria-labelledby="i18n-language-label">
            <!-- Each language names itself, in its own language -->
            @for (l of locales; track l.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.lang]="l.value"
                [attr.aria-pressed]="locale() === l.value"
                (click)="locale.set(l.value)"
              >
                {{ l.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <!-- \`lang\` tells screen readers which language the chart speaks -->
      <gantry
        class="gs-chart gs-case-chart"
        [attr.lang]="locale()"
        [series]="tasks"
        [options]="options()"
        [darkMode]="dark()"
      />
      <p class="gs-case-hint">Task names are your data and stay as they are; every string of the chart changes.</p>
    </div>
  `,
})
export class I18nExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly locales = I18N_LOCALES;
  protected readonly tasks = i18nTasks(new Date());

  protected readonly locale = signal(I18N_INITIAL);
  /** `locale`, `labels` and `formats` of the language */
  protected readonly options = computed(() => i18nOptions(this.locale()));
}
