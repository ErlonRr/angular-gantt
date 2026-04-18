import type { Meta, StoryObj } from '@storybook/angular';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  NgxGanttComponent, GanttTask, GanttBarBase, GanttBarContext,
  GanttBarRegistry, TaskType, ViewMode,
} from '../public-api';

const d = (iso: string) => new Date(iso);

// ─── Custom "Phase" bar ───────────────────────────────────────
@Component({
  selector: 'g[phaseBar]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Striped phase bar -->
    <svg:rect
      [attr.x]="geo().barX" [attr.y]="geo().y + 4"
      [attr.width]="geo().barWidth" [attr.height]="geo().height - 8"
      rx="4" [attr.fill]="task().barColor ?? '#0EA5E9'" opacity="0.85"
    />
    <!-- Stripe overlay via repeating rect pattern simulation -->
    @for (stripe of stripes(); track $index) {
      <svg:rect
        [attr.x]="geo().barX + stripe" [attr.y]="geo().y + 4"
        [attr.width]="6" [attr.height]="geo().height - 8"
        fill="rgba(255,255,255,0.08)"
      />
    }
    <!-- Label -->
    <svg:text
      [attr.x]="geo().barX + 8" [attr.y]="geo().y + geo().height / 2"
      fill="#fff" font-size="11" font-weight="600" dominant-baseline="central"
      style="pointer-events:none;user-select:none"
    >◈ {{ task().name }}</svg:text>
  `,
})
class PhaseBarComponent extends GanttBarBase {
  readonly ctx = input.required<GanttBarContext>();
  protected readonly geo  = computed(() => this.ctx().geometry);
  protected readonly task = computed(() => this.ctx().row.task);
  protected readonly stripes = computed(() => {
    const w = this.geo().barWidth;
    return Array.from({ length: Math.floor(w / 20) }, (_, i) => i * 20 + 12);
  });
  override get context() { return this.ctx(); }
}

// ─── Story component ──────────────────────────────────────────
@Component({
  selector: 'story-custom-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxGanttComponent],
  template: `
    <div style="padding:8px 14px;background:#0f172a;color:#94a3b8;font-size:12px;
                border-bottom:1px solid #1e293b">
      Custom <code style="color:#a78bfa">barType:'phase'</code> registered via
      <code style="color:#60a5fa">GanttBarRegistry.register()</code>
    </div>
    <ngx-gantt
      [style.height]="'calc(100vh - 42px)'"
      [series]="tasks"
      [options]="{ viewMode: 'Month', rowHeight: 44, showToday: true }"
      [showToolbar]="true"
    />
  `,
})
class CustomBarStoryComponent {
  readonly tasks: GanttTask[] = [
    { id: 'ph1', name: 'Phase 1 — Discovery',  barType: 'phase', barColor: '#0EA5E9', start: d('2026-01-05'), end: d('2026-02-15'), progress: 100 },
    { id: 'ph2', name: 'Phase 2 — Design',     barType: 'phase', barColor: '#8B5CF6', start: d('2026-02-10'), end: d('2026-03-20'), progress: 75, dependency: 'ph1' },
    { id: 'ph3', name: 'Phase 3 — Build',      barType: 'phase', barColor: '#10B981', start: d('2026-03-15'), end: d('2026-05-30'), progress: 35, dependency: 'ph2' },
    { id: 'ph4', name: 'Phase 4 — Launch',     barType: 'phase', barColor: '#F59E0B', start: d('2026-06-01'), end: d('2026-06-30'), progress: 0,  dependency: 'ph3' },
    { id: 't1',  name: '  Sprint 1',  parentId: 'ph3', start: d('2026-03-15'), end: d('2026-03-28'), progress: 100 },
    { id: 't2',  name: '  Sprint 2',  parentId: 'ph3', start: d('2026-03-28'), end: d('2026-04-11'), progress: 80, dependency: 't1' },
    { id: 't3',  name: '  Sprint 3',  parentId: 'ph3', start: d('2026-04-11'), end: d('2026-04-25'), progress: 40, dependency: 't2' },
    { id: 't4',  name: '  Sprint 4',  parentId: 'ph3', start: d('2026-04-25'), end: d('2026-05-15'), progress: 0,  dependency: 't3' },
    { id: 'ms1', name: 'Go Live', type: TaskType.Milestone, barColor: '#EF4444', start: d('2026-06-28'), end: d('2026-06-28'), dependency: 'ph4' },
  ];

  constructor(registry: GanttBarRegistry) {
    registry.register({ type: 'phase', component: PhaseBarComponent });
  }
}

// ── Meta & story ──────────────────────────────────────────────

const meta: Meta<CustomBarStoryComponent> = {
  title:     'ngx-gantt/Custom Bar',
  component:  CustomBarStoryComponent,
  tags:      ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
Demonstrates the **GanttBarRegistry** extension point.

Any Angular component that extends \`GanttBarBase\` can be registered as a custom bar type.
Tasks opt-in by setting \`barType: 'yourType'\`.

\`\`\`ts
// 1. Create your component
@Component({ selector: 'g[myBar]', ... })
class MyBarComponent extends GanttBarBase { ... }

// 2. Register (in constructor, providers, or forRoot)
registry.register({ type: 'my-bar', component: MyBarComponent });

// 3. Use in tasks
{ id: 'x', barType: 'my-bar', ... }
\`\`\`
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<CustomBarStoryComponent>;

export const PhaseBar: Story = {
  name: 'Phase bar with stripes',
};
