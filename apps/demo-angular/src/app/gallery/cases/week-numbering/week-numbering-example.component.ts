// Week numbers in the header: the numbering rule (`weekNumbering`: ISO, US or the locale's), the first
// day of the week (`weekStart`) and the `locale`, on two zoom levels of its own (`WEEK_FORMATS`).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  WEEK_LOCALES,
  WEEK_NUMBERINGS,
  WEEK_NUMBERING_INITIAL,
  WEEK_STARTS,
  weekNumberingOptions,
  weekNumberingTasks,
  type WeekNumberingChoice,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-week-numbering-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    @let picked = choice();
    <div class="gs-case">
      <!-- Options are picked by index: the week starts are numbers -->
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <label for="week-numbering-numbering">Numbering</label>
          <select
            #rule
            id="week-numbering-numbering"
            class="gs-select"
            (change)="set({ numbering: numberings[rule.selectedIndex].value })"
          >
            @for (c of numberings; track c.value) {
              <option [value]="c.value" [selected]="c.value === picked.numbering">{{ c.label }}</option>
            }
          </select>
        </div>
        <div class="gs-case-control">
          <label for="week-numbering-week-start">Week starts on</label>
          <select
            #start
            id="week-numbering-week-start"
            class="gs-select"
            (change)="set({ weekStart: starts[start.selectedIndex].value })"
          >
            @for (c of starts; track c.value) {
              <option [value]="c.value" [selected]="c.value === picked.weekStart">{{ c.label }}</option>
            }
          </select>
        </div>
        <div class="gs-case-control">
          <label for="week-numbering-locale">Locale</label>
          <select
            #locale
            id="week-numbering-locale"
            class="gs-select"
            (change)="set({ locale: locales[locale.selectedIndex].value })"
          >
            @for (c of locales; track c.value) {
              <option [value]="c.value" [selected]="c.value === picked.locale">{{ c.label }}</option>
            }
          </select>
        </div>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
    </div>
  `,
})
export class WeekNumberingExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly numberings = WEEK_NUMBERINGS;
  protected readonly starts = WEEK_STARTS;
  protected readonly locales = WEEK_LOCALES;
  protected readonly tasks = weekNumberingTasks(new Date());

  protected readonly choice = signal<WeekNumberingChoice>(WEEK_NUMBERING_INITIAL);
  /** Its own zoom levels, `weekNumbering`, `weekStart` (unless "From the rule") and `locale` */
  protected readonly options = computed(() => weekNumberingOptions(this.choice()));

  protected set(patch: Partial<WeekNumberingChoice>): void {
    this.choice.update(c => ({ ...c, ...patch }));
  }
}
