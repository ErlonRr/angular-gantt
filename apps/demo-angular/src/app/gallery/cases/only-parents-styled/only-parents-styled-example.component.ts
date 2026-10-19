// Collapsed parents painted from their children: `rollup.color` is `'status'` (the summary status of
// the children) or a callback (`mainTeamColor`), and `rollup.segments` draws each child inside the bar.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  ONLY_PARENTS_STYLED_COLORS,
  ONLY_PARENTS_STYLED_INITIAL,
  ONLY_PARENTS_STYLED_TEAMS,
  onlyParentsStyledOptions,
  onlyParentsStyledTasks,
  type OnlyParentsColor,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-only-parents-styled-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <label for="only-parents-styled-color">Parent colour</label>
          <select
            id="only-parents-styled-color"
            class="gs-select"
            (change)="color.set(colors[pick.selectedIndex].value)"
            #pick
          >
            @for (c of colors; track c.value) {
              <option [value]="c.value" [selected]="c.value === color()">{{ c.label }}</option>
            }
          </select>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Child segments</span>
          <input type="checkbox" role="switch" [checked]="segments()" (change)="segments.set(box.checked)" #box />
        </label>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
      <ul class="gs-case-legend" aria-label="Team colours">
        @for (team of teams; track team.label) {
          <li>
            <span class="gs-case-swatch" [style.background-color]="team.color" aria-hidden="true"></span>
            {{ team.label }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class OnlyParentsStyledExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly colors = ONLY_PARENTS_STYLED_COLORS;
  protected readonly teams = ONLY_PARENTS_STYLED_TEAMS;
  /** The tree, every task in its team's colour (what the segments show) */
  protected readonly tasks = onlyParentsStyledTasks(new Date());

  protected readonly color = signal<OnlyParentsColor>(ONLY_PARENTS_STYLED_INITIAL.color);
  protected readonly segments = signal(ONLY_PARENTS_STYLED_INITIAL.segments);
  protected readonly options = computed(() => onlyParentsStyledOptions(this.color(), this.segments()));
}
