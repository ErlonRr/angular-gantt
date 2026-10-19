// Prints every row of the schedule, not only the rows on screen: `print(options)` on the component
// (`viewChild`) with the `paper`, `orientation`, `fit` and `repeatTable` the controls pick. It is
// async; the `(export)` output reports the pages printed.
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { GantryComponent, type GanttExportEvent } from '@gantryjs/angular';
import {
  PRINT_FITS,
  PRINT_HINT,
  PRINT_INITIAL,
  PRINT_OPTIONS,
  PRINT_ORIENTATIONS,
  PRINT_PAPERS,
  describeExport,
  describeFailedExport,
  printOptionsOf,
  printTasks,
  pushLog,
  type PrintState,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-print-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    @let picked = state();
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <label for="print-paper">Paper</label>
          <select
            #paper
            id="print-paper"
            class="gs-select"
            (change)="set({ paper: papers[paper.selectedIndex].value })"
          >
            @for (c of papers; track c.value) {
              <option [value]="c.value" [selected]="c.value === picked.paper">{{ c.label }}</option>
            }
          </select>
        </div>
        <div class="gs-case-control">
          <span id="print-orientation-label">Orientation</span>
          <div class="gs-seg" role="group" aria-labelledby="print-orientation-label">
            @for (c of orientations; track c.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="picked.orientation === c.value"
                (click)="set({ orientation: c.value })"
              >
                {{ c.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="print-fit-label">Fit</span>
          <div class="gs-seg" role="group" aria-labelledby="print-fit-label">
            @for (c of fits; track c.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="picked.fit === c.value"
                (click)="set({ fit: c.value })"
              >
                {{ c.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Repeat task list</span>
          <input
            #repeat
            type="checkbox"
            role="switch"
            [checked]="picked.repeatTable"
            (change)="set({ repeatTable: repeat.checked })"
          />
        </label>
        <button
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="printing() ? 'true' : null"
          (click)="print()"
        >
          Print…
        </button>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [options]="options"
        [darkMode]="dark()"
        (export)="logPrint($event)"
      />
      @if (failure(); as failure) {
        <p class="gs-case-hint" role="alert">{{ failure }}</p>
      }
      <!-- Not a live region: the chart announces each print itself -->
      <ol class="gs-case-log" aria-label="Prints">
        @for (line of log(); track $index) {
          <li>{{ line }}</li>
        }
      </ol>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class PrintExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly papers = PRINT_PAPERS;
  protected readonly orientations = PRINT_ORIENTATIONS;
  protected readonly fits = PRINT_FITS;
  protected readonly hint = PRINT_HINT;
  protected readonly options = PRINT_OPTIONS;
  protected readonly tasks = printTasks(new Date());

  protected readonly state = signal<PrintState>(PRINT_INITIAL);
  protected readonly printing = signal(false);
  protected readonly log = signal<string[]>([]);
  protected readonly failure = signal<string | null>(null);

  protected set(patch: Partial<PrintState>): void {
    this.state.update(s => ({ ...s, ...patch }));
  }

  /** One print at a time; a failure (a `RangeError` over `maxPages`, say) shows under the chart */
  protected print(): void {
    if (this.printing()) return;
    this.printing.set(true);
    this.failure.set(null);
    void this.chart()
      .print(printOptionsOf(this.state()))
      .catch((error: unknown) => this.failure.set(describeFailedExport(error)))
      .finally(() => this.printing.set(false));
  }

  protected logPrint(detail: GanttExportEvent): void {
    this.log.update(log => pushLog(log, describeExport(detail)));
  }
}
