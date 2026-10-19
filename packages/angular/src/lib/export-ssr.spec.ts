// Exports during server rendering (Gantry 2 phase 12, step 4.1, D20): a component rendered by
// @angular/platform-server's `renderApplication` calls the chart's `exportSvg()` / `exportCsv()`
// (they work on the server, custom bar components drawn as built-in bars) and `exportPng()`,
// `download()`, `print()` (they reject: they need a browser), and renders what it got. The
// browser APIs record any call and throw, as in `ssr.spec.ts`, whose platform hand-over this spec
// repeats: `beforeAll` resets the test environment and destroys the browser platform, `afterAll`
// restores the globals domino replaced and initialises TestBed again.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  PendingTasks,
  destroyPlatform,
  effect,
  inject,
  provideZonelessChangeDetection,
  signal,
  untracked,
  viewChild,
  type ApplicationRef,
  type Type,
} from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { bootstrapApplication, type BootstrapContext } from '@angular/platform-browser';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { createExportSource, exportChartCsv, exportChartSvg, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttBarBase, provideGanttBar } from './bar-registry';

const NOW = new Date(2026, 2, 10, 9, 30);
const day = (d: number) => new Date(2026, 2, d);
const TASKS: GanttTask[] = [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20, barType: 'flag' },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
];
const OPTIONS: GanttOptions = { viewMode: 'Day', initialScroll: false, showToday: false, panel: { width: 320 } };

@Component({
  selector: 'g[flagBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-mark]': "'flag-' + ctx().row.task.id" },
  template: '<svg:path class="flag-body" [attr.d]="ctx().visual.path" />',
})
class FlagBar extends GanttBarBase {}

/** What the server got from each method: the text, or the rejection's message */
interface Results {
  svg: string;
  csv: string;
  png: string;
  download: string;
  print: string;
}

@Component({
  selector: 'app-root',
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: 'flag', component: FlagBar })],
  template: `
    <gantry
      style="height: 300px"
      [series]="tasks"
      [options]="options"
      (beforeExport)="beforeExports.set(beforeExports() + 1)"
    />
    @if (results(); as r) {
      <pre id="svg">{{ r.svg }}</pre>
      <pre id="csv">{{ r.csv }}</pre>
      <p id="png">{{ r.png }}</p>
      <p id="download">{{ r.download }}</p>
      <p id="print">{{ r.print }}</p>
    }
    <p id="before-export">{{ beforeExports() }}</p>
  `,
})
class SsrExportHost {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
  readonly results = signal<Results | null>(null);
  /** `beforeExport` outputs seen (none: the browser-only methods reject first) */
  readonly beforeExports = signal(0);
  private readonly chart = viewChild(GantryComponent);

  constructor() {
    const pending = inject(PendingTasks);
    effect(() => {
      const chart = this.chart();
      if (!chart) return;
      untracked(() => {
        void pending.run(async () => {
          // After the render that found the chart: its inputs (the tasks) are bound by then
          await new Promise(resolve => setTimeout(resolve));
          const message = (p: Promise<unknown>) =>
            p.then(
              () => 'resolved',
              (e: unknown) => (e instanceof Error ? e.message : String(e)),
            );
          this.results.set({
            svg: await chart.exportSvg({ idPrefix: 's' }),
            csv: await chart.exportCsv(),
            png: await message(chart.exportPng()),
            download: await message(chart.download('csv')),
            print: await message(chart.print()),
          });
        });
      });
    });
  }
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
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
}

/** Every global before the render, put back after it (domino replaces the DOM classes; `ngServerMode`) */
function snapshotGlobals(): () => void {
  const g = globalThis as Record<string, unknown>;
  const before = Object.getOwnPropertyDescriptors(g);
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

beforeAll(() => {
  const testBed = getTestBed();
  testModule = testBed.ngModule ?? BrowserTestingModule;
  testBed.resetTestEnvironment();
  destroyPlatform();
});

afterAll(() => {
  destroyPlatform();
  const platform = platformBrowserTesting();
  platform.injector.get(DOCUMENT);
  getTestBed().initTestEnvironment(testModule, platform, {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  });
});

describe('exports during server rendering', () => {
  it('exportSvg() and exportCsv() work (custom bars drawn as built-in); exportPng(), download() and print() reject', async () => {
    const calls: string[] = [];
    const restoreGlobals = snapshotGlobals();
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    let html: string;
    try {
      stubBrowserApis(calls);
      html = await renderOnServer(SsrExportHost);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      restoreGlobals();
    }

    expect(calls).toEqual([]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = (id: string) => doc.getElementById(id)?.textContent ?? null;
    const svg = text('svg')!;
    expect(svg.startsWith('<svg')).toBe(true);
    // The headless source of the same chart draws the same SVG and CSV: the flag bar is core's bar
    const headless = createExportSource({ tasks: TASKS, options: OPTIONS, now: NOW });
    expect(svg).toBe(exportChartSvg(headless, { idPrefix: 's' }));
    expect(svg).not.toContain('flag');
    expect(text('csv')).toBe(exportChartCsv(headless));
    expect(text('png')).toBe('Gantry: exportPng() needs a browser');
    expect(text('download')).toBe('Gantry: download() needs a browser');
    expect(text('print')).toBe('Gantry: print() needs a browser');
    // Rejected before `beforeExport`
    expect(text('before-export')).toBe('0');
  });
});
