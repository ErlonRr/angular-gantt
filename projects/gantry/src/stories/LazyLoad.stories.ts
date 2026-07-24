import type { Meta, StoryObj } from '@storybook/angular';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  GantryComponent, GanttTask, TaskType, ViewMode, createGanttDataSource,
} from '../public-api';

// ── Fake paged API ────────────────────────────────────────────

const ALL: GanttTask[] = Array.from({ length: 80 }, (_, i) => {
  const start = new Date(2026, 0, 1 + i * 3);
  const end   = new Date(start.getTime() + (7 + (i % 10)) * 86400000);
  return {
    id:       `t${i}`,
    name:     `Task ${String(i + 1).padStart(3, '0')}`,
    start, end,
    progress: Math.floor(Math.random() * 100),
    type:     i % 12 === 0 ? TaskType.Milestone : TaskType.Task,
  };
});

async function fetch(page: number, size: number): Promise<GanttTask[]> {
  await new Promise(r => setTimeout(r, 500));
  return ALL.slice((page - 1) * size, page * size);
}

// ── Wrapper component ─────────────────────────────────────────

@Component({
  selector: 'story-lazy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div style="padding:8px 14px;background:#0f172a;color:#94a3b8;font-size:12px;
                border-bottom:1px solid #1e293b;display:flex;gap:12px;align-items:center">
      <span>Loaded: <b style="color:#60a5fa">{{ ds.loadedCount() }}</b> / 80</span>
      <span>{{ ds.isLoading() ? 'Loading…' : ds.hasMore() ? 'Scroll down to load more' : 'All loaded ✓' }}</span>
      <button style="margin-left:auto;padding:2px 10px;background:#1e293b;color:#cbd5e1;
                     border:1px solid #334155;border-radius:4px;cursor:pointer"
              [disabled]="!ds.hasMore()" (click)="ds.loadNext()">
        Load next page
      </button>
    </div>
    <gantry
      [style.height]="'calc(100vh - 80px)'"
      [dataSource]="ds"
      [options]="{ viewMode: 'Month', rowHeight: 32, showToday: true }"
      [showToolbar]="true"
    />
  `,
})
class LazyStoryComponent {
  readonly ds = createGanttDataSource({ fetcher: fetch, pageSize: 20 });
}

// ── Meta & story ──────────────────────────────────────────────

const meta: Meta<LazyStoryComponent> = {
  title:     'gantry/Lazy Load',
  component:  LazyStoryComponent,
  tags:      ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
Demonstrates **GanttDataSource** with Angular 20 \`resource()\` + \`linkedSignal\`.

Pages load on demand — either via the button or automatically when the load-more sentinel enters the viewport.
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<LazyStoryComponent>;

export const Default: Story = {
  name: 'Paged fetch — 20 per page',
};
