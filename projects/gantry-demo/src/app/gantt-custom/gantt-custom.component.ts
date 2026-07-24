import {
  ChangeDetectionStrategy, Component, computed, input, inject,
} from '@angular/core';
import {
  GantryComponent, GanttTask, GanttBarBase, GanttBarContext,
  GanttBarRegistry, TaskType,
} from 'ngx-gantry';
import { AppThemeService } from '../shell/app-theme.service';

// ─── Custom "Epic" bar component ─────────────────────────────
@Component({
  selector: 'g[epicBar]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'style': 'cursor: pointer;' },
  template: `
    <!-- Thick rounded bar with gradient-like darker left edge -->
    <svg:rect
      [attr.x]="geo().barX"
      [attr.y]="geo().y + 5"
      [attr.width]="geo().barWidth"
      [attr.height]="geo().height - 10"
      rx="6"
      [attr.fill]="task().barColor ?? '#6366F1'"
      opacity="0.9"
    />
    <!-- Progress fill -->
    @if (progress() > 0) {
      <svg:rect
        [attr.x]="geo().barX"
        [attr.y]="geo().y + 5"
        [attr.width]="geo().barWidth * progress() / 100"
        [attr.height]="geo().height - 10"
        rx="6"
        fill="rgba(255,255,255,0.25)"
      />
    }
    <!-- Lightning icon + label -->
    <svg:text
      [attr.x]="geo().barX + 8"
      [attr.y]="geo().y + geo().height / 2"
      [attr.fill]="'#fff'"
      font-size="12"
      font-weight="600"
      dominant-baseline="central"
      style="user-select:none;pointer-events:none"
    >⚡ {{ task().name }}</svg:text>
    <!-- Progress badge -->
    @if (geo().barWidth > 80) {
      <svg:text
        [attr.x]="geo().barX + geo().barWidth - 6"
        [attr.y]="geo().y + geo().height / 2"
        [attr.fill]="'rgba(255,255,255,0.7)'"
        font-size="10"
        text-anchor="end"
        dominant-baseline="central"
        style="user-select:none;pointer-events:none"
      >{{ progress() }}%</svg:text>
    }
  `,
})
export class EpicBarComponent extends GanttBarBase {
  readonly ctx = input.required<GanttBarContext>();
  protected readonly geo      = computed(() => this.ctx().geometry);
  protected readonly task     = computed(() => this.ctx().row.task);
  protected readonly progress = computed(() => this.task().progress ?? 0);
  override get context() { return this.ctx(); }
}

// ─── Demo tasks that use barType: 'epic' ─────────────────────
const d = (iso: string) => new Date(iso);

const TASKS: GanttTask[] = [
  {
    id: 'e1', name: 'Authentication epic',
    barType: 'epic', barColor: '#6366F1',
    start: d('2026-01-05'), end: d('2026-03-01'), progress: 80,
  },
  {
    id: 'e2', name: 'Payments epic',
    barType: 'epic', barColor: '#EC4899',
    start: d('2026-02-15'), end: d('2026-05-01'), progress: 35,
  },
  {
    id: 'e3', name: 'Reporting epic',
    barType: 'epic', barColor: '#F59E0B',
    start: d('2026-04-01'), end: d('2026-07-01'), progress: 10,
  },
  {
    id: 't1', name: 'Login flow', parentId: 'e1',
    start: d('2026-01-05'), end: d('2026-01-25'), progress: 100,
  },
  {
    id: 't2', name: 'JWT refresh', parentId: 'e1',
    start: d('2026-01-20'), end: d('2026-02-15'), progress: 90, dependency: 't1',
  },
  {
    id: 't3', name: 'Stripe integration', parentId: 'e2',
    start: d('2026-02-15'), end: d('2026-03-20'), progress: 55,
  },
  {
    id: 't4', name: 'Dashboard v1', parentId: 'e3',
    start: d('2026-04-01'), end: d('2026-05-01'), progress: 15,
  },
  {
    id: 'ms1', name: 'Q1 cutoff', type: TaskType.Milestone,
    start: d('2026-03-31'), end: d('2026-03-31'), barColor: '#F59E0B',
  },
];

@Component({
  selector: 'app-gantt-custom',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="custom-bar">
      <span class="custom-title">Custom bar type: <code>barType: 'epic'</code></span>
      <span class="custom-desc">
        EpicBarComponent registered at runtime via GanttBarRegistry.register()
      </span>
    </div>

    <gantry
      [series]="tasks"
      [options]="{ viewMode: 'Month', rowHeight: 44, showToday: true }"
      [showToolbar]="true"
      [darkMode]="theme.mode()"
      [showLegend]="true"
    />
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .custom-bar {
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      padding: 9px 14px; background: hsl(var(--card)); border-bottom: 1px solid hsl(var(--border));
    }
    .custom-title { font-size: 13px; font-weight: 600; color: hsl(var(--primary)); }
    .custom-title code {
      font-family: var(--app-font-mono);
      background: hsl(var(--muted)); padding: 1px 6px; border-radius: var(--app-radius-sm); font-size: 12px;
    }
    .custom-desc { font-family: var(--app-font-mono); font-size: 11px; color: hsl(var(--muted-fg)); }
    gantry { flex: 1; min-height: 0; }
  `],
})
export class GanttCustomComponent {
  protected readonly theme = inject(AppThemeService);

  readonly tasks = TASKS;

  constructor(registry: GanttBarRegistry) {
    // Register the custom bar type at component init
    registry.register({ type: 'epic', component: EpicBarComponent });
  }
}
