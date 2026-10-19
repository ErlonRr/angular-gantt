// The export surface of <gantry-element> (Gantry 2 phase 12, step 3.1, plan §3c): `exportSvg()`,
// `exportCsv()`, `exportPng()`, `download()` and `print()` load the lazy export chunk and draw the
// chart from a snapshot of its graph (`export/source.ts`) — the same source `createExportSource`
// builds headless. `download()` / `print()` fire the cancelable `before-export`, then `export`; the
// toolbar's runs (`ctx.runExport`) never reject. The DOM helpers (download, rasterize, print,
// serialize: step 3.2) are stubbed here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_LABELS,
  ViewMode,
  createExportSource,
  exportChartCsv,
  exportChartSvg,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { downloadBlob } from '../export/download';
import { svgToPng } from '../export/rasterize';
import { printPages } from '../export/print';
import { serializeSvg } from '../export/serialize';
import type { GantryEventDetailMap, GanttBarRenderer } from '../types';
import '../index';

vi.mock('../export/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('../export/rasterize', () => ({
  svgToPng: vi.fn(() => Promise.resolve(new Blob([new Uint8Array(10)], { type: 'image/png' }))),
}));
vi.mock('../export/print', () => ({ printPages: vi.fn(() => Promise.resolve()) }));
vi.mock('../export/serialize', () => ({
  serializeSvg: vi.fn((node: Element) => `<g class="custom-mark" data-mark="${node.getAttribute('data-mark')}"/>`),
}));

const flush = (el: GantryElement) => getEngine(el).flushSync();

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
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, panel: { width: 320 } };

function mount(props: Partial<GantryElement> = {}, options: GanttOptions = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: plan(), options: { ...BASE, ...options }, ...props });
  document.body.appendChild(el);
  getEngine(el).inputs.nowTick.set(NOW);
  flush(el);
  return el;
}

const EVENTS = ['before-export', 'export'] as const;
type Logged = { [K in (typeof EVENTS)[number]]: { type: K; detail: GantryEventDetailMap[K] } }[(typeof EVENTS)[number]];

function record(el: GantryElement): Logged[] {
  const log: Logged[] = [];
  for (const type of EVENTS) el.addEventListener(type, e => log.push({ type, detail: e.detail } as Logged));
  return log;
}
const types = (log: readonly Logged[]) => log.map(e => e.type);
const detailOf = <K extends Logged['type']>(log: readonly Logged[], type: K) =>
  log.find(e => e.type === type)?.detail as GantryEventDetailMap[K] | undefined;

/** The blob and file name of the last `downloadBlob` call. */
const lastDownload = () => {
  const call = vi.mocked(downloadBlob).mock.lastCall;
  if (!call) throw new Error('nothing downloaded');
  return { blob: call[0], fileName: call[1], doc: call[2], mount: call[3] };
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('<gantry-element> export data methods', () => {
  it('exportSvg() and exportCsv() equal core on a headless source of the same chart', async () => {
    const el = mount();
    const headless = createExportSource({ tasks: plan(), options: BASE, now: NOW });
    expect(await el.exportSvg({ idPrefix: 'p' })).toBe(exportChartSvg(headless, { idPrefix: 'p' }));
    expect(await el.exportCsv()).toBe(exportChartCsv(headless));
    expect(await el.exportCsv({ values: 'display', columns: 'all' })).toBe(
      exportChartCsv(headless, { values: 'display', columns: 'all' }),
    );
  });

  it('returns the <svg> element without the XML declaration, and fires no event', async () => {
    const el = mount();
    const log = record(el);
    const svg = await el.exportSvg();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Alpha');
    const csv = await el.exportCsv();
    expect(csv.startsWith('﻿')).toBe(false);
    expect(log).toEqual([]);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('snapshots the chart at call time: edits are in, a drag in progress is not', async () => {
    const el = mount();
    el.updateTask('a', { name: 'Alpha renamed' });
    expect(await el.exportCsv()).toContain('Alpha renamed');

    const { drag, graph: G } = getEngine(el);
    const geo = G.geoById.peek().get('c')!;
    const v = G.barVisual.peek()(geo);
    const x = v.x + v.width / 2;
    drag.start(geo, 'bar', x);
    drag.move(x + 3 * G.timeline.peek().pxPerDay);
    expect(drag.state.peek().kind).not.toBe('idle');
    expect(await el.exportCsv()).toContain('2026-03-14');
    drag.cancel();
  });

  it('leaves collapsed children out of the SVG; the CSV has them with rows "all", not with "shown"', async () => {
    const el = mount({ tasks: tree() });
    const svg = await el.exportSvg();
    expect(svg).toContain('data-task-id="g"');
    expect(svg).not.toContain('data-task-id="g1"');
    expect(svg).not.toContain('Child one');
    expect(await el.exportCsv()).toContain('Child one');
    expect(await el.exportCsv({ rows: 'shown' })).not.toContain('Child one');
    el.expandAll();
    expect(await el.exportSvg()).toContain('data-task-id="g1"');
  });

  it('exportPng() renders the model at the planned scale over its background', async () => {
    const el = mount();
    const blob = await el.exportPng();
    expect(blob.type).toBe('image/png');
    const [svg, size, doc, background] = vi.mocked(svgToPng).mock.lastCall!;
    expect(size.width).toBeGreaterThan(0);
    expect(size).toMatchObject({ scale: 2 });
    const width = Number(/<svg[^>]* width="([\d.]+)"/.exec(svg)?.[1]);
    expect(width).toBeCloseTo(size.width, 0);
    expect(doc).toBe(document);
    expect(background).toBe('#FFFFFF');
    await el.exportPng({ background: 'transparent', scale: 1 });
    expect(vi.mocked(svgToPng).mock.lastCall![3]).toBeNull();
    expect(vi.mocked(svgToPng).mock.lastCall![1]).toMatchObject({ scale: 1 });
  });

  it('rejects with a RangeError when the PNG only fits below actual size', async () => {
    const el = mount();
    await expect(el.exportPng({ maxSide: 10 })).rejects.toBeInstanceOf(RangeError);
    expect(svgToPng).not.toHaveBeenCalled();
  });
});

describe('<gantry-element> custom bars in exports', () => {
  const renderBar: GanttBarRenderer = (ctx, renderDefault) => {
    if (ctx.row.task.id === 'a') {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-mark', 'own-a');
      return g;
    }
    if (ctx.row.task.id === 'b') {
      const g = renderDefault();
      g.setAttribute('data-mark', 'decorated-b');
      return g;
    }
    return null;
  };

  it('serializes what renderBar returns; null draws the built-in bar', async () => {
    const spy = vi.fn(renderBar);
    const el = mount({ renderBar: spy });
    spy.mockClear();
    const svg = await el.exportSvg();
    expect(svg).toContain('data-mark="own-a"');
    expect(svg).toContain('data-mark="decorated-b"');
    // c: core's built-in bar
    const c = /<g [^>]*data-task-id="c"[^>]*>([\s\S]*?)<\/g>/.exec(svg.split('gantt-bars-layer')[1] ?? '')?.[1];
    expect(c).toContain('gantt-bar-body');
    expect(c).not.toContain('custom-mark');

    // The export's context: never selected, never draggable, the resolved visual
    const ctx = spy.mock.calls.find(([c]) => c.row.task.id === 'b')![0];
    expect(ctx).toMatchObject({ isSelected: false, draggable: false, enableResize: false });
    // renderDefault() paints that visual: its colours, never a CSS variable
    const decorated = vi
      .mocked(serializeSvg)
      .mock.calls.map(([node]) => node)
      .find(n => n.getAttribute('data-mark') === 'decorated-b')!;
    expect(decorated.querySelector('.gantt-bar-body')).not.toBeNull();
    expect(decorated.outerHTML).not.toContain('var(');
    expect(vi.mocked(serializeSvg).mock.lastCall![1]).toBe(window);
  });

  it('draws the built-in bar when the sanitiser drops the whole node', async () => {
    const el = mount({ renderBar });
    vi.mocked(serializeSvg).mockImplementation(node => (node.getAttribute('data-mark') === 'own-a' ? '' : '<g/>'));
    const svg = await el.exportSvg();
    const a = /<g [^>]*data-task-id="a"[^>]*>([\s\S]*?)<\/g>/.exec(svg.split('gantt-bars-layer')[1] ?? '')?.[1];
    expect(a).toContain('gantt-bar-body');
  });

  it('with the real serializer: the custom markup is in the SVG, its paints resolved', async () => {
    const actual = await vi.importActual<{ serializeSvg: typeof serializeSvg }>('../export/serialize');
    vi.mocked(serializeSvg).mockImplementation(actual.serializeSvg);
    const el = mount({ renderBar });
    const svg = await el.exportSvg();
    expect(svg).toContain('data-mark="own-a"');
    expect(svg).toContain('data-mark="decorated-b"');
    expect(svg).not.toContain('var(');
  });

  it("customBars: 'builtin' never calls renderBar", async () => {
    const spy = vi.fn(renderBar);
    const el = mount({ renderBar: spy });
    spy.mockClear();
    const svg = await el.exportSvg({ customBars: 'builtin' });
    expect(spy).not.toHaveBeenCalled();
    expect(svg).not.toContain('custom-mark');
    // A CSV never draws bars
    await el.exportCsv();
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes the export theme to renderBar', async () => {
    const spy = vi.fn(renderBar);
    const el = mount({ renderBar: spy });
    spy.mockClear();
    await el.exportSvg({ theme: 'dark' });
    expect(spy.mock.calls[0]?.[0].theme.backgroundColor).not.toBe(getEngine(el).graph.theme.peek().backgroundColor);
  });
});

describe('<gantry-element> download()', () => {
  it('fires before-export (cancelable), downloads, then fires export and announces the file', async () => {
    const el = mount();
    const log = record(el);
    let cancelable: boolean | undefined;
    el.addEventListener('before-export', e => (cancelable = e.cancelable), { once: true });
    const say = vi.spyOn(getEngine(el).ctx.announce, 'say');
    expect(await el.download('csv')).toBe(true);
    expect(types(log)).toEqual(['before-export', 'export']);
    expect(cancelable).toBe(true);
    expect(detailOf(log, 'before-export')).toMatchObject({ format: 'csv', trigger: 'api', fileName: 'gantt.csv' });
    const { blob, fileName, doc, mount: where } = lastDownload();
    expect(fileName).toBe('gantt.csv');
    expect(doc).toBe(document);
    expect(where).toBe(el.shadowRoot);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(detailOf(log, 'export')).toEqual({
      format: 'csv',
      trigger: 'api',
      fileName: 'gantt.csv',
      size: blob.size,
      pages: null,
    });
    expect(say).toHaveBeenCalledWith(DEFAULT_LABELS.announceExportReady('gantt.csv'));
  });

  it('writes the file text: the BOM on CSV files (bom), the XML declaration on SVG files', async () => {
    const el = mount();
    await el.download('csv');
    const csv = await lastDownload().blob.text();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(await el.exportCsv());
    await el.download('csv', { bom: false });
    expect((await lastDownload().blob.text()).charCodeAt(0)).not.toBe(0xfeff);

    const log = record(el);
    await el.download('svg', { idPrefix: 'q' });
    const { blob } = lastDownload();
    const svg = await blob.text();
    expect(svg).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n${await el.exportSvg({ idPrefix: 'q' })}`);
    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    expect(detailOf(log, 'export')?.size).toBe(blob.size);
  });

  it('downloads the PNG blob', async () => {
    const el = mount();
    const log = record(el);
    expect(await el.download('png', { scale: 1 })).toBe(true);
    const { blob, fileName } = lastDownload();
    expect(fileName).toBe('gantt.png');
    expect(blob.type).toBe('image/png');
    expect(vi.mocked(svgToPng).mock.lastCall![1]).toMatchObject({ scale: 1 });
    expect(detailOf(log, 'export')).toMatchObject({ format: 'png', size: 10, pages: null });
  });

  it.each([
    ['event.preventDefault()', (e: CustomEvent<GantryEventDetailMap['before-export']>) => e.preventDefault()],
    ['detail.preventDefault()', (e: CustomEvent<GantryEventDetailMap['before-export']>) => e.detail.preventDefault()],
  ])('a before-export listener vetoes it with %s', async (_, veto) => {
    const el = mount();
    const log = record(el);
    el.addEventListener('before-export', veto, { once: true });
    expect(await el.download('svg')).toBe(false);
    expect(types(log)).toEqual(['before-export']);
    expect(downloadBlob).not.toHaveBeenCalled();
    // The next one runs
    expect(await el.download('svg')).toBe(true);
    expect(types(log)).toEqual(['before-export', 'before-export', 'export']);
  });

  it('names the file: the call, else options.export.fileName (a string or per format), sanitized, with its extension', async () => {
    const el = mount({}, { export: { fileName: 'Plan Q3' } });
    const log = record(el);
    await el.download('svg');
    expect(lastDownload().fileName).toBe('Plan Q3.svg');
    await el.download('csv', { fileName: 'my:report?' });
    expect(lastDownload().fileName).toBe('myreport.csv');
    await el.download('csv', { fileName: 'Data.CSV' });
    expect(lastDownload().fileName).toBe('Data.CSV');
    el.options = { ...BASE, export: { fileName: format => `plan-${format}` } };
    await el.download('png');
    expect(lastDownload().fileName).toBe('plan-png.png');
    expect(log.filter(e => e.type === 'before-export').map(e => e.detail.fileName)).toEqual([
      'Plan Q3.svg',
      'myreport.csv',
      'Data.CSV',
      'plan-png.png',
    ]);
  });

  it('rejects when the file fails (an API call): no export event', async () => {
    const el = mount();
    const log = record(el);
    vi.mocked(downloadBlob).mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await expect(el.download('csv')).rejects.toThrow('blocked');
    expect(types(log)).toEqual(['before-export']);
  });
});

describe('<gantry-element> print()', () => {
  it('fires before-export with no file name, prints the pages, then fires export with the page count', async () => {
    const el = mount();
    const log = record(el);
    const say = vi.spyOn(getEngine(el).ctx.announce, 'say');
    expect(await el.print({ paper: 'a4', orientation: 'portrait' })).toBe(true);
    expect(types(log)).toEqual(['before-export', 'export']);
    expect(detailOf(log, 'before-export')).toMatchObject({ format: 'print', trigger: 'api', fileName: null });
    const [doc, ownerDoc] = vi.mocked(printPages).mock.lastCall!;
    expect(ownerDoc).toBe(document);
    expect(doc.pages.length).toBeGreaterThan(0);
    expect(doc.title).toBe(DEFAULT_LABELS.ariaChart);
    expect(doc.css).toContain('@page');
    expect(detailOf(log, 'export')).toEqual({
      format: 'print',
      trigger: 'api',
      fileName: null,
      size: null,
      pages: doc.pages.length,
    });
    expect(say).toHaveBeenCalledWith(DEFAULT_LABELS.announcePrintReady(doc.pages.length));
  });

  it('runs one print at a time: print() meanwhile resolves false', async () => {
    const el = mount();
    const log = record(el);
    let release!: () => void;
    vi.mocked(printPages).mockImplementationOnce(() => new Promise<void>(r => (release = r)));
    const first = el.print();
    await vi.waitFor(() => expect(printPages).toHaveBeenCalledTimes(1));
    expect(await el.print()).toBe(false);
    expect(types(log)).toEqual(['before-export']);
    release();
    expect(await first).toBe(true);
    // Printing again once it is done
    expect(await el.print()).toBe(true);
    expect(printPages).toHaveBeenCalledTimes(2);
  });

  it('a vetoed print prints nothing and does not block the next one', async () => {
    const el = mount();
    el.addEventListener('before-export', e => e.detail.preventDefault(), { once: true });
    expect(await el.print()).toBe(false);
    expect(printPages).not.toHaveBeenCalled();
    expect(await el.print()).toBe(true);
  });

  it('rejects with a RangeError over maxPages', async () => {
    const el = mount();
    await expect(
      el.print({ fit: 'none', paper: { width: 30, height: 30, unit: 'mm' }, maxPages: 1 }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(printPages).not.toHaveBeenCalled();
    // The failed print released the lock
    expect(await el.print()).toBe(true);
  });
});

describe('<gantry-element> toolbar exports (ctx.runExport)', () => {
  const alert = (el: GantryElement) => el.shadowRoot!.querySelector('.gantt-sr-alert')!.textContent;

  it("downloads or prints with trigger 'toolbar'", async () => {
    const el = mount();
    const log = record(el);
    const { ctx } = getEngine(el);
    expect(await ctx.runExport('csv', 'toolbar')).toBe(true);
    expect(detailOf(log, 'before-export')).toMatchObject({ format: 'csv', trigger: 'toolbar' });
    expect(detailOf(log, 'export')).toMatchObject({ format: 'csv', trigger: 'toolbar', fileName: 'gantt.csv' });
    expect(await ctx.runExport('print', 'toolbar')).toBe(true);
    expect(log.at(-1)).toMatchObject({ type: 'export', detail: { format: 'print', trigger: 'toolbar' } });
  });

  it('resolves false when vetoed', async () => {
    const el = mount();
    el.addEventListener('before-export', e => e.preventDefault(), { once: true });
    expect(await getEngine(el).ctx.runExport('svg', 'toolbar')).toBe(false);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('never rejects: a failure goes to the alert region and the console', async () => {
    const el = mount();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(downloadBlob).mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    expect(await getEngine(el).ctx.runExport('png', 'toolbar')).toBe(false);
    expect(alert(el)).toBe(DEFAULT_LABELS.announceExportFailed(DEFAULT_LABELS.exportPng));
    expect(error).toHaveBeenCalled();

    vi.mocked(printPages).mockRejectedValueOnce(new Error('no frame'));
    expect(await getEngine(el).ctx.runExport('print', 'toolbar')).toBe(false);
    expect(alert(el)).toBe(DEFAULT_LABELS.announcePrintFailed);
  });
});
