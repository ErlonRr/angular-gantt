// Tasks that arrive page by page from a slow fake API: a `GanttDataSource` bound with `[dataSource]`.
// A failed page is retried on its own, then the chart offers Retry; `reset()` starts again from page
// one. Its signals (`loadedCount()`, `isLoading()`, `error()`…) drive the status line.
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GantryComponent, GanttDataSource } from '@gantryjs/angular';
import { LAZY_OPTIONS, createLazyApi, lazySource, lazyStatus } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-lazy-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <label class="gs-switch gs-case-control">
          <span>Fail requests</span>
          <input type="checkbox" role="switch" [checked]="api.fail" (change)="api.setFail(fail.checked)" #fail />
        </label>
        <button type="button" class="gs-btn gs-btn--sm" (click)="source.reset()">Reset</button>
      </div>

      <gantry class="gs-chart gs-case-chart" [dataSource]="source" [options]="options" [darkMode]="dark()" />
      <p class="gs-case-hint">{{ status() }}</p>
    </div>
  `,
})
export class LazyExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly options = LAZY_OPTIONS;

  /** The fake server: `api.setFail(true)` makes its next answers fail */
  protected readonly api = createLazyApi(new Date());
  /** `fetcher`, `pageSize`, `retries` and `retryDelay` (`lazySource`) */
  protected readonly source = new GanttDataSource(lazySource(this.api));

  protected readonly status = computed(() => {
    const source = this.source;
    return lazyStatus({
      loadedCount: source.loadedCount(),
      isLoading: source.isLoading(),
      hasMore: source.hasMore(),
      error: source.error(),
      nextPage: source.nextPage(),
    });
  });
}
