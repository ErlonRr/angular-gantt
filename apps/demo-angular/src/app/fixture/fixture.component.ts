// ─────────────────────────────────────────────────────────────
//  gantry-demo · fixture/fixture.component.ts
//
//  Test-only route (`/fixture`, not listed in the sidebar). Renders
//  <gantry> from `window.__GANTRY_FIXTURE__`, which Playwright sets
//  with `page.addInitScript` (see e2e/paint-fixture.ts). Local ISO
//  date-time strings are revived into Dates; `highlight` becomes
//  `options.highlightTime`. Same host size as the roadmap page.
// ─────────────────────────────────────────────────────────────

import { afterNextRender, ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import {
  GantryComponent,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
  type GanttTimeHighlight,
} from 'ngx-gantry';

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
}

declare global {
  interface Window {
    __GANTRY_FIXTURE__?: GantryFixture;
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
  imports: [GantryComponent],
  template: `
    <gantry
      [series]="tasks"
      [options]="options"
      [annotations]="annotations"
      [darkMode]="darkMode"
      [showToolbar]="true"
      [enableDrag]="true"
      [enableResize]="true"
      [tooltipEnabled]="true"
      [showLegend]="true"
    />
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

  readonly tasks = revive(this.fixture.tasks ?? []) as GanttTask[];
  readonly annotations = revive(this.fixture.annotations ?? []) as GanttAnnotation[];
  readonly options: GanttOptions = {
    ...(revive(this.fixture.options ?? {}) as GanttOptions),
    highlightTime: highlightTime(this.fixture.highlight ?? []),
  };
  readonly darkMode = this.fixture.darkMode ?? false;

  constructor() {
    const selected = this.fixture.selected ?? [];
    if (selected.length) afterNextRender(() => this.gantt().setSelectedTasks(selected));
  }
}
