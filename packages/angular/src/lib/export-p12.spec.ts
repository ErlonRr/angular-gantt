// The export surface of <gantry> (Gantry 2 phase 12, step 4.1, plan §3c), the Web Component's
// `export-p12.test.ts`: `exportSvg()`, `exportCsv()`, `exportPng()`, `download()` and `print()` draw
// the chart from a snapshot of its layout graph (`export/source.ts`) — the same source
// `createExportSource` builds headless. `download()` / `print()` emit `beforeExport` (veto with
// `preventDefault()`), then `export`; the toolbar's runs (`GanttExportService.run`) never reject.
// Custom bar components are rendered off-screen once and serialized (D5). The DOM helpers
// (download, rasterize, print: step 4.2) are stubbed through `GANTT_EXPORT_DOM`; the serializer is
// the real one unless a test says otherwise.
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DEFAULT_LABELS,
  ViewMode,
  createExportSource,
  editTiming,
  exportChartCsv,
  exportChartSvg,
  resolvePaint,
  resolveTheme,
  type GanttBarContext,
  type GanttBeforeExportEvent,
  type GanttExportEvent,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttBarBase, provideGanttBar } from './bar-registry';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttAnnouncer } from './a11y/announcer';
import { GanttThemeService } from './services/gantt-theme.service';
import { GANTT_EXPORT_DOM, GanttExportService, type GanttExportDom } from './export/gantt-export.service';
import { serializeSvg } from './export/serialize';

const NOW = new Date(2026, 2, 10, 9, 30);
const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(16), progress: 0 },
];
const tree = (): GanttTask[] => [
  { id: 'g', name: 'Group', start: day(2), end: day(12), collapsed: true },
  { id: 'g1', name: 'Child one', start: day(2), end: day(6), parentId: 'g' },
  { id: 'g2', name: 'Child two', start: day(7), end: day(12), parentId: 'g' },
  { id: 'x', name: 'Other', start: day(13), end: day(15) },
];
/** `a` is a custom `flag` bar */
const flagged = (): GanttTask[] => plan().map(t => (t.id === 'a' ? { ...t, barType: 'flag' } : t));
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, panel: { width: 320 } };

/** Every live flag bar (on screen and off-screen) */
let liveFlags = 0;

/** A custom bar: its body painted from the visual (inline style), a mark and a label */
@Component({
  selector: 'g[flagBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-mark]': "'flag-' + ctx().row.task.id" },
  template: `
    <svg:path class="flag-body" [attr.d]="ctx().visual.path" [style.fill]="ctx().visual.paint.body" />
    @if (ctx().isSelected) {
      <svg:rect class="flag-selected" />
    }
    <svg:text class="flag-label">{{ ctx().row.task.name }}</svg:text>
  `,
})
class FlagBar extends GanttBarBase {
  constructor() {
    super();
    liveFlags++;
    inject(DestroyRef).onDestroy(() => liveFlags--);
  }
}

@Component({
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: 'flag', component: FlagBar })],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    (beforeExport)="onBefore($event)"
    (export)="events.push(['export', $event])"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>(BASE);
  readonly events: ['beforeExport' | 'export', GanttBeforeExportEvent | GanttExportEvent][] = [];
  /** What `beforeExport` does besides being logged */
  before: (e: GanttBeforeExportEvent) => void = () => undefined;
  readonly gantt = viewChild.required(GantryComponent);

  onBefore(e: GanttBeforeExportEvent): void {
    this.events.push(['beforeExport', e]);
    this.before(e);
  }
}

/** The DOM helpers: stubs (the serializer is the real one) */
function stubDom() {
  return {
    downloadBlob: vi.fn<GanttExportDom['downloadBlob']>(),
    svgToPng: vi.fn<GanttExportDom['svgToPng']>(() =>
      Promise.resolve(new Blob([new Uint8Array(10)], { type: 'image/png' })),
    ),
    printPages: vi.fn<GanttExportDom['printPages']>(() => Promise.resolve()),
    serializeSvg: vi.fn<GanttExportDom['serializeSvg']>(serializeSvg),
  };
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  canvas: GanttCanvasComponent;
  exporter: GanttExportService;
  announcer: GanttAnnouncer;
  dom: ReturnType<typeof stubDom>;
  set(change: () => void): Promise<void>;
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
  const dom = stubDom();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: GANTT_EXPORT_DOM, useValue: dom }],
  });
  const f = TestBed.createComponent(Host);
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
    canvas: f.debugElement.query(By.directive(GanttCanvasComponent)).componentInstance as GanttCanvasComponent,
    exporter: debug.injector.get(GanttExportService),
    announcer: debug.injector.get(GanttAnnouncer),
    dom,
    async set(change) {
      change();
      await f.whenStable();
    },
  };
}

const types = (c: Chart) => c.h.events.map(([type]) => type);
const detailOf = <T>(c: Chart, type: 'beforeExport' | 'export') =>
  c.h.events.find(([t]) => t === type)?.[1] as T | undefined;

/** The blob, file name, document and mount point of the last `downloadBlob` call. */
const lastDownload = (c: Chart) => {
  const call = c.dom.downloadBlob.mock.lastCall;
  if (!call) throw new Error('nothing downloaded');
  return { blob: call[0], fileName: call[1], doc: call[2], mount: call[3] };
};

/** The content of `id`'s bar group in an exported SVG */
const barOf = (svg: string, id: string) =>
  new RegExp(`<g [^>]*data-task-id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(svg.split('gantt-bars-layer')[1] ?? '')?.[1];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<gantry> export data methods', () => {
  it('exportSvg() and exportCsv() equal core on a headless source of the same chart', async () => {
    const c = await mount();
    const headless = createExportSource({ tasks: plan(), options: BASE, now: NOW });
    expect(await c.gantt.exportSvg({ idPrefix: 'p' })).toBe(exportChartSvg(headless, { idPrefix: 'p' }));
    expect(await c.gantt.exportCsv()).toBe(exportChartCsv(headless));
    expect(await c.gantt.exportCsv({ values: 'display', columns: 'all' })).toBe(
      exportChartCsv(headless, { values: 'display', columns: 'all' }),
    );
  });

  it('keeps the chart’s theme overrides in a light or dark export (options.theme and setTheme())', async () => {
    const c = await mount(h => h.options.set({ ...BASE, theme: { todayColor: '#AB0000' } }));
    c.gantt.setTheme({ barColor: '#123456' });
    const theme = { todayColor: '#AB0000', barColor: '#123456' };
    const headless = createExportSource({ tasks: plan(), options: { ...BASE, theme }, now: NOW });
    for (const mode of ['current', 'light', 'dark'] as const) {
      expect(await c.gantt.exportSvg({ idPrefix: 'p', theme: mode }), mode).toBe(
        exportChartSvg(headless, { idPrefix: 'p', theme: mode }),
      );
    }
  });

  it('returns the <svg> element without the XML declaration, and emits nothing', async () => {
    const c = await mount();
    const svg = await c.gantt.exportSvg();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Alpha');
    const csv = await c.gantt.exportCsv();
    expect(csv.startsWith('﻿')).toBe(false);
    await c.gantt.exportPng();
    expect(c.h.events).toEqual([]);
    expect(c.dom.downloadBlob).not.toHaveBeenCalled();
  });

  it('snapshots the chart at call time: edits are in, a drag in progress is not', async () => {
    const c = await mount();
    c.gantt.updateTask('a', { name: 'Alpha renamed' });
    expect(await c.gantt.exportCsv()).toContain('Alpha renamed');

    const drag = c.f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    const geo = c.layout.geometryById().get('c')!;
    const v = c.gantt.getBarVisual('c')!;
    const x = v.x + v.width / 2;
    drag.start(geo, 'bar', x, editTiming(c.layout.timeline(), c.layout.cfg()));
    drag.move(x + 3 * c.layout.timeline().pxPerDay);
    expect(drag.isActive()).toBe(true);
    expect(await c.gantt.exportCsv()).toContain('2026-03-14');
    drag.cancel();
  });

  it('leaves collapsed children out of the SVG; the CSV has them with rows "all", not with "shown"', async () => {
    const c = await mount(h => h.tasks.set(tree()));
    const svg = await c.gantt.exportSvg();
    expect(svg).toContain('data-task-id="g"');
    expect(svg).not.toContain('data-task-id="g1"');
    expect(svg).not.toContain('Child one');
    expect(await c.gantt.exportCsv()).toContain('Child one');
    expect(await c.gantt.exportCsv({ rows: 'shown' })).not.toContain('Child one');
    c.gantt.expandAll();
    expect(await c.gantt.exportSvg()).toContain('data-task-id="g1"');
  });

  it('exportPng() renders the model at the planned scale over its background', async () => {
    const c = await mount();
    const blob = await c.gantt.exportPng();
    expect(blob.type).toBe('image/png');
    const [svg, size, doc, background] = c.dom.svgToPng.mock.lastCall!;
    expect(size.width).toBeGreaterThan(0);
    expect(size).toMatchObject({ scale: 2 });
    const width = Number(/<svg[^>]* width="([\d.]+)"/.exec(svg)?.[1]);
    expect(width).toBeCloseTo(size.width, 0);
    expect(doc).toBe(document);
    expect(background).toBe('#FFFFFF');
    await c.gantt.exportPng({ background: 'transparent', scale: 1 });
    expect(c.dom.svgToPng.mock.lastCall![3]).toBeNull();
    expect(c.dom.svgToPng.mock.lastCall![1]).toMatchObject({ scale: 1 });
  });

  it('rejects with a RangeError when the PNG only fits below actual size', async () => {
    const c = await mount();
    await expect(c.gantt.exportPng({ maxSide: 10 })).rejects.toBeInstanceOf(RangeError);
    expect(c.dom.svgToPng).not.toHaveBeenCalled();
  });
});

describe('<gantry> custom bars in exports', () => {
  it('renders a custom bar component off-screen once, serialized; built-in bar types draw core’s bar', async () => {
    const c = await mount(h => h.tasks.set(flagged()));
    c.gantt.setSelectedTasks(['a']);
    await c.f.whenStable();
    const onScreen = liveFlags;
    expect(onScreen).toBe(1);
    const render = vi.spyOn(c.canvas, 'renderCustomBarMarkup');
    const svg = await c.gantt.exportSvg();

    // a: the component's markup, its paints resolved, inside core's bar group
    const a = barOf(svg, 'a');
    expect(a).toContain('data-mark="flag-a"');
    expect(a).toContain('flag-body');
    expect(a).toContain('Alpha');
    expect(a).not.toContain('gantt-bar-body');
    expect(svg).not.toContain('var(');
    // Without Angular's own marks
    expect(a).not.toMatch(/ng-version|_nghost-|_ngcontent-/);
    // b, c: core's built-in bars
    expect(barOf(svg, 'c')).toContain('gantt-bar-body');
    expect(barOf(svg, 'c')).not.toContain('flag');

    // Asked for every shown row; the export's context: never selected, never draggable, no handles
    expect(render.mock.calls.map(([ctx]) => ctx.row.task.id)).toEqual(['a', 'b', 'c']);
    const ctx = render.mock.calls[0][0];
    expect(ctx).toMatchObject({ isSelected: false, draggable: false, enableResize: false });
    expect(a).not.toContain('flag-selected');
    // Rendered once and destroyed: only the bar on screen lives on
    expect(render.mock.results[0]?.value).toContain('flag-body');
    expect(liveFlags).toBe(onScreen);
    expect(c.dom.serializeSvg).toHaveBeenCalledTimes(1);
    expect(c.dom.serializeSvg.mock.lastCall![1]).toBe(window);
  });

  it('draws the built-in bar when the sanitiser drops the whole node', async () => {
    const c = await mount(h => h.tasks.set(flagged()));
    c.dom.serializeSvg.mockReturnValue('');
    const svg = await c.gantt.exportSvg();
    expect(barOf(svg, 'a')).toContain('gantt-bar-body');
    expect(svg).not.toContain('flag-a');
  });

  it("customBars: 'builtin' renders no component (nor does a CSV)", async () => {
    const c = await mount(h => h.tasks.set(flagged()));
    const render = vi.spyOn(c.canvas, 'renderCustomBarMarkup');
    const svg = await c.gantt.exportSvg({ customBars: 'builtin' });
    expect(render).not.toHaveBeenCalled();
    expect(svg).not.toContain('flag-a');
    expect(barOf(svg, 'a')).toContain('gantt-bar-body');
    await c.gantt.exportCsv();
    expect(render).not.toHaveBeenCalled();
  });

  it('passes the export theme to the custom bar', async () => {
    const c = await mount(h => h.tasks.set(flagged()));
    const render = vi.spyOn(c.canvas, 'renderCustomBarMarkup');
    const svg = await c.gantt.exportSvg({ theme: 'dark' });
    const shown = c.f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttThemeService);
    const ctx: GanttBarContext = render.mock.calls[0][0];
    expect(ctx.theme.backgroundColor).not.toBe(shown.resolvedTheme().backgroundColor);
    expect(ctx.theme).toEqual(resolveTheme(true));
    // The dark visual: its body painted with the dark palette, as a colour
    expect(barOf(svg, 'a')).toContain(`fill: ${resolvePaint(ctx.visual.paint.body, ctx.theme)}`);
  });
});

describe('<gantry> download()', () => {
  it('emits beforeExport, downloads, then emits export and announces the file', async () => {
    const c = await mount();
    const announce = vi.spyOn(c.announcer, 'announce');
    expect(await c.gantt.download('csv')).toBe(true);
    expect(types(c)).toEqual(['beforeExport', 'export']);
    expect(detailOf(c, 'beforeExport')).toMatchObject({ format: 'csv', trigger: 'api', fileName: 'gantt.csv' });
    const { blob, fileName, doc, mount: where } = lastDownload(c);
    expect(fileName).toBe('gantt.csv');
    expect(doc).toBe(document);
    expect(where).toBe(c.host);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(detailOf(c, 'export')).toEqual({
      format: 'csv',
      trigger: 'api',
      fileName: 'gantt.csv',
      size: blob.size,
      pages: null,
    });
    expect(announce).toHaveBeenCalledWith(DEFAULT_LABELS.announceExportReady('gantt.csv'));
  });

  it('writes the file text: the BOM on CSV files (bom), the XML declaration on SVG files', async () => {
    const c = await mount();
    await c.gantt.download('csv');
    const csv = await lastDownload(c).blob.text();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(await c.gantt.exportCsv());
    await c.gantt.download('csv', { bom: false });
    expect((await lastDownload(c).blob.text()).charCodeAt(0)).not.toBe(0xfeff);

    c.h.events.length = 0;
    await c.gantt.download('svg', { idPrefix: 'q' });
    const { blob } = lastDownload(c);
    const svg = await blob.text();
    expect(svg).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n${await c.gantt.exportSvg({ idPrefix: 'q' })}`);
    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    expect(detailOf<GanttExportEvent>(c, 'export')?.size).toBe(blob.size);
  });

  it('downloads the PNG blob', async () => {
    const c = await mount();
    expect(await c.gantt.download('png', { scale: 1 })).toBe(true);
    const { blob, fileName } = lastDownload(c);
    expect(fileName).toBe('gantt.png');
    expect(blob.type).toBe('image/png');
    expect(c.dom.svgToPng.mock.lastCall![1]).toMatchObject({ scale: 1 });
    expect(detailOf(c, 'export')).toMatchObject({ format: 'png', size: 10, pages: null });
  });

  it('a beforeExport listener vetoes it with preventDefault()', async () => {
    const c = await mount();
    c.h.before = e => {
      c.h.before = () => undefined;
      e.preventDefault();
    };
    expect(await c.gantt.download('svg')).toBe(false);
    expect(types(c)).toEqual(['beforeExport']);
    expect(c.dom.downloadBlob).not.toHaveBeenCalled();
    // The next one runs
    expect(await c.gantt.download('svg')).toBe(true);
    expect(types(c)).toEqual(['beforeExport', 'beforeExport', 'export']);
  });

  it('names the file: the call, else options.export.fileName (a string or per format), sanitized, with its extension', async () => {
    const c = await mount(h => h.options.set({ ...BASE, export: { fileName: 'Plan Q3' } }));
    await c.gantt.download('svg');
    expect(lastDownload(c).fileName).toBe('Plan Q3.svg');
    await c.gantt.download('csv', { fileName: 'my:report?' });
    expect(lastDownload(c).fileName).toBe('myreport.csv');
    await c.gantt.download('csv', { fileName: 'Data.CSV' });
    expect(lastDownload(c).fileName).toBe('Data.CSV');
    await c.set(() => c.h.options.set({ ...BASE, export: { fileName: format => `plan-${format}` } }));
    await c.gantt.download('png');
    expect(lastDownload(c).fileName).toBe('plan-png.png');
    expect(
      c.h.events.filter(([t]) => t === 'beforeExport').map(([, e]) => (e as GanttBeforeExportEvent).fileName),
    ).toEqual(['Plan Q3.svg', 'myreport.csv', 'Data.CSV', 'plan-png.png']);
  });

  it('rejects when the file fails (an API call): no export output', async () => {
    const c = await mount();
    c.dom.downloadBlob.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await expect(c.gantt.download('csv')).rejects.toThrow('blocked');
    expect(types(c)).toEqual(['beforeExport']);
  });
});

describe('<gantry> print()', () => {
  it('emits beforeExport with no file name, prints the pages, then emits export with the page count', async () => {
    const c = await mount();
    const announce = vi.spyOn(c.announcer, 'announce');
    expect(await c.gantt.print({ paper: 'a4', orientation: 'portrait' })).toBe(true);
    expect(types(c)).toEqual(['beforeExport', 'export']);
    expect(detailOf(c, 'beforeExport')).toMatchObject({ format: 'print', trigger: 'api', fileName: null });
    const [doc, ownerDoc] = c.dom.printPages.mock.lastCall!;
    expect(ownerDoc).toBe(document);
    expect(doc.pages.length).toBeGreaterThan(0);
    expect(doc.title).toBe(DEFAULT_LABELS.ariaChart);
    expect(doc.css).toContain('@page');
    expect(detailOf(c, 'export')).toEqual({
      format: 'print',
      trigger: 'api',
      fileName: null,
      size: null,
      pages: doc.pages.length,
    });
    expect(announce).toHaveBeenCalledWith(DEFAULT_LABELS.announcePrintReady(doc.pages.length));
  });

  it('runs one print at a time: print() meanwhile resolves false', async () => {
    const c = await mount();
    let release!: () => void;
    c.dom.printPages.mockImplementationOnce(() => new Promise<void>(r => (release = r)));
    const first = c.gantt.print();
    await vi.waitFor(() => expect(c.dom.printPages).toHaveBeenCalledTimes(1));
    expect(await c.gantt.print()).toBe(false);
    expect(types(c)).toEqual(['beforeExport']);
    release();
    expect(await first).toBe(true);
    // Printing again once it is done
    expect(await c.gantt.print()).toBe(true);
    expect(c.dom.printPages).toHaveBeenCalledTimes(2);
  });

  it('a print started by a beforeExport listener resolves false (the lock is taken first)', async () => {
    const c = await mount();
    let inner: Promise<boolean> | undefined;
    c.h.before = () => {
      c.h.before = () => undefined;
      inner = c.gantt.print();
    };
    expect(await c.gantt.print()).toBe(true);
    expect(await inner).toBe(false);
    expect(c.dom.printPages).toHaveBeenCalledTimes(1);
  });

  it('a vetoed print prints nothing and does not block the next one', async () => {
    const c = await mount();
    c.h.before = e => {
      c.h.before = () => undefined;
      e.preventDefault();
    };
    expect(await c.gantt.print()).toBe(false);
    expect(c.dom.printPages).not.toHaveBeenCalled();
    expect(await c.gantt.print()).toBe(true);
  });

  it('rejects with a RangeError over maxPages', async () => {
    const c = await mount();
    await expect(
      c.gantt.print({ fit: 'none', paper: { width: 30, height: 30, unit: 'mm' }, maxPages: 1 }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(c.dom.printPages).not.toHaveBeenCalled();
    // The failed print released the lock
    expect(await c.gantt.print()).toBe(true);
  });
});

describe('<gantry> toolbar exports (GanttExportService.run)', () => {
  const alert = (c: Chart) => c.host.querySelector('.gantt-sr-alert')!.textContent;

  it("downloads or prints with trigger 'toolbar'", async () => {
    const c = await mount();
    expect(await c.exporter.run('csv', 'toolbar')).toBe(true);
    expect(detailOf(c, 'beforeExport')).toMatchObject({ format: 'csv', trigger: 'toolbar' });
    expect(detailOf(c, 'export')).toMatchObject({ format: 'csv', trigger: 'toolbar', fileName: 'gantt.csv' });
    expect(await c.exporter.run('print', 'toolbar')).toBe(true);
    expect(c.h.events.at(-1)).toMatchObject(['export', { format: 'print', trigger: 'toolbar' }]);
  });

  it('resolves false when vetoed', async () => {
    const c = await mount();
    c.h.before = e => e.preventDefault();
    expect(await c.exporter.run('svg', 'toolbar')).toBe(false);
    expect(c.dom.downloadBlob).not.toHaveBeenCalled();
  });

  it('never rejects: a failure goes to the alert region and the console', async () => {
    const c = await mount();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    c.dom.downloadBlob.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    expect(await c.exporter.run('png', 'toolbar')).toBe(false);
    await c.f.whenStable();
    expect(alert(c)).toBe(DEFAULT_LABELS.announceExportFailed(DEFAULT_LABELS.exportPng));
    expect(error).toHaveBeenCalled();

    c.dom.printPages.mockRejectedValueOnce(new Error('no frame'));
    expect(await c.exporter.run('print', 'toolbar')).toBe(false);
    await c.f.whenStable();
    expect(alert(c)).toBe(DEFAULT_LABELS.announcePrintFailed);

    // The same failure again changes the text, so it is read again
    c.dom.printPages.mockRejectedValueOnce(new Error('no frame'));
    expect(await c.exporter.run('print', 'toolbar')).toBe(false);
    await c.f.whenStable();
    expect(alert(c)).toBe(`${DEFAULT_LABELS.announcePrintFailed}\u00a0`);
  });
});
