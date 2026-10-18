// ─────────────────────────────────────────────────────────────
//  gantry-demo · fixture/fixture.component.ts
//
//  Test-only route (`/fixture`, not listed in the sidebar). Renders
//  <gantry> from `window.__GANTRY_FIXTURE__`, which Playwright sets
//  with `page.addInitScript` (see e2e/paint-fixture.ts and
//  e2e/fixtures.ts). Local ISO date-time strings are revived into
//  Dates; `highlight` becomes `options.highlightTime`. Same host size
//  as the roadmap page.
//
//  For the Phase 9 specs (keyboard, touch, zoom, states, tooltip) it
//  also takes `loading`, `errorMessage`, custom empty content
//  (`[ganttEmpty]`), a tooltip `render` / `<ng-template ganttTooltip>`
//  and a failing paged data source; it records the chart's outputs in
//  `window.__GANTRY_EVENTS__` (the Web Component's event names) and
//  exposes `window.__GANTRY_API__` to change inputs and reach the
//  component.
// ─────────────────────────────────────────────────────────────

import { afterNextRender, ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import {
  GantryComponent,
  GanttDataSource,
  GanttTooltipTemplateDirective,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
  type GanttTimeHighlight,
} from '@gantryjs/angular';

interface FixtureHighlight {
  day: string;
  color?: string;
  label?: string;
}

interface GantryFixture {
  tasks?: unknown[];
  options?: Record<string, unknown>;
  annotations?: unknown[];
  highlight?: FixtureHighlight[];
  darkMode?: boolean | 'auto';
  selected?: string[];
  /** The `loading` input */
  loading?: boolean;
  /** The `errorMessage` input */
  errorMessage?: string | null;
  /** Custom empty-state content (`[ganttEmpty]`): its text */
  emptyContent?: string;
  /** `options.tooltip.render` returns `Custom: <task name>` */
  tooltipRender?: boolean;
  /** An `<ng-template ganttTooltip>` renders `Template: <task name>` (wins over `render`) */
  tooltipTemplate?: boolean;
  /** A paged data source serving `tasks` (the series stays empty) whose first `failures` fetches reject */
  dataSource?: { failures: number; pageSize?: number };
}

/** What `window.__GANTRY_API__.set()` changes (dates as local ISO strings, like the fixture). */
interface FixturePatch {
  tasks?: unknown[];
  options?: Record<string, unknown>;
  darkMode?: boolean | 'auto';
  loading?: boolean;
  errorMessage?: string | null;
}

declare global {
  interface Window {
    __GANTRY_FIXTURE__?: GantryFixture;
    /** The chart's outputs, in order: Web Component event names, JSON details (dates as ISO strings) */
    __GANTRY_EVENTS__?: { type: string; detail: unknown }[];
    /** Fetches the fixture's data source made */
    __GANTRY_FETCHES__?: number;
    /** e2e handle: change the chart's inputs, call its methods */
    __GANTRY_API__?: { set(patch: FixturePatch): void; readonly chart: GantryComponent };
  }
}

/** Local date-time without offset (`2026-10-14T09:00:00`): parsed in the page's time zone. */
const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function revive(value: unknown): unknown {
  if (typeof value === 'string') return LOCAL_ISO.test(value) ? new Date(value) : value;
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function highlightTime(list: FixtureHighlight[]): GanttOptions['highlightTime'] {
  if (!list.length) return undefined;
  const byDay = new Map(list.map(h => [dayKey(new Date(h.day)), h]));
  return (start, unit) => {
    const h = unit === 'day' ? byDay.get(dayKey(start)) : undefined;
    if (!h) return null;
    const out: GanttTimeHighlight = {};
    if (h.color !== undefined) out.color = h.color;
    if (h.label !== undefined) out.label = h.label;
    return out;
  };
}

@Component({
  selector: 'app-fixture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, GanttTooltipTemplateDirective],
  // Two copies of the same chart: projected `[ganttEmpty]` content inside an @if would always fill
  // the slot (no fallback message), so the chart without custom empty content projects none.
  template: `
    @if (emptyContent !== undefined) {
      <gantry
        [series]="tasks()"
        [dataSource]="dataSource"
        [options]="options()"
        [annotations]="annotations"
        [darkMode]="darkMode()"
        [loading]="loading()"
        [errorMessage]="errorMessage()"
        [showToolbar]="true"
        [enableDrag]="true"
        [enableResize]="true"
        [tooltipEnabled]="true"
        [showLegend]="true"
        (taskDragged)="record('task-dragged', $event)"
        (taskResized)="record('task-resized', $event)"
        (selectionChange)="record('selection-change', $event)"
        (viewModeChange)="record('view-mode-change', { viewMode: $event })"
        (retry)="record('retry', $event)"
      >
        <div ganttEmpty class="fixture-empty">{{ emptyContent }}</div>
        @if (tooltipTemplate) {
          <ng-template ganttTooltip let-task="task">
            <span class="fixture-tooltip">Template: {{ task.name }}</span>
          </ng-template>
        }
      </gantry>
    } @else {
      <gantry
        [series]="tasks()"
        [dataSource]="dataSource"
        [options]="options()"
        [annotations]="annotations"
        [darkMode]="darkMode()"
        [loading]="loading()"
        [errorMessage]="errorMessage()"
        [showToolbar]="true"
        [enableDrag]="true"
        [enableResize]="true"
        [tooltipEnabled]="true"
        [showLegend]="true"
        (taskDragged)="record('task-dragged', $event)"
        (taskResized)="record('task-resized', $event)"
        (selectionChange)="record('selection-change', $event)"
        (viewModeChange)="record('view-mode-change', { viewMode: $event })"
        (retry)="record('retry', $event)"
      >
        @if (tooltipTemplate) {
          <ng-template ganttTooltip let-task="task">
            <span class="fixture-tooltip">Template: {{ task.name }}</span>
          </ng-template>
        }
      </gantry>
    }
  `,
  // A fixed box at the top left, above the site shell: what the tests measure (scrolling, windowed
  // rows and columns) never depends on the page around it. e2e/paint.spec.ts gives the Web
  // Component the same box, so both bindings mount the same rows and columns.
  styles: [
    `
      gantry {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 100;
        width: 1150px;
        height: 700px;
      }
    `,
  ],
})
export class FixtureComponent {
  private readonly fixture: GantryFixture = (typeof window !== 'undefined' && window.__GANTRY_FIXTURE__) || {};
  private readonly gantt = viewChild.required(GantryComponent);

  protected readonly emptyContent = this.fixture.emptyContent;
  protected readonly tooltipTemplate = this.fixture.tooltipTemplate === true;
  /** The fixture's data source (its tasks are served page by page; the series stays empty) */
  protected readonly dataSource = this.fixture.dataSource ? this.createDataSource(this.fixture.dataSource) : null;

  protected readonly tasks = signal(this.dataSource ? [] : (revive(this.fixture.tasks ?? []) as GanttTask[]));
  readonly annotations = revive(this.fixture.annotations ?? []) as GanttAnnotation[];
  protected readonly options = signal(this.toOptions(this.fixture.options ?? {}));
  protected readonly darkMode = signal(this.fixture.darkMode ?? false);
  protected readonly loading = signal(this.fixture.loading ?? false);
  protected readonly errorMessage = signal(this.fixture.errorMessage ?? null);

  constructor() {
    const selected = this.fixture.selected ?? [];
    if (selected.length) afterNextRender(() => this.gantt().setSelectedTasks(selected));
    if (typeof window === 'undefined') return;
    window.__GANTRY_EVENTS__ = [];
    const gantt = this.gantt;
    window.__GANTRY_API__ = {
      set: patch => {
        if (patch.tasks !== undefined) this.tasks.set(revive(patch.tasks) as GanttTask[]);
        if (patch.options !== undefined) this.options.set(this.toOptions(patch.options));
        if (patch.darkMode !== undefined) this.darkMode.set(patch.darkMode);
        if (patch.loading !== undefined) this.loading.set(patch.loading);
        if (patch.errorMessage !== undefined) this.errorMessage.set(patch.errorMessage);
      },
      get chart() {
        return gantt();
      },
    };
  }

  /** Records an output under the Web Component's event name (dates become ISO strings). */
  protected record(type: string, detail: unknown): void {
    window.__GANTRY_EVENTS__?.push({ type, detail: JSON.parse(JSON.stringify(detail)) as unknown });
  }

  /** The fixture's options: revived dates, `highlightTime` from `highlight`, the tooltip renderer. */
  private toOptions(raw: Record<string, unknown>): GanttOptions {
    const options = revive(raw) as GanttOptions;
    return {
      ...options,
      highlightTime: highlightTime(this.fixture.highlight ?? []),
      ...(this.fixture.tooltipRender
        ? { tooltip: { ...options.tooltip, render: ({ task }) => `Custom: ${task.name}` } }
        : {}),
    };
  }

  /** Serves the fixture's tasks a page at a time; the first `failures` fetches reject (no automatic retry). */
  private createDataSource(config: { failures: number; pageSize?: number }): GanttDataSource {
    const all = revive(this.fixture.tasks ?? []) as GanttTask[];
    if (typeof window !== 'undefined') window.__GANTRY_FETCHES__ = 0;
    let calls = 0;
    return new GanttDataSource({
      pageSize: config.pageSize ?? 50,
      retries: 0,
      fetcher: (page, size) => {
        calls++;
        if (typeof window !== 'undefined') window.__GANTRY_FETCHES__ = calls;
        if (calls <= config.failures) return Promise.reject(new Error('Network down'));
        return Promise.resolve(all.slice((page - 1) * size, page * size));
      },
    });
  }
}
