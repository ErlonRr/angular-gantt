import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, type GanttTask, provideGanttBar, TaskType } from 'ngx-gantry';
import { anchorToToday } from '@gantry/core/demo';
import { AppThemeService } from '../shell/app-theme.service';
import { EXAMPLE_STYLES, ExampleHeadComponent, ExampleUsageComponent } from '../pages/examples/example-parts';
import { EpicBarComponent } from './epic-bar.component';

// ─── Demo tasks: the epics use barType: 'epic' ─────────────────
const d = (iso: string) => new Date(iso);

// Epic colours carry white text (AA contrast)
const TASKS: GanttTask[] = [
  {
    id: 'e1',
    name: 'Authentication epic',
    barType: 'epic',
    barColor: '#4f46e5',
    start: d('2026-01-05'),
    end: d('2026-03-01'),
    progress: 80,
  },
  {
    id: 'e2',
    name: 'Payments epic',
    barType: 'epic',
    barColor: '#be185d',
    start: d('2026-02-15'),
    end: d('2026-05-01'),
    progress: 35,
  },
  {
    id: 'e3',
    name: 'Reporting epic',
    barType: 'epic',
    barColor: '#b45309',
    start: d('2026-04-01'),
    end: d('2026-07-01'),
    progress: 10,
  },
  {
    id: 't1',
    name: 'Login flow',
    parentId: 'e1',
    start: d('2026-01-05'),
    end: d('2026-01-25'),
    progress: 100,
  },
  {
    id: 't2',
    name: 'JWT refresh',
    parentId: 'e1',
    start: d('2026-01-20'),
    end: d('2026-02-15'),
    progress: 90,
    dependency: 't1',
  },
  {
    id: 't3',
    name: 'Stripe integration',
    parentId: 'e2',
    start: d('2026-02-15'),
    end: d('2026-03-20'),
    progress: 55,
  },
  {
    id: 't4',
    name: 'Dashboard v1',
    parentId: 'e3',
    start: d('2026-04-01'),
    end: d('2026-05-01'),
    progress: 15,
  },
  {
    id: 'ms1',
    name: 'Scope cutoff',
    type: TaskType.Milestone,
    start: d('2026-03-31'),
    end: d('2026-03-31'),
    barColor: '#b45309',
  },
];

const EPICS = TASKS.filter(t => t.barType === 'epic').length;

@Component({
  selector: 'app-gantt-custom',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, ExampleHeadComponent, ExampleUsageComponent],
  // Charts inside this page resolve barType 'epic' to EpicBarComponent; other pages don't see it
  providers: [provideGanttBar({ type: 'epic', component: EpicBarComponent })],
  template: `
    <header appExampleHead="custom-bar"></header>

    <div class="gs-card">
      <div class="gs-card-head gs-toolbar">
        <div class="gs-seg" role="group" aria-label="Bars of the epics">
          <button type="button" class="gs-seg-btn" [attr.aria-pressed]="epic()" (click)="epic.set(true)">
            barType: 'epic'
          </button>
          <button type="button" class="gs-seg-btn" [attr.aria-pressed]="!epic()" (click)="epic.set(false)">
            Built-in bars
          </button>
        </div>
        <span class="gs-pill">{{ epics }} epics</span>
      </div>

      <gantry
        class="gs-chart ex-chart"
        [series]="tasks()"
        [options]="{ viewMode: 'Month', rowHeight: 44, showToday: true }"
        [darkMode]="theme.isDark()"
        showToolbar
        showLegend
      />
    </div>

    <app-example-usage path="custom-bar" />
  `,
  styles: [EXAMPLE_STYLES],
})
export class GanttCustomComponent {
  protected readonly theme = inject(AppThemeService);
  protected readonly epics = EPICS;

  /** Draw the epics with EpicBarComponent, or switch them back to the built-in bars. */
  protected readonly epic = signal(true);

  /** The template plan moved so today sits inside it */
  private readonly plan = anchorToToday(TASKS).tasks;
  protected readonly tasks = computed(() =>
    this.epic() ? this.plan : this.plan.map(t => (t.barType === 'epic' ? { ...t, barType: undefined } : t)),
  );
}
