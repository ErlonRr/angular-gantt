// The plan saved as an image: `download('svg' | 'png', options)` on the component (`viewChild`) saves
// a file named after `export.fileName`, and `exportSvg(options)` returns the SVG text, previewed
// here through an object URL. `theme` picks the palette, `range` the whole plan or the dates on screen.
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  EXPORT_IMAGE_INITIAL,
  EXPORT_IMAGE_OPTIONS,
  EXPORT_RANGES,
  EXPORT_THEMES,
  describeFailedExport,
  exportImageTasks,
  formatBytes,
  imageExportOptions,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-export-image-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="export-image-theme-label">Theme</span>
          <div class="gs-seg" role="group" aria-labelledby="export-image-theme-label">
            @for (t of themes; track t.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="theme() === t.value"
                (click)="theme.set(t.value)"
              >
                {{ t.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="export-image-range-label">Range</span>
          <div class="gs-seg" role="group" aria-labelledby="export-image-range-label">
            @for (r of ranges; track r.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="range() === r.value"
                (click)="range.set(r.value)"
              >
                {{ r.label }}
              </button>
            }
          </div>
        </div>
        <!-- aria-disabled while an export runs, not disabled: the button keeps focus -->
        <button
          id="export-image-svg"
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="busy() || null"
          (click)="download('svg')"
        >
          Download SVG
        </button>
        <button
          id="export-image-png"
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="busy() || null"
          (click)="download('png')"
        >
          Download PNG
        </button>
        <button
          id="export-image-preview"
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="busy() || null"
          (click)="showPreview()"
        >
          Preview
        </button>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options" [darkMode]="dark()" />
      @if (failure(); as failure) {
        <p class="gs-case-hint" role="alert">{{ failure }}</p>
      }
      @if (preview(); as preview) {
        <figure class="gs-case-preview">
          <img [src]="preview.url" alt="Preview of the exported SVG" />
          <figcaption>SVG · {{ preview.size }}</figcaption>
        </figure>
      }
    </div>
  `,
})
export class ExportImageExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);
  protected readonly themes = EXPORT_THEMES;
  protected readonly ranges = EXPORT_RANGES;
  protected readonly options = EXPORT_IMAGE_OPTIONS;
  protected readonly tasks = exportImageTasks(new Date());

  protected readonly theme = signal(EXPORT_IMAGE_INITIAL.theme);
  protected readonly range = signal(EXPORT_IMAGE_INITIAL.range);
  protected readonly exportOptions = computed(() => imageExportOptions({ theme: this.theme(), range: this.range() }));
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly preview = signal<{ url: string; size: string } | null>(null);

  constructor() {
    // The object URL lives as long as its preview: replaced or destroyed, it is revoked
    effect(onCleanup => {
      const shown = this.preview();
      if (shown) onCleanup(() => URL.revokeObjectURL(shown.url));
    });
  }

  protected download(format: 'svg' | 'png'): void {
    this.run(chart => chart.download(format, this.exportOptions()));
  }

  protected showPreview(): void {
    this.run(async chart => {
      const blob = new Blob([await chart.exportSvg(this.exportOptions())], { type: 'image/svg+xml' });
      this.preview.set({ url: URL.createObjectURL(blob), size: formatBytes(blob.size) });
    });
  }

  /** One export at a time; a failure (a rejected promise) shows under the chart */
  private run(task: (chart: GantryComponent) => Promise<unknown>): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set(null);
    void task(this.chart())
      .catch((error: unknown) => this.failure.set(describeFailedExport(error)))
      .finally(() => this.busy.set(false));
  }
}
