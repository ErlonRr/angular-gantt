import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GantryComponent,
  TaskType,
  addDays,
  diffDays,
  formatDate,
  snapToDay,
  type GanttOptions,
  type GanttTask,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/angular';
import { AppThemeService } from '../../shell/app-theme.service';
import { IconComponent } from '../../shell/icon.component';
import { InstallBlockComponent } from '../../shell/install-block.component';
import { FEATURES, STATS, exampleCards, launchPlan, textParts } from './home-data';

const ZOOMS = ['Day', 'Week', 'Month'] as const;

/** The site's home page: hero with a live plan, example charts, features and numbers. */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Page-local classes (`home-*`) only: nothing here may reach the chart's light DOM
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, GantryComponent, IconComponent, InstallBlockComponent],
  template: `
    <div class="gs-lanes home-lanes">
      <section class="gs-hero">
        <div class="gs-hero-grid">
          <div>
            <p class="gs-eyebrow">Web Component · Angular · React · Vue · Svelte</p>
            <h1 class="gs-display">Every plan, on <span class="gs-mark home-nowrap">one timeline.</span></h1>
            <p class="gs-hero-lead">
              A configurable Gantt chart that renders the same in every framework. Zero runtime dependencies, safe under
              a strict CSP, usable from the keyboard, and windowed to stay smooth at 10,000 rows.
            </p>
            <app-install-block pkg="@gantryjs/vanilla" />
            <div class="gs-actions">
              <a class="gs-btn gs-btn--primary" routerLink="/playground">
                Open the playground
                <app-icon name="arrowRight" />
              </a>
              <a class="gs-btn" routerLink="/frameworks">Use it in your framework</a>
            </div>
            <ul class="gs-checks">
              <li>Zero dependencies</li>
              <li>TypeScript types</li>
              <li>SSR-ready</li>
              <li>Strict CSP</li>
            </ul>
          </div>

          <div class="gs-hero-card">
            <div class="gs-toolbar">
              <p class="gs-card-title">Launch plan</p>
              <span class="gs-pill gs-live">Live</span>
              <span class="gs-spacer"></span>
              <div class="gs-seg" role="group" aria-label="Zoom">
                @for (z of zooms; track z) {
                  <button type="button" class="gs-seg-btn" [attr.aria-pressed]="zoom() === z" (click)="zoom.set(z)">
                    {{ z }}
                  </button>
                }
              </div>
            </div>
            <gantry
              class="gs-chart home-hero-chart"
              [series]="plan()"
              [options]="heroOptions"
              [(viewMode)]="zoom"
              [darkMode]="theme.isDark()"
              [showToolbar]="false"
              (taskDragged)="move($event)"
              (taskResized)="move($event)"
            />
            <dl class="gs-tiles home-tiles">
              <div class="gs-tile">
                <dt class="gs-tile-label">Tasks</dt>
                <dd class="gs-tile-value">{{ taskCount() }}</dd>
              </div>
              <div class="gs-tile">
                <dt class="gs-tile-label">Complete</dt>
                <dd class="gs-tile-value">{{ complete() }}%</dd>
              </div>
              <div class="gs-tile">
                <dt class="gs-tile-label">Launch</dt>
                <dd class="gs-tile-value">{{ launch() }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>

    <section class="gs-section" aria-labelledby="home-examples">
      <div class="gs-section-head">
        <div>
          <h2 id="home-examples" class="gs-h2">One chart, every kind of plan</h2>
          <p>Links and the critical path, baselines, working hours, a table: options of the same chart.</p>
        </div>
        <a class="gs-link home-more" routerLink="/examples">
          All examples
          <app-icon name="arrowRight" />
        </a>
      </div>
      <div class="gs-grid gs-grid--2">
        @for (ex of examples; track ex.id) {
          <article class="gs-card gs-example">
            <div class="gs-stage">
              <gantry
                class="gs-chart home-mini"
                [series]="ex.tasks"
                [options]="ex.options"
                [darkMode]="theme.isDark()"
                [showToolbar]="false"
              />
            </div>
            <div class="gs-example-body">
              <div class="gs-example-title">
                <h3 class="gs-h3">{{ ex.title }}</h3>
                <span class="gs-tag">{{ ex.tag }}</span>
              </div>
              <p>{{ ex.text }}</p>
              <pre class="gs-snippet"><code>{{ ex.snippet }}</code></pre>
            </div>
          </article>
        }
      </div>
    </section>

    <section class="gs-section" aria-labelledby="home-details">
      <div class="gs-section-head">
        <h2 id="home-details" class="gs-h2">Small API, careful details</h2>
      </div>
      <div class="gs-grid gs-grid--3">
        @for (f of features; track f.title) {
          <div class="gs-card gs-feature">
            <h3 class="gs-h3">{{ f.title }}</h3>
            <p>
              @for (part of f.parts; track $index) {
                <!-- No whitespace around the parts: it would show before the punctuation -->
                @if (part.code) {
                  <code class="gs-code-inline">{{ part.text }}</code>
                } @else {
                  <span>{{ part.text }}</span>
                }
              }
            </p>
          </div>
        }
      </div>
      <div class="gs-grid gs-grid--4 home-stats">
        @for (s of stats; track s.label) {
          <div class="gs-card gs-stat">
            <div class="gs-stat-value">{{ s.value }}</div>
            <div class="gs-stat-label">{{ s.label }}</div>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .home-lanes {
      margin-top: -40px;
      padding-top: 16px;
    }
    .gs-chart.home-hero-chart {
      height: 270px;
      border: 1px solid var(--gs-border);
      border-radius: var(--gs-radius-sm);
      overflow: hidden;
    }
    .gs-chart.home-mini {
      height: 200px;
    }
    .home-nowrap {
      white-space: nowrap;
    }
    .home-tiles,
    .home-tiles dd {
      margin: 0;
    }
    .home-more {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    .home-more svg {
      width: 16px;
      height: 16px;
    }
    .home-stats {
      margin-top: 16px;
    }
  `,
})
export class HomePageComponent {
  protected readonly theme = inject(AppThemeService);

  private readonly today = snapToDay(new Date());

  protected readonly zooms = ZOOMS;
  protected readonly zoom = signal<string | undefined>('Week');
  protected readonly heroOptions: GanttOptions = {
    view: 'chart',
    panel: { collapsible: false },
    rowHeight: 40,
    timelinePadding: 3,
    // Centre the plan (12 days ago to 8 days ahead, plus the milestone's label), not today
    initialScroll: addDays(this.today, -1),
    labels: { ariaChart: 'Launch plan' },
  };
  protected readonly plan = signal<GanttTask[]>(launchPlan(this.today));

  protected readonly examples = exampleCards(this.today);
  protected readonly features = FEATURES.map(f => ({ ...f, parts: textParts(f.text) }));
  protected readonly stats = STATS;

  private readonly work = computed(() => this.plan().filter(t => t.type !== TaskType.Milestone));
  protected readonly taskCount = computed(() => this.work().length);
  /** Progress weighted by each task's length in calendar days */
  protected readonly complete = computed(() => {
    let days = 0;
    let done = 0;
    for (const t of this.work()) {
      const d = Math.max(diffDays(t.start, t.end), 1);
      days += d;
      done += d * (t.progress ?? 0);
    }
    return days ? Math.round(done / days) : 0;
  });
  protected readonly launch = computed(() => {
    const m = this.plan().find(t => t.type === TaskType.Milestone);
    return m ? formatDate(m.start, 'D MMM', 'en') : '—';
  });

  /** A bar was dragged or resized: keep the new dates, so the tiles follow */
  protected move(e: TaskDragEvent | TaskResizeEvent): void {
    this.plan.update(ts => ts.map(t => (t.id === e.taskId ? { ...t, start: e.newStart, end: e.newEnd } : t)));
  }
}
