import { test as base, expect, type CDPSession, type Page, type Locator } from '@playwright/test';
import { day, type FixtureTask } from './paint-fixture';
import { TARGETS } from '../playwright.config';

/** Fixed "now" for every page: dates, the today marker and screenshots stay stable. */
// Explicit offset: the browser runs in Europe/Rome (CEST on that date), the runner may not
export const NOW = new Date('2026-10-14T10:00:00+02:00');

type Fixtures = { chart: Chart; pageErrors: string[] };

/**
 * `chart` drives either binding: Playwright CSS locators pierce the Web Component's
 * open shadow root, so the same selectors work for `<gantry-element>` and Angular's `<gantry>`.
 * Every test fails if the page logs an error or throws.
 */
export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
      page.on('console', m => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await page.clock.setFixedTime(NOW);
      await use(errors);
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
  chart: async ({ page }, use) => {
    await use(new Chart(page));
  },
});
export { expect };

export const SEL = {
  row: '.gantt-tl-row',
  taskBar: '.gantt-bars-layer [data-bar-type="task"] .gantt-bar-body',
  tier: '.g-tier',
  colHeaders: '.gantt-tl-col-headers',
  timelineHeader: '.g-header',
  rowRect: '.gantt-rows rect',
  panel: '.gantry-panel',
  viewport: '.gantry-canvas-viewport',
  main: '.gantry-main',
  toggle: '.gantry-splitter-toggle',
  viewPills: '.gantt-tb-views .gantt-tb-pill',
  /** The toolbar's built-in controls (one roving set, Phase 9 step 4.3); not `[ganttToolbar]` content */
  toolbarControls: '.gantt-toolbar .gantt-tb-group button[data-focus-key]',
  legend: '.gantt-legend',
} as const;

export class Chart {
  constructor(readonly page: Page) {}

  host(): Locator {
    return this.page.locator('gantry-element, gantry').first();
  }
  get(selector: string): Locator {
    return this.host().locator(selector);
  }
  viewport(): Locator {
    return this.get(SEL.viewport).first();
  }
  panel(): Locator {
    return this.get(SEL.panel).first();
  }

  async open(url: string): Promise<void> {
    await this.page.goto(url);
    await expect(this.get(SEL.row).first()).toBeVisible();
  }

  /** Run `fn` against the element hosting the chart (shadow root for the Web Component). */
  evalRoot<R, A = undefined>(fn: (root: ParentNode, arg: A) => R, arg?: A): Promise<R> {
    return this.host().evaluate(
      (host, [src, a]) => {
        const root = (host as HTMLElement).shadowRoot ?? host;
        // The callback crosses into the page as source text: rebuild it there
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        return new Function('root', 'arg', `return (${src})(root, arg)`)(root, a);
      },
      [fn.toString(), arg] as const,
    ) as Promise<R>;
  }

  /** `data-focus-key` of the element focused inside the chart (shadow root or light DOM), or `null`. */
  focusedKey(): Promise<string | null> {
    return this.host().evaluate(host => {
      // The Web Component's focus is inside its shadow root; Angular's is a light-DOM descendant
      const active = host.shadowRoot ? host.shadowRoot.activeElement : document.activeElement;
      if (!active || (!host.shadowRoot && !host.contains(active))) return null;
      return active.getAttribute('data-focus-key');
    });
  }

  /** Bounding box, retried: the Web Component rebuilds parts of its DOM on every render. */
  async box(locator: Locator) {
    let b: Awaited<ReturnType<Locator['boundingBox']>> = null;
    await expect.poll(async () => (b = await locator.boundingBox().catch(() => null)) !== null).toBe(true);
    return b!;
  }
}

/** Computed colours by stable element key (see `collectPaints`). */
export type PaintRecords = Record<string, string>;

/**
 * Computed colours of every element of the chart, keyed by a stable structural path and
 * sorted. The path restarts at "anchor" layers (`bars`, `arrows`, `bands`, `header`…) and at
 * any element with a `data-task-id` (`bars[api]/path.gantt-bar-body`), so a key names the same
 * thing in both bindings wherever their markup agrees. The visible tooltip (a popover inside the
 * chart in both bindings) is collected under `tooltip/…`.
 * SVG elements record fill / stroke / opacities; HTML elements and SVG text record color,
 * background, border colours, opacity and font family. Runs CSS animations to their end first.
 */
export function collectPaints(chart: Chart): Promise<PaintRecords> {
  return chart.evalRoot(root => {
    const host = root instanceof ShadowRoot ? root.host : (root as Element);
    const anims = [...document.getAnimations(), ...(root instanceof ShadowRoot ? root.getAnimations() : [])];
    for (const a of anims) {
      const end = a.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end)) a.finish();
    }

    const ANCHORS: Record<string, string> = {
      'gantt-toolbar': 'toolbar',
      'gantt-legend': 'legend',
      'g-header': 'header',
      'gantt-tl-col-headers': 'tl-head',
      'gantt-tl-rows': 'tl-rows',
      'gantt-rows': 'rows',
      'gantt-bands': 'bands',
      'gantt-grid': 'grid',
      'gantt-annotations': 'annotations',
      'gantt-annotation-labels': 'annotation-labels',
      'gantt-today': 'today',
      'gantt-arrows': 'arrows',
      'gantt-bars-layer': 'bars',
      'gantt-tooltip': 'tooltip',
    };
    const SKIP = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'LINK']);
    const out: Record<string, string> = {};

    const classOf = (el: Element) => [...el.classList].find(c => !c.startsWith('ng-') && !c.startsWith('_ng')) ?? '';
    const anchorOf = (el: Element) => {
      for (const c of el.classList) if (ANCHORS[c]) return ANCHORS[c];
      return null;
    };
    const token = (el: Element) => {
      const id = el.getAttribute('data-task-id');
      if (id !== null) return `[${id}]`;
      const c = classOf(el);
      return el.tagName.toLowerCase() + (c ? `.${c}` : '');
    };
    const segment = (el: Element) => {
      const t = token(el);
      let i = 0;
      for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (token(s) === t) i++;
      return i ? `${t}:${String(i).padStart(3, '0')}` : t;
    };
    const record = (el: Element, key: string) => {
      const cs = getComputedStyle(el);
      const svg = el instanceof SVGElement;
      const parts: string[] = [];
      if (svg) {
        parts.push(
          `fill=${cs.fill}`,
          `stroke=${cs.stroke}`,
          `fill-opacity=${cs.fillOpacity}`,
          `stroke-opacity=${cs.strokeOpacity}`,
        );
      }
      if (!svg || el.tagName.toLowerCase() === 'text') {
        parts.push(`color=${cs.color}`);
        if (!svg) {
          parts.push(`background-color=${cs.backgroundColor}`);
          const b = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
          parts.push(b.every(c => c === b[0]) ? `border-color=${b[0]}` : `border-colors=${b.join(' | ')}`);
        }
        parts.push(`font-family=${cs.fontFamily}`);
      }
      parts.push(`opacity=${cs.opacity}`);
      let k = key;
      for (let n = 2; k in out; n++) k = `${key}~${n}`;
      out[k] = parts.join('; ');
    };
    const walk = (el: ParentNode, path: string, inTooltip: boolean) => {
      for (const child of el.children) {
        if (SKIP.has(child.tagName)) continue;
        if (!inTooltip && child.classList.contains('gantt-tooltip')) continue;
        const anchor = anchorOf(child);
        const seg = segment(child);
        const key = child.hasAttribute('data-task-id')
          ? `${path.split('/')[0]}${seg}`
          : anchor && !inTooltip
            ? anchor
            : `${path}/${seg}`;
        record(child, key);
        walk(child, key, inTooltip);
      }
    };

    record(host, 'host');
    walk(root, 'host', false);
    // The open tooltip: a popover in the shadow root (Web Component) or in <gantry> (Angular)
    const tip = [...root.querySelectorAll('.gantt-tooltip')].find(t => getComputedStyle(t).display !== 'none');
    if (tip) {
      record(tip, 'tooltip');
      walk(tip, 'tooltip', true);
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

// ── Phase 9 harness: one setup, the same test body for both bindings ──────────
//
// The keyboard, touch, zoom, states and tooltip specs render the same plan in the Web Component
// (a fresh `<gantry-element>` in the playground page, in the fixed 1150 × 700 box of the paint
// fixture) and in Angular (the showcase's `/fixture` route, fed through `window.__GANTRY_FIXTURE__`),
// record the chart's events in `window.__GANTRY_EVENTS__` (Web Component event names, JSON
// details) and drive both through `Gantt`.

/** The bindings the Phase 9 specs run against. */
export type Binding = 'vanilla' | 'angular';
export const BINDINGS: readonly Binding[] = ['vanilla', 'angular'];

/** The events the harness records (Angular outputs are recorded under these names). */
const RECORDED_EVENTS = ['task-dragged', 'task-resized', 'selection-change', 'view-mode-change', 'retry'] as const;
export type RecordedEvent = (typeof RECORDED_EVENTS)[number];

/** px per day of the built-in zoom levels (core `DEFAULT_ZOOM_LEVELS`). */
export const LEVEL_PX_PER_DAY: Record<string, number> = {
  Hour: 960,
  Day: 48,
  Week: 20,
  Month: 8,
  Quarter: 4,
  Year: 2,
};
/** The built-in zoom levels, finest first. */
export const LEVELS = Object.keys(LEVEL_PX_PER_DAY);

/**
 * The plan the Phase 9 specs use (dates relative to `NOW`, a Wednesday): two groups, a milestone and
 * two loose tasks over 38 days — wider than the timeline at the Day level, so "fit" has work to do.
 */
export const PLAN: FixtureTask[] = [
  { id: 'plan', name: 'Planning', type: 'group', start: day(-12), end: day(2), progress: 70 },
  { id: 'scope', name: 'Scope', parentId: 'plan', start: day(-12), end: day(-8), progress: 100 },
  { id: 'research', name: 'Research', parentId: 'plan', start: day(-8), end: day(-3), dependency: 'scope' },
  { id: 'specs', name: 'Specifications', parentId: 'plan', start: day(-3), end: day(2), dependency: 'research' },
  { id: 'build', name: 'Build', type: 'group', start: day(0), end: day(22), progress: 20 },
  { id: 'api', name: 'API', parentId: 'build', start: day(0), end: day(8), progress: 40, dependency: 'specs' },
  { id: 'ui', name: 'Interface', parentId: 'build', start: day(4), end: day(14), dependency: 'api' },
  { id: 'tests', name: 'Tests', parentId: 'build', start: day(14), end: day(22), dependency: 'ui' },
  { id: 'launch', name: 'Launch', type: 'milestone', start: day(24), end: day(24), dependency: 'tests' },
  { id: 'docs', name: 'Documentation', start: day(-6), end: day(10), progress: 5 },
  { id: 'retro', name: 'Retro', start: day(20), end: day(26) },
];

/** `count` loose tasks to add to a plan (more rows than the viewport shows). */
export function extraTasks(count: number): FixtureTask[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `extra-${i}`,
    name: `Extra task ${i + 1}`,
    start: day(-10 + (i % 20)),
    end: day(-4 + (i % 20)),
  }));
}

/** What a Phase 9 spec renders, identically in both bindings. */
export interface GanttSetup {
  /** Default: `PLAN` */
  tasks?: FixtureTask[];
  /** Default: `{ viewMode: 'Day', initialScroll: false }` (the timeline starts at its left edge) */
  options?: Record<string, unknown>;
  darkMode?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  /** Custom empty-state content (`slot="empty"` / `[ganttEmpty]`): its text */
  emptyContent?: string;
  /** `options.tooltip.render` returns `Custom: <task name>` */
  tooltipRender?: boolean;
  /** Angular only: an `<ng-template ganttTooltip>` renders `Template: <task name>` */
  tooltipTemplate?: boolean;
  /** A paged data source serving `tasks` whose first `failures` fetches reject (no automatic retry) */
  dataSource?: { failures: number; pageSize?: number };
  /** The chart's box in px. Default: 1150 × 700 */
  box?: { width: number; height: number };
}

/** What `Gantt.set` changes after the chart is open. */
export interface GanttPatch {
  tasks?: FixtureTask[];
  options?: Record<string, unknown>;
  darkMode?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
}

export const DEFAULT_OPTIONS: Record<string, unknown> = { viewMode: 'Day', initialScroll: false };

interface RecordedEntry {
  type: string;
  detail: Record<string, unknown>;
}

/** What `focused()` reports about the element holding focus inside the chart. */
export interface FocusInfo {
  /** toolbar, row, cell, column-header, bar, splitter, toggle, viewport, retry, … */
  kind: string;
  /** Its `data-focus-key` */
  key: string | null;
  /** The task it belongs to (`data-task-id` of the bar or row) */
  taskId: string | null;
}

/** The element holding focus inside the chart, or `null` once focus left it. */
export function focused(chart: Chart): Promise<FocusInfo | null> {
  return chart.page.evaluate(() => {
    const host = document.querySelector('gantry-element, gantry');
    if (!host) return null;
    let a: Element | null;
    if (host.shadowRoot) {
      if (document.activeElement !== host) return null;
      a = host.shadowRoot.activeElement;
      if (!a) return { kind: 'host', key: null, taskId: null };
    } else {
      a = document.activeElement;
      if (!a || !host.contains(a)) return null;
    }
    const key = a.getAttribute('data-focus-key');
    const taskId = a.closest('[data-task-id]')?.getAttribute('data-task-id') ?? null;
    if (a.closest('.gantt-toolbar')) return { kind: 'toolbar', key, taskId };
    if (a.parentElement?.classList.contains('gantt-bars-layer')) return { kind: 'bar', key, taskId };
    const kinds: Record<string, string> = {
      'gantt-tl-col-header': 'column-header',
      'gantt-tl-cell': 'cell',
      'gantt-tl-row': 'row',
      'gantt-collapse-btn': 'collapse',
      'gantry-splitter-handle': 'splitter',
      'gantry-splitter-toggle': 'toggle',
      'gantry-canvas-viewport': 'viewport',
      'gantt-state-retry': 'retry',
    };
    for (const [cls, kind] of Object.entries(kinds)) if (a.classList.contains(cls)) return { kind, key, taskId };
    return { kind: `${a.tagName.toLowerCase()}.${a.getAttribute('class') ?? ''}`, key, taskId };
  });
}

/** Two animation frames: the Web Component paints once per frame, Angular renders within one. */
export const frames = (page: Page): Promise<unknown> =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** The page script both drivers share: local ISO date-time strings → `Date`s. */
function reviveSource(): string {
  return `(function revive(v) {
    if (typeof v === 'string') return /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$/.test(v) ? new Date(v) : v;
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
    return v;
  })`;
}

/**
 * Drives one binding of the Phase 9 harness: open a setup, change inputs, call methods, read the
 * recorded events, the zoom level, the viewport and the live region.
 */
export class Gantt {
  private setup: GanttSetup = {};
  constructor(
    readonly chart: Chart,
    readonly binding: Binding,
  ) {}

  get page(): Page {
    return this.chart.page;
  }

  /** Render `setup` (a fresh chart) and wait until it shows rows or a state. */
  async open(setup: GanttSetup = {}): Promise<void> {
    this.setup = setup;
    const fx = {
      ...setup,
      tasks: setup.tasks ?? PLAN,
      options: setup.options ?? DEFAULT_OPTIONS,
    };
    if (this.binding === 'vanilla') {
      await this.chart.open(`http://localhost:${TARGETS.vanilla.port}/`);
      await this.chart.host().evaluate(
        (old, [f, events, src]) => {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          const revive = new Function(`return ${src}`)() as (v: unknown) => unknown;
          const w = window as unknown as Record<string, unknown>;
          const log: { type: string; detail: unknown }[] = [];
          w['__GANTRY_EVENTS__'] = log;
          const el = document.createElement('gantry-element') as HTMLElement & Record<string, unknown>;
          el.id = old.id;
          for (const [prop, value] of [
            ['position', 'fixed'],
            ['top', '0'],
            ['left', '0'],
            ['z-index', '100'],
            ['width', `${f.box?.width ?? 1150}px`],
            ['height', `${f.box?.height ?? 700}px`],
          ]) {
            el.style.setProperty(prop, value);
          }
          el['darkMode'] = f.darkMode ?? false;
          el['showToolbar'] = true;
          el['enableDrag'] = true;
          el['enableResize'] = true;
          el['tooltipEnabled'] = true;
          el['showLegend'] = true;
          el['loading'] = f.loading ?? false;
          el['errorMessage'] = f.errorMessage ?? null;
          const options = revive(f.options) as Record<string, unknown>;
          if (f.tooltipRender) {
            options['tooltip'] = {
              ...(options['tooltip'] as object | undefined),
              render: ({ task }: { task: { name: string } }) => `Custom: ${task.name}`,
            };
          }
          el['options'] = options;
          const tasks = revive(f.tasks) as unknown[];
          if (f.dataSource) {
            const failures = f.dataSource.failures;
            w['__GANTRY_FETCHES__'] = 0;
            let calls = 0;
            el['dataSource'] = {
              pageSize: f.dataSource.pageSize ?? 50,
              retries: 0,
              fetcher: (page: number, size: number) => {
                calls++;
                w['__GANTRY_FETCHES__'] = calls;
                if (calls <= failures) return Promise.reject(new Error('Network down'));
                return Promise.resolve(tasks.slice((page - 1) * size, page * size));
              },
            };
          } else {
            el['tasks'] = tasks;
          }
          if (f.emptyContent !== undefined) {
            const empty = document.createElement('div');
            empty.slot = 'empty';
            empty.className = 'fixture-empty';
            empty.textContent = f.emptyContent;
            el.append(empty);
          }
          for (const type of events) {
            el.addEventListener(type, e =>
              log.push({ type, detail: JSON.parse(JSON.stringify((e as CustomEvent).detail ?? null)) as unknown }),
            );
          }
          old.replaceWith(el);
        },
        [fx, RECORDED_EVENTS, reviveSource()] as const,
      );
    } else {
      await this.page.addInitScript(f => {
        (window as Window & { __GANTRY_FIXTURE__?: unknown }).__GANTRY_FIXTURE__ = f;
      }, fx);
      await this.page.goto(`http://localhost:${TARGETS.angular.port}/fixture`);
      await expect
        .poll(() => this.page.evaluate(() => !!(window as unknown as Record<string, unknown>)['__GANTRY_API__']))
        .toBe(true);
    }
    await expect(this.chart.get(`${SEL.row}, .gantt-state`).first()).toBeAttached();
    await frames(this.page);
  }

  /** Change inputs of the open chart (dates as local ISO strings). */
  async set(patch: GanttPatch): Promise<void> {
    if (this.binding === 'vanilla') {
      await this.chart.host().evaluate(
        (el, [p, tooltipRender, src]) => {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          const revive = new Function(`return ${src}`)() as (v: unknown) => unknown;
          const g = el as HTMLElement & Record<string, unknown>;
          if (p.tasks !== undefined) g['tasks'] = revive(p.tasks);
          if (p.options !== undefined) {
            const options = revive(p.options) as Record<string, unknown>;
            if (tooltipRender) {
              options['tooltip'] = {
                ...(options['tooltip'] as object | undefined),
                render: ({ task }: { task: { name: string } }) => `Custom: ${task.name}`,
              };
            }
            g['options'] = options;
          }
          if (p.darkMode !== undefined) g['darkMode'] = p.darkMode;
          if (p.loading !== undefined) g['loading'] = p.loading;
          if (p.errorMessage !== undefined) g['errorMessage'] = p.errorMessage;
        },
        [patch, this.setup.tooltipRender ?? false, reviveSource()] as const,
      );
    } else {
      await this.page.evaluate(p => {
        const api = (window as unknown as { __GANTRY_API__: { set(p: unknown): void } }).__GANTRY_API__;
        api.set(p);
      }, patch);
    }
    await frames(this.page);
  }

  /** Call a public method of the chart (local ISO strings in `args` become `Date`s). */
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R> {
    return this.page.evaluate(
      ([m, a, src]) => {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const revive = new Function(`return ${src}`)() as (v: unknown) => unknown;
        const w = window as unknown as { __GANTRY_API__?: { chart: Record<string, unknown> } };
        const target = (w.__GANTRY_API__?.chart ?? document.querySelector('gantry-element')) as unknown as Record<
          string,
          (...x: unknown[]) => unknown
        >;
        return JSON.parse(JSON.stringify(target[m](...(revive(a) as unknown[])) ?? null)) as unknown;
      },
      [method, args, reviveSource()] as const,
    ) as Promise<R>;
  }

  /** The events recorded since the chart opened (or `clearEvents`), optionally of one type. */
  async events(type?: RecordedEvent): Promise<RecordedEntry[]> {
    const all = await this.page.evaluate(
      () => (window as unknown as { __GANTRY_EVENTS__?: RecordedEntry[] }).__GANTRY_EVENTS__ ?? [],
    );
    return type ? all.filter(e => e.type === type) : all;
  }

  clearEvents(): Promise<void> {
    return this.page.evaluate(() => {
      const log = (window as unknown as { __GANTRY_EVENTS__?: unknown[] }).__GANTRY_EVENTS__;
      if (log) log.length = 0;
    });
  }

  /** Fetches made by the setup's data source. */
  fetches(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __GANTRY_FETCHES__?: number }).__GANTRY_FETCHES__ ?? 0);
  }

  /** The zoom level checked in the toolbar (`data-focus-key="zoom:<name>"`), `null` when none is. */
  level(): Promise<string | null> {
    return this.chart.evalRoot(root => {
      const radio = root.querySelector(
        '.gantt-toolbar .gantt-tb-pills[role="radiogroup"]:not(.gantt-tb-views) [aria-checked="true"]',
      );
      return radio?.getAttribute('data-focus-key')?.replace(/^zoom:/, '') ?? null;
    });
  }

  /** The timeline viewport: scroll offsets, client size and its content box's left edge in client px. */
  viewportMetrics(): Promise<{
    scrollLeft: number;
    scrollTop: number;
    clientWidth: number;
    clientHeight: number;
    left: number;
    top: number;
  }> {
    return this.chart.viewport().evaluate(v => {
      const r = v.getBoundingClientRect();
      return {
        scrollLeft: v.scrollLeft,
        scrollTop: v.scrollTop,
        clientWidth: v.clientWidth,
        clientHeight: v.clientHeight,
        left: r.left + v.clientLeft,
        top: r.top + v.clientTop,
      };
    });
  }

  /** `getBarVisual(id)`: the bar's box in timeline px. */
  barVisual(id: string): Promise<{ x: number; y: number; width: number; height: number }> {
    return this.call('getBarVisual', id);
  }

  /** The tasks of `ids` whose bar is not fully inside the timeline viewport horizontally (`[]`: all in view). */
  async inView(ids: readonly string[]): Promise<string[]> {
    const vp = await this.viewportMetrics();
    const out: string[] = [];
    for (const id of ids) {
      const v = await this.barVisual(id);
      if (v.x < vp.scrollLeft - 1 || v.x + v.width > vp.scrollLeft + vp.clientWidth + 1) out.push(id);
    }
    return out;
  }

  /** The bar group of task `id` (`g[data-task-id]` in the bars layer). */
  bar(id: string): Locator {
    return this.chart.get(`.gantt-bars-layer > [data-task-id="${id}"]`);
  }

  /**
   * `aria-posinset` of the focused bar (its row's position, 1-based), `null` when no bar has focus.
   * Read in one go: bars come and go with the virtual window, a locator would wait for a gone one.
   */
  focusedPosition(): Promise<number | null> {
    return this.chart.evalRoot(root => {
      const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      if (!active?.parentElement?.classList.contains('gantt-bars-layer')) return null;
      const pos = active.getAttribute('aria-posinset');
      return pos === null ? null : Number(pos);
    });
  }

  /** The text of the polite live region. */
  liveText(): Promise<string> {
    return this.chart
      .get('.gantt-sr-live')
      .first()
      .evaluate(el => el.textContent?.trim() ?? '');
  }

  /** Insert a button just before the chart and focus it: the next Tab enters the chart. */
  async focusBefore(): Promise<void> {
    await this.chart.host().evaluate(el => {
      if (document.getElementById('e2e-before')) return;
      const before = document.createElement('button');
      before.id = 'e2e-before';
      before.textContent = 'Before the chart';
      el.before(before);
    });
    await this.page.locator('#e2e-before').focus();
  }

  /** Press Tab until focus is on a `kind` stop inside the chart (at most `max` presses). */
  async tabTo(kind: string, max = 12): Promise<FocusInfo> {
    for (let i = 0; i < max; i++) {
      await this.page.keyboard.press('Tab');
      const f = await focused(this.chart);
      if (f?.kind === kind) return f;
    }
    throw new Error(`Tab never reached a ${kind}`);
  }
}

// ── Touch through the Chrome DevTools Protocol ────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/**
 * Touch input through CDP `Input.dispatchTouchEvent` (the page needs `hasTouch`): real touch and
 * pointer events, with the browser's own gesture handling (panning, `touch-action`, taps → clicks).
 * Each call lists the fingers on the screen; their ids are their positions in the list.
 */
export class TouchScreen {
  private constructor(private readonly cdp: CDPSession) {}

  static async attach(page: Page): Promise<TouchScreen> {
    return new TouchScreen(await page.context().newCDPSession(page));
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: readonly Point[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id, radiusX: 1, radiusY: 1, force: 1 })),
    });
  }

  /** Fingers down at `points`. */
  down(...points: Point[]): Promise<void> {
    return this.send('touchStart', points);
  }
  /** The fingers (all of them, in the same order) are now at `points`. */
  move(...points: Point[]): Promise<void> {
    return this.send('touchMove', points);
  }
  /** Every finger lifts. */
  up(): Promise<void> {
    return this.send('touchEnd', []);
  }

  /** One finger from `from` to `to` in `steps` moves (already down). */
  async slide(from: Point, to: Point, steps = 8): Promise<void> {
    for (let i = 1; i <= steps; i++) {
      await this.move({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
    }
  }

  /** A quick one-finger swipe: down, slide, up. */
  async swipe(from: Point, to: Point, steps = 8): Promise<void> {
    await this.down(from);
    await this.slide(from, to, steps);
    await this.up();
  }

  /** A tap: down and up at once. */
  async tap(p: Point): Promise<void> {
    await this.down(p);
    await this.up();
  }

  /**
   * A two-finger pinch centred on `center`, the fingers side by side `from` px apart, spreading to
   * `to` px (spread: zoom in; closer: zoom out) in `steps` moves, then lifted.
   */
  async pinch(center: Point, from: number, to: number, steps = 8): Promise<void> {
    const at = (d: number): [Point, Point] => [
      { x: center.x - d / 2, y: center.y },
      { x: center.x + d / 2, y: center.y },
    ];
    await this.down(...at(from));
    for (let i = 1; i <= steps; i++) await this.move(...at(from + ((to - from) * i) / steps));
    await this.up();
  }
}
