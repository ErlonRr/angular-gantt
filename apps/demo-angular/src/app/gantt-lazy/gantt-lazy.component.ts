import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, type GanttTask, TaskType, GanttDataSource } from 'ngx-gantry';
import { addDays, snapToDay } from '@gantry/core';
import { AppThemeService } from '../shell/app-theme.service';
import { EXAMPLE_STYLES, ExampleHeadComponent, ExampleUsageComponent } from '../pages/examples/example-parts';

// ── Fake API: 120 tasks served 25 per page ────────────────────
// The series starts 20 days ago, so today falls inside the first page (tasks 1–25)
const FIRST_DAY = addDays(snapToDay(new Date()), -20);
const ALL_TASKS: GanttTask[] = Array.from({ length: 120 }, (_, i) => {
  const start = addDays(FIRST_DAY, i * 2);
  const end = addDays(start, 5 + (i % 14));
  return {
    id: `task-${i}`,
    name: `Task ${String(i + 1).padStart(3, '0')}`,
    start,
    end,
    progress: (i * 37) % 101,
    type: i % 15 === 0 ? TaskType.Milestone : TaskType.Task,
    barColor: i % 3 === 0 ? '#4f46e5' : i % 3 === 1 ? '#047857' : undefined,
  };
});
const PAGE_SIZE = 25;

@Component({
  selector: 'app-gantt-lazy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, ExampleHeadComponent, ExampleUsageComponent],
  template: `
    <header appExampleHead="lazy"></header>

    <div class="gs-card">
      <div class="gs-card-head gs-toolbar">
        <span class="gs-pill">{{ ds.loadedCount() }} of {{ total }} loaded</span>
        <!-- Not a live region: the chart announces loads and failures itself -->
        <p class="ex-status" [title]="status()">{{ status() }}</p>
        <button type="button" class="gs-chip" [attr.aria-pressed]="failing()" (click)="failing.set(!failing())">
          Fail requests
        </button>
        <button
          type="button"
          class="gs-btn gs-btn--sm"
          [disabled]="ds.isLoading() || !ds.hasMore() || !!ds.error()"
          (click)="ds.loadNext()"
        >
          Load more
        </button>
        <button type="button" class="gs-btn gs-btn--sm" [disabled]="!ds.error()" (click)="ds.retry()">Retry</button>
        <button type="button" class="gs-btn gs-btn--sm" (click)="reset()">Reset</button>
      </div>

      <gantry
        class="gs-chart ex-chart"
        [dataSource]="ds"
        [options]="{ viewMode: 'Month', rowHeight: 32, showToday: true }"
        [darkMode]="theme.isDark()"
        showToolbar
        showLegend
        (loadError)="lastError.set($event.page)"
      />
    </div>

    <app-example-usage path="lazy" />
  `,
  styles: [EXAMPLE_STYLES],
})
export class GanttLazyComponent {
  protected readonly theme = inject(AppThemeService);

  protected readonly total = ALL_TASKS.length;
  /** "Fail requests": every request fails, so the automatic retry runs out and Retry is needed. */
  protected readonly failing = signal(false);
  /** Page of the last failure reported by the chart's `loadError` output. */
  protected readonly lastError = signal<number | null>(null);

  readonly ds = new GanttDataSource({
    fetcher: (page, size) => this.fetchPage(page, size),
    pageSize: PAGE_SIZE,
    retries: 1,
    retryDelay: 400,
  });

  private readonly pages = Math.ceil(ALL_TASKS.length / PAGE_SIZE);
  protected readonly status = computed(() => {
    if (this.ds.error())
      return `Page ${this.lastError() ?? this.ds.nextPage()} failed twice. Turn off Fail requests, then Retry.`;
    if (this.ds.isLoading()) return `Loading page ${this.ds.nextPage()}…`;
    if (!this.ds.hasMore()) return `All ${this.total} tasks loaded.`;
    return `Page ${this.ds.page()} of ${this.pages} loaded. Scroll down or press Load more.`;
  });

  protected reset(): void {
    this.lastError.set(null);
    void this.ds.reset();
  }

  /** Simulated network: 0.6–1 s per page, or a failure while "Fail requests" is on. */
  private async fetchPage(page: number, size: number): Promise<GanttTask[]> {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    if (this.failing()) throw new Error('Simulated network error');
    const start = (page - 1) * size;
    return ALL_TASKS.slice(start, start + size);
  }
}
