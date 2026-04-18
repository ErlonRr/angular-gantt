import {
  ChangeDetectionStrategy, Component, signal, inject, Injector,
} from '@angular/core';
import {
  NgxGanttComponent, GanttDataSource, GanttTask,
  TaskType, ViewMode, createGanttDataSource,
} from 'ngx-gantt';

// ── Fake async fetcher — simulates an API ─────────────────────
const ALL_TASKS: GanttTask[] = Array.from({ length: 120 }, (_, i) => {
  const start = new Date(2026, 0, 1 + i * 2);
  const end = new Date(start.getTime() + (5 + (i % 14)) * 86400000);
  return {
    id: `task-${i}`,
    name: `Task ${String(i + 1).padStart(3, '0')}`,
    start,
    end,
    progress: Math.floor(Math.random() * 100),
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
  imports: [NgxGanttComponent],
  template: `
    <div class="lazy-bar">
      <span class="lazy-title">Lazy Load — 120 tasks, 25 per page</span>
      <span class="lazy-info">
        Loaded: <b>{{ ds.loadedCount() }}</b> / {{ totalCount }}
        &nbsp;·&nbsp;
        {{ ds.isLoading() ? 'Loading…' : ds.hasMore() ? 'Scroll or click Load more' : 'All loaded' }}
      </span>
      <button [disabled]="ds.isLoading() || !ds.hasMore()"
              (click)="ds.loadNext()">Load more</button>
      <button (click)="ds.reset()">Reset</button>
    </div>

    <ngx-gantt
      [dataSource]="ds"
      [options]="{ viewMode: 'Month', rowHeight: 32, showToday: true }"
      [showToolbar]="true"
      [darkMode]="false"
    />
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .lazy-bar {
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      padding: 7px 14px; background: #0f172a; border-bottom: 1px solid #1e293b;
    }
    .lazy-title { font-size: 13px; font-weight: 600; color: #60a5fa; }
    .lazy-info  { font-size: 12px; color: #64748b; margin-right: auto; }
    .lazy-info b { color: #94a3b8; }
    .lazy-bar button {
      padding: 3px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
      background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
    }
    .lazy-bar button:disabled { opacity: .4; cursor: not-allowed; }
    ngx-gantt { flex: 1; min-height: 0; }
  `],
})
export class GanttLazyComponent {
  readonly totalCount = ALL_TASKS.length;

  readonly ds = createGanttDataSource({
    fetcher: fakeFetch,
    pageSize: 25,
  });
}
