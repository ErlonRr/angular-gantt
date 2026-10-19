// SSR smoke (Gantry 2 phase 7, step 2.2): `<gantry>` renders through @angular/platform-server's
// `renderApplication` (domino document, `ngServerMode`) without browser APIs. During the render
// `requestAnimationFrame` / `cancelAnimationFrame` are missing (as in Node; Angular's zoneless
// scheduler itself races a frame whenever `requestAnimationFrame` is a function), and
// `ResizeObserver`, `IntersectionObserver`, `matchMedia` and `setInterval` record the call and
// throw: anything that reaches them outside `afterNextRender` / an event handler fails the render.
// `window` / `document` stay defined (the test environment's DOM adapter, installed first, reads
// `document`): the ESLint `no-restricted-globals` rule on the library guards those.
//
// Spec files share one environment (`isolate: false`), so the spec hands the TestBed platform over
// to the server platform and back: `beforeAll` resets the test environment and destroys the browser
// platform, `afterAll` restores the globals domino replaced and initialises TestBed again with the
// same module and options as `@angular/build`'s setup (`init-testbed`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Component,
  DOCUMENT,
  destroyPlatform,
  provideZonelessChangeDetection,
  type ApplicationRef,
  type Type,
} from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { bootstrapApplication, type BootstrapContext } from '@angular/platform-browser';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDataSource } from './datasource/gantt-datasource';
import {
  TaskType,
  buildTimeline,
  resolveConfig,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';

const day = (d: number) => new Date(2026, 4, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Launch plan', type: TaskType.Group, start: day(4), end: day(29) },
  { id: 'a', name: 'Design', parentId: 'g', start: day(4), end: day(11), progress: 60 },
  { id: 'b', name: 'Build', parentId: 'g', start: day(11), end: day(25), dependency: 'a' },
  { id: 'm', name: 'Release', type: TaskType.Milestone, start: day(29), end: day(29), dependency: 'b' },
];
/** A year at the Day level: far wider than the server's assumed viewport */
const LONG_TASKS: GanttTask[] = [{ id: 'y', name: 'Year', start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) }];
const LONG_OPTIONS: GanttOptions = { initialScroll: false, viewMode: 'Day', showToday: false };

@Component({
  selector: 'app-root',
  imports: [GantryComponent],
  template: `
    <gantry
      id="laned"
      style="height: 420px"
      [series]="tasks"
      [annotations]="annotations"
      [options]="options"
      [showLegend]="true"
    />
    <gantry id="paged" style="height: 300px" [dataSource]="dataSource" [options]="options" />
    <gantry id="long" style="height: 200px" [series]="longTasks" [options]="longOptions" />
  `,
})
class SsrHost {
  readonly tasks = TASKS;
  /** A labelled annotation: the marker lane shows (and takes the label off the canvas) */
  readonly annotations: GanttAnnotation[] = [{ x1: day(18), label: { text: 'Freeze' } }];
  readonly options: GanttOptions = { initialScroll: false, criticalPath: true };
  readonly dataSource = new GanttDataSource({ data: TASKS });
  readonly longTasks = LONG_TASKS;
  readonly longOptions = LONG_OPTIONS;
}

/** Browser APIs that must not run during a server render: each records the call and throws */
const FORBIDDEN = ['ResizeObserver', 'IntersectionObserver', 'matchMedia', 'setInterval'] as const;

function stubBrowserApis(calls: string[]): void {
  for (const name of FORBIDDEN) {
    vi.stubGlobal(name, function forbidden(): never {
      calls.push(name);
      throw new Error(`${name} used during a server render`);
    });
  }
  // Missing on a server, like in Node
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
}

/**
 * Domino puts its DOM classes on `globalThis` (`Object.assign(globalThis, domino.impl)`, through
 * the test environment's setters) and the server platform leaves `ngServerMode` behind: remember
 * every global and put it back after the render.
 */
function snapshotGlobals(): () => void {
  const g = globalThis as Record<string, unknown>;
  const before = Object.getOwnPropertyDescriptors(g);
  // Domino's DOM classes replace functions only (other values, e.g. the test DOM's `CSS`, are left alone)
  const classes = new Map(
    Object.keys(before)
      .filter(k => /^[A-Z]/.test(k) && typeof g[k] === 'function')
      .map(k => [k, g[k]]),
  );
  return () => {
    for (const key of Object.getOwnPropertyNames(g)) {
      const was = before[key];
      if (!was) {
        delete g[key];
        continue;
      }
      const now = Object.getOwnPropertyDescriptor(g, key);
      if (!Object.is(now?.value, was.value) || now?.get !== was.get || now?.set !== was.set) {
        Object.defineProperty(g, key, was);
      } else if (was.set && classes.has(key) && !Object.is(g[key], classes.get(key))) {
        was.set.call(g, classes.get(key));
      }
    }
  };
}

async function renderOnServer(root: Type<unknown>): Promise<string> {
  const bootstrap = (context: BootstrapContext): Promise<ApplicationRef> =>
    bootstrapApplication(root, { providers: [provideServerRendering(), provideZonelessChangeDetection()] }, context);
  return renderApplication(bootstrap, { document: '<html><head></head><body><app-root></app-root></body></html>' });
}

let testModule: Type<unknown> | Type<unknown>[] = BrowserTestingModule;
/** DOM classes of the test environment, before any server render */
const TEST_DOM = { Node, Element, HTMLElement, HTMLDivElement, Event, KeyboardEvent, MouseEvent, CustomEvent };

beforeAll(() => {
  const testBed = getTestBed();
  testModule = testBed.ngModule ?? BrowserTestingModule;
  testBed.resetTestEnvironment();
  destroyPlatform();
});

afterAll(() => {
  destroyPlatform();
  const platform = platformBrowserTesting();
  // Point Angular's document back to the test document (the server render set domino's)
  platform.injector.get(DOCUMENT);
  getTestBed().initTestEnvironment(testModule, platform, {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  });
});

describe('server-side rendering', () => {
  it('renders the chart without browser APIs: bars, header cells, task-list rows and the theme tokens', async () => {
    const calls: string[] = [];
    const restoreGlobals = snapshotGlobals();
    let html: string;
    try {
      stubBrowserApis(calls);
      html = await renderOnServer(SsrHost);
    } finally {
      vi.unstubAllGlobals();
      restoreGlobals();
    }

    expect(calls).toEqual([]);
    expect(html).toContain('<gantry');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const charts = [...doc.querySelectorAll<HTMLElement>('gantry:not(#long)')];
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      expect(chart.querySelectorAll('.gantt-bars-layer [data-task-id]').length).toBeGreaterThanOrEqual(1);
      expect(chart.querySelectorAll('.g-cell').length).toBeGreaterThan(0);
      expect(chart.querySelectorAll('.gantt-tl-row')).toHaveLength(TASKS.length);
      expect(chart.getAttribute('style')).toContain('--gantt-bar:');
      // Phase 10: the density, and the read-only layout variables and control size next to the theme tokens
      expect(chart.getAttribute('data-density')).toBe('normal');
      expect(chart.hasAttribute('data-narrow')).toBe(false);
      expect(chart.getAttribute('style')).toContain('--gantt-row-height: 36px');
      expect(chart.getAttribute('style')).toContain('--gantt-bar-height: 21.6px');
      expect(chart.getAttribute('style')).toContain('--gantry-control-size: 32px');
      // The bars' ARIA is stamped on the server too: a listbox of options with names
      expect(chart.querySelector('gantt-canvas svg')?.getAttribute('role')).toBe('listbox');
      const bars = [...chart.querySelectorAll('.gantt-bars-layer > [data-task-id]')];
      expect(bars.every(b => b.getAttribute('role') === 'option' && !!b.getAttribute('aria-label'))).toBe(true);
      expect(bars.every(b => b.hasAttribute('aria-posinset') && b.hasAttribute('aria-roledescription'))).toBe(true);
    }
    // The ready charts render no state box, and the host is not busy
    expect(doc.querySelectorAll('.gantt-state')).toHaveLength(0);
    expect(doc.querySelectorAll('gantry[aria-busy]')).toHaveLength(0);
    // The lazy footer of the data-source chart rendered without observing anything
    expect(doc.querySelector('#paged gantt-load-more')).not.toBeNull();
    // The marker lane renders on the server too, under the tiers, with the annotation's label
    const laned = doc.querySelector('#laned')!;
    const lane = laned.querySelector('.g-header > .g-marker-lane');
    expect(lane?.previousElementSibling?.classList.contains('g-tier')).toBe(true);
    expect([...laned.querySelectorAll('.g-marker-lane .g-marker-label')].map(l => l.textContent)).toContain('Freeze');
    expect(laned.querySelectorAll('.gantt-annotation-labels text')).toHaveLength(0);
    expect(doc.querySelector('#paged .g-marker-lane')).toBeNull();
    // Tooltips are created on the first hover, never on the server; no readout chip, no described bar
    expect(doc.querySelectorAll('.gantt-tooltip')).toHaveLength(0);
    expect(doc.querySelectorAll('.gantt-drag-readout, [aria-describedby]')).toHaveLength(0);
    expect(doc.body.querySelector(':scope > .gantt-tooltip')).toBeNull();

    // The server windows the header like a 1024 px viewport at scrollLeft 0 (phase 10: core
    // `fallbackWidth`), instead of mounting the whole timeline
    const long = doc.querySelector('#long')!;
    const all = buildTimeline({ tasks: LONG_TASKS, config: resolveConfig(LONG_OPTIONS) }).tiers.at(-1)!.cells;
    const mounted = long.querySelectorAll('.g-tier:last-child .g-cell');
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(all.length / 4);
  });

  it('puts the test environment back (the DOM classes are the test document’s again)', () => {
    const now = { Node, Element, HTMLElement, HTMLDivElement, Event, KeyboardEvent, MouseEvent, CustomEvent };
    for (const [name, ctor] of Object.entries(TEST_DOM)) expect(now[name as keyof typeof now], name).toBe(ctor);
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
    expect(new KeyboardEvent('keydown', { key: 'a' }).key).toBe('a');
    expect('ngServerMode' in globalThis).toBe(false);
  });
});
