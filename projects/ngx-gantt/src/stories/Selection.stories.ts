import type { Meta, StoryObj } from '@storybook/angular';
import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import {
  NgxGanttComponent, GanttTask, TaskType, ViewMode,
  SelectionChangeEvent, TaskDragEvent, TaskResizeEvent,
} from '../public-api';

const d = (iso: string) => new Date(iso);

const TASKS: GanttTask[] = Array.from({ length: 20 }, (_, i) => {
  const start = new Date(2026, 0, 1 + i * 7);
  const end   = new Date(start.getTime() + (5 + (i % 8)) * 86400000);
  return { id: `t${i}`, name: `Task ${i + 1}`, start, end, progress: (i * 5) % 100 };
});

@Component({
  selector: 'story-selection',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxGanttComponent],
  template: `
    <div style="padding:8px 14px;background:#0f172a;border-bottom:1px solid #1e293b;
                display:flex;align-items:center;gap:10px;flex-shrink:0">
      <span style="color:#60a5fa;font-size:13px;font-weight:600">Selection</span>
      <button (click)="gantt().selectAll()"
        style="padding:3px 9px;font-size:12px;background:#1e293b;color:#cbd5e1;
               border:1px solid #334155;border-radius:4px;cursor:pointer">
        Select all
      </button>
      <button (click)="gantt().clearSelection()"
        style="padding:3px 9px;font-size:12px;background:#1e293b;color:#cbd5e1;
               border:1px solid #334155;border-radius:4px;cursor:pointer">
        Clear
      </button>
      <button (click)="selectFirst3()"
        style="padding:3px 9px;font-size:12px;background:#1e293b;color:#cbd5e1;
               border:1px solid #334155;border-radius:4px;cursor:pointer">
        Select t0,t1,t2
      </button>
      <span style="padding:2px 10px;background:#3b82f6;color:#fff;border-radius:10px;font-size:12px;min-width:22px;text-align:center">
        {{ selectedIds().length }}
      </span>
      <span style="font-size:11px;color:#475569;margin-left:8px">
        Ctrl+click = toggle · Shift+click = range · Escape = clear · Ctrl+A = all
      </span>
      <div style="margin-left:auto;font-size:11px;color:#64748b;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        {{ lastEvent() }}
      </div>
    </div>
    <ngx-gantt
      #ref
      [style.height]="'calc(100vh - 44px)'"
      [series]="tasks"
      [options]="{ viewMode: 'Month', rowHeight: 34, showToday: true, enableSelection: true }"
      [showToolbar]="true"
      (selectionChange)="onSel($event)"
      (taskDragged)="onDrag($event)"
      (taskResized)="onResize($event)"
    />
  `,
})
class SelectionStoryComponent {
  readonly gantt      = viewChild.required<NgxGanttComponent>('ref');
  readonly tasks      = TASKS;
  readonly selectedIds = signal<string[]>([]);
  readonly lastEvent  = signal('Click a row to select');

  onSel(e: SelectionChangeEvent) {
    this.selectedIds.set(e.selectedIds);
    this.lastEvent.set(`Selected: [${e.selectedIds.join(', ')}]`);
  }
  onDrag(e: TaskDragEvent) {
    this.lastEvent.set(`Drag: ${e.taskId} ${e.daysMoved > 0 ? '+' : ''}${e.daysMoved}d`);
  }
  onResize(e: TaskResizeEvent) {
    this.lastEvent.set(`Resize [${e.handle}]: ${e.taskId} ${e.daysDelta > 0 ? '+' : ''}${e.daysDelta}d`);
  }
  selectFirst3() {
    this.gantt().setSelectedTasks(['t0', 't1', 't2']);
  }
}

const meta: Meta<SelectionStoryComponent> = {
  title:     'ngx-gantt/Selection & Drag',
  component:  SelectionStoryComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**GanttSelectionService** — signal-based multi-select.

| Interaction | Result |
|---|---|
| Click | Select single |
| Ctrl + Click | Toggle individual |
| Shift + Click | Range select |
| Escape | Clear all |
| Ctrl + A | Select all |
| \`+\` / \`-\` | Zoom in / out |
| T | Scroll to today |

Drag task bars to move them. Resize using the 8px handle on bar edges.
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<SelectionStoryComponent>;

export const Default: Story = {
  name: 'Selection + drag + resize',
};
