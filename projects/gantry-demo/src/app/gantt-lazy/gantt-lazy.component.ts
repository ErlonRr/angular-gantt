import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GantryComponent, GanttTask, TaskType, createGanttDataSource } from 'ngx-gantry';
import { addDays, snapToDay } from '@gantry/core';
import { AppThemeService } from '../shell/app-theme.service';

// ── Fake async fetcher — simulates an API ─────────────────────
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
    barColor: i % 3 === 0 ? '#6366F1' : i % 3 === 1 ? '#10B981' : undefined,
  };
});

async function fakeFetch(page: number, pageSize: number): Promise<GanttTask[]> {
  await new Promise(r => setTimeout(r, 600 + Math.random() * 400)); // simulate network
  const start = (page - 1) * pageSize;
  return ALL_TASKS.slice(start, start + pageSize);
}

@Component({
  selector: 'app-gantt-lazy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="lazy-bar">
      <span class="lazy-title">Lazy Load — 120 tasks, 25 per page</span>
      <span class="lazy-info">
        Loaded: <b>{{ ds.loadedCount() }}</b> / {{ totalCount }}
        &nbsp;·&nbsp;
        {{ ds.isLoading() ? 'Loading…' : ds.hasMore() ? 'Scroll or click Load more' : 'All loaded' }}
      </span>
      <button [disabled]="ds.isLoading() || !ds.hasMore()" (click)="ds.loadNext()">Load more</button>
      <button (click)="ds.reset()">Reset</button>
    </div>

    <gantry
      [dataSource]="ds"
      [options]="{ viewMode: 'Month', rowHeight: 32, showToday: true }"
      [showToolbar]="true"
      [darkMode]="theme.mode()"
      [showLegend]="true"
    />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .lazy-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
        padding: 9px 14px;
        background: hsl(var(--card));
        border-bottom: 1px solid hsl(var(--border));
      }
      .lazy-title {
        font-size: 13px;
        font-weight: 600;
        color: hsl(var(--primary));
      }
      .lazy-info {
        font-family: var(--app-font-mono);
        font-size: 12px;
        color: hsl(var(--muted-fg));
        margin-right: auto;
      }
      .lazy-info b {
        color: hsl(var(--fg));
      }
      .lazy-bar button {
        padding: 4px 11px;
        font-size: 12px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        background: hsl(var(--muted));
        color: hsl(var(--fg));
        border: 1px solid hsl(var(--border));
      }
      .lazy-bar button:hover:not(:disabled) {
        background: hsl(var(--accent));
      }
      .lazy-bar button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      gantry {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class GanttLazyComponent {
  protected readonly theme = inject(AppThemeService);

  readonly totalCount = ALL_TASKS.length;

  readonly ds = createGanttDataSource({
    fetcher: fakeFetch,
    pageSize: 25,
  });
}
