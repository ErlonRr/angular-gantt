// Phase 12 review fixes (7.1) in <gantry>, as the Web Component's `export-p12-fixes.test.ts`: a
// `range: 'visible'` export after a scroll and a column / panel resize equals core on the same
// inputs, an export draws the chart as it was when the method was called, one print at a time
// (two in the same tick: the second resolves `false`), a failed toolbar print says
// `announcePrintFailed`, and a custom bar component keeps core's markup rules (no remote resource).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DEFAULT_LABELS,
  ViewMode,
  createExportSource,
  exportChartSvg,
  type ColumnDef,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttBarBase, provideGanttBar } from './bar-registry';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttColumnService } from './columns/gantt-column.service';
import { GANTT_EXPORT_DOM, GanttExportService, type GanttExportDom } from './export/gantt-export.service';
import { serializeSvg } from './export/serialize';

const NOW = new Date(2026, 2, 10, 9, 30);
const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(28), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, panel: { width: 320 } };

/** A custom bar that asks for remote resources (an image, a paint, a style declaration) */
@Component({
  selector: 'g[remoteBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg:rect
      class="remote-body"
      width="5"
      height="5"
      fill="url(https://x.example/p)"
      style="stroke: red; fill: url(https://x.example/f)"
    />
    <svg:image href="https://x.example/i.png" />
    <svg:use href="#y" />
  `,
})
class RemoteBar extends GanttBarBase {}

@Component({
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: 'remote', component: RemoteBar })],
  template: `<gantry style="height: 400px" [(series)]="tasks" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>(BASE);
  readonly gantt = viewChild.required(GantryComponent);
}

function stubDom() {
  return {
    downloadBlob: vi.fn<GanttExportDom['downloadBlob']>(),
    svgToPng: vi.fn<GanttExportDom['svgToPng']>(() => Promise.resolve(new Blob([new Uint8Array(10)]))),
    printPages: vi.fn<GanttExportDom['printPages']>(() => Promise.resolve()),
    serializeSvg: vi.fn<GanttExportDom['serializeSvg']>(serializeSvg),
  };
}

async function mount(setup?: (h: Host) => void) {
  const dom = stubDom();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: GANTT_EXPORT_DOM, useValue: dom }],
  });
  const f: ComponentFixture<Host> = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const layout = debug.injector.get(GanttLayoutService);
  layout.now.set(NOW.getTime());
  await f.whenStable();
  return {
    f,
    h: f.componentInstance,
    host: debug.nativeElement as HTMLElement,
    gantt: f.componentInstance.gantt(),
    layout,
    scroll: debug.injector.get(GanttScrollService),
    columns: debug.injector.get(GanttColumnService),
    exporter: debug.injector.get(GanttExportService),
    dom,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<gantry> range: 'visible' after a scroll and a resize", () => {
  it('equals core on the same viewport, panel width and column widths', async () => {
    const c = await mount();
    // happy-dom lays nothing out: the measured sizes and the scroll go in through the signals the chart reads
    c.layout.mainWidth.set(1200);
    c.layout.viewportWidth.set(500);
    c.scroll.scrollLeft.set(180);
    c.layout.panelWidthPx.set(700);
    c.columns.setColumnWidth('start', 210);
    await c.f.whenStable();

    const base = createExportSource({ tasks: plan(), options: BASE, now: NOW, panelWidth: 700 });
    const widen = (cols: readonly ColumnDef[]) => cols.map(col => (col.key === 'start' ? { ...col, width: 210 } : col));
    const headless = {
      ...base,
      columns: { split: widen(base.columns.split), table: widen(base.columns.table), all: widen(base.columns.all) },
      tableWidth: 1200,
      viewport: { x0: 180, x1: 680 },
    };
    const svg = await c.gantt.exportSvg({ range: 'visible', idPrefix: 'p' });
    expect(svg).toBe(exportChartSvg(headless, { range: 'visible', idPrefix: 'p' }));
    expect(svg).toMatch(/<clipPath id="p-timeline">\s*<rect x="0" y="0" width="500"/);
    // The resize and the panel width count: without them the image differs
    expect(svg).not.toBe(exportChartSvg({ ...headless, columns: base.columns }, { range: 'visible', idPrefix: 'p' }));
    expect(svg).not.toBe(exportChartSvg({ ...headless, panelWidth: 320 }, { range: 'visible', idPrefix: 'p' }));
  });
});

describe('<gantry> export timing and print lock', () => {
  it('exportCsv(), then new tasks: the old ones are exported', async () => {
    const c = await mount();
    const csv = c.gantt.exportCsv();
    c.h.tasks.set([{ id: 'z', name: 'Zulu', start: day(3), end: day(4) }]);
    await c.f.whenStable();
    expect(await csv).toContain('Alpha');
    expect(await csv).not.toContain('Zulu');
  });

  it('two print() calls in the same tick: the second resolves false', async () => {
    const c = await mount();
    expect(await Promise.all([c.gantt.print(), c.gantt.print()])).toEqual([true, false]);
    expect(c.dom.printPages).toHaveBeenCalledTimes(1);
  });

  it('a failed print from the toolbar says announcePrintFailed in the alert region', async () => {
    const c = await mount();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    c.dom.printPages.mockRejectedValueOnce(new Error('no frame'));
    expect(await c.exporter.run('print', 'toolbar')).toBe(false);
    await c.f.whenStable();
    expect(c.host.querySelector('.gantt-sr-alert')!.textContent).toBe(DEFAULT_LABELS.announcePrintFailed);
  });
});

describe('<gantry> custom bar components keep core’s markup rules', () => {
  it('drops remote resources; keeps fragments', async () => {
    const c = await mount(h => h.tasks.set(plan().map(t => (t.id === 'a' ? { ...t, barType: 'remote' } : t))));
    const svg = await c.gantt.exportSvg();
    expect(svg).toContain('remote-body');
    // Angular applies the static style through the CSSOM: `stroke: red; fill: url(…);` loses its remote declaration
    expect(svg).toMatch(/style="stroke: red;?"/);
    expect(svg).toContain('<use href="#y"/>');
    expect(svg).not.toContain('x.example');
  });
});
