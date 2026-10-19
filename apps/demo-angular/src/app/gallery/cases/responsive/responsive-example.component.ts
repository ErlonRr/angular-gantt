// Narrow the container: below `responsive.breakpoint` the chart shows `responsive.view` alone, and
// the toolbar moves what doesn't fit into a More menu (`toolbar.overflow`, or 'wrap' onto more lines).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  RESPONSIVE_BREAKPOINT,
  RESPONSIVE_INITIAL,
  RESPONSIVE_OVERFLOWS,
  RESPONSIVE_VIEWS,
  RESPONSIVE_WIDTH,
  responsiveOptions,
  responsiveTasks,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-responsive-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <label for="responsive-width">Container width</label>
          <input
            #slider
            id="responsive-width"
            class="gs-range width-range"
            type="range"
            [min]="range.min"
            [max]="range.max"
            [step]="range.step"
            [value]="width()"
            [attr.aria-valuetext]="width() + ' px'"
            (input)="width.set(slider.valueAsNumber)"
          />
          <span class="gs-value" aria-hidden="true">{{ width() }} px</span>
        </div>
        <div class="gs-case-control">
          <span id="responsive-overflow-label">Toolbar overflow</span>
          <div class="gs-seg" role="group" aria-labelledby="responsive-overflow-label">
            @for (o of overflows; track o.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="overflow() === o.value"
                (click)="overflow.set(o.value)"
              >
                {{ o.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="responsive-view-label">Narrow view</span>
          <div class="gs-seg" role="group" aria-labelledby="responsive-view-label">
            @for (v of views; track v.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="narrowView() === v.value"
                (click)="narrowView.set(v.value)"
              >
                {{ v.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <!-- The chart measures its own width: no window listener, any container works -->
      <div class="gs-case-frame" [style.width.px]="width()">
        <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
      </div>
      <p class="gs-case-hint">Below {{ breakpoint }} px the chart switches to the narrow view.</p>
    </div>
  `,
  styles: `
    .width-range {
      width: 200px;
    }
  `,
})
export class ResponsiveExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly range = RESPONSIVE_WIDTH;
  protected readonly breakpoint = RESPONSIVE_BREAKPOINT;
  protected readonly overflows = RESPONSIVE_OVERFLOWS;
  protected readonly views = RESPONSIVE_VIEWS;
  protected readonly tasks = responsiveTasks(new Date());

  protected readonly width = signal<number>(RESPONSIVE_WIDTH.initial);
  protected readonly overflow = signal(RESPONSIVE_INITIAL.overflow);
  protected readonly narrowView = signal(RESPONSIVE_INITIAL.narrowView);
  protected readonly options = computed(() => responsiveOptions(this.overflow(), this.narrowView()));
}
