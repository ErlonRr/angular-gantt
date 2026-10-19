// Phase 12 review fixes (7.1) in <gantry-element>: an export draws the chart as it was when the
// method was called (the capture is synchronous, the export code loads after), one import of the
// export code shared by every call (two prints in the same tick: the second resolves `false`), a
// `range: 'visible'` export after a scroll and a column / panel resize equals core on the same
// inputs, a failed toolbar print says `announcePrintFailed`, and the serializer keeps core's rules
// (no remote resource): a custom bar node exports as its markup does headless.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_LABELS,
  ViewMode,
  createExportSource,
  exportChartSvg,
  sanitizeSvgMarkup,
  type ColumnDef,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { downloadBlob } from '../export/download';
import { printPages } from '../export/print';
import { serializeSvg } from '../export/serialize';
import '../index';

vi.mock('../export/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('../export/rasterize', () => ({
  svgToPng: vi.fn(() => Promise.resolve(new Blob([new Uint8Array(10)], { type: 'image/png' }))),
}));
vi.mock('../export/print', () => ({ printPages: vi.fn(() => Promise.resolve()) }));

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOW = new Date(2026, 2, 10, 9, 30);
const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(28), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, panel: { width: 320 } };

function mount(props: Partial<GantryElement> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: plan(), options: BASE, ...props });
  document.body.appendChild(el);
  getEngine(el).inputs.nowTick.set(NOW);
  getEngine(el).flushSync();
  return el;
}

const blobText = (blob: Blob) => blob.text();

beforeEach(() => {
  vi.mocked(downloadBlob).mockReset();
  vi.mocked(printPages).mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('an export draws the chart as it was when the method was called', () => {
  it('exportCsv() / exportSvg(), then new tasks: the old ones are exported', async () => {
    const el = mount();
    const csv = el.exportCsv();
    const svg = el.exportSvg();
    el.tasks = [{ id: 'z', name: 'Zulu', start: day(3), end: day(4) }];
    expect(await csv).toContain('Alpha');
    expect(await csv).not.toContain('Zulu');
    expect(await svg).toContain('Gamma');
    expect(await el.exportCsv()).toContain('Zulu');
  });

  it('download(), then an edit: the file has the chart before it', async () => {
    const el = mount();
    const done = el.download('csv');
    el.updateTask('a', { name: 'Alpha renamed' });
    expect(await done).toBe(true);
    const text = await blobText(vi.mocked(downloadBlob).mock.lastCall![0]);
    expect(text).toContain('Alpha');
    expect(text).not.toContain('Alpha renamed');
  });
});

describe('one print at a time', () => {
  it('two print() calls in the same tick, before the export code loaded: the second resolves false', async () => {
    const el = mount();
    expect(await Promise.all([el.print(), el.print()])).toEqual([true, false]);
    expect(printPages).toHaveBeenCalledTimes(1);
    // Done: the next one prints
    expect(await el.print()).toBe(true);
    expect(printPages).toHaveBeenCalledTimes(2);
  });

  it('every element has its own lock', async () => {
    const [one, two] = [mount(), mount()];
    expect(await Promise.all([one.print(), two.print(), one.print()])).toEqual([true, true, false]);
  });

  it('a failed print from the toolbar says announcePrintFailed in the alert region', async () => {
    const el = mount();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(printPages).mockRejectedValueOnce(new Error('no frame'));
    expect(await getEngine(el).ctx.runExport('print', 'toolbar')).toBe(false);
    expect(el.shadowRoot!.querySelector('.gantt-sr-alert')!.textContent).toBe(DEFAULT_LABELS.announcePrintFailed);
    expect(DEFAULT_LABELS.announcePrintFailed).toBe('Couldn’t print the chart');
  });
});

describe("range: 'visible' after a scroll and a resize", () => {
  it('equals core on the same viewport, panel width and column widths', async () => {
    const el = mount();
    const { inputs: I, columns } = getEngine(el);
    // happy-dom lays nothing out: the measured sizes and the scroll go in through the inputs the element reads
    I.mainW.set(1200);
    I.canvasW.set(500);
    I.scrollLeft.set(180);
    I.panelW.set(700);
    columns.setColumnWidth('start', 210);
    getEngine(el).flushSync();

    const base = createExportSource({ tasks: plan(), options: BASE, now: NOW, panelWidth: 700 });
    const widen = (cols: readonly ColumnDef[]) => cols.map(c => (c.key === 'start' ? { ...c, width: 210 } : c));
    const headless = {
      ...base,
      columns: { split: widen(base.columns.split), table: widen(base.columns.table), all: widen(base.columns.all) },
      tableWidth: 1200,
      viewport: { x0: 180, x1: 680 },
    };
    const svg = await el.exportSvg({ range: 'visible', idPrefix: 'p' });
    expect(svg).toBe(exportChartSvg(headless, { range: 'visible', idPrefix: 'p' }));
    // The visible part: the 500 px of timeline on screen, the resized column
    expect(svg).toMatch(/<clipPath id="p-timeline">\s*<rect x="0" y="0" width="500"/);
    expect(svg).not.toBe(await el.exportSvg({ idPrefix: 'p' }));
    // The resize and the panel width count: without them the image differs
    expect(svg).not.toBe(exportChartSvg({ ...headless, columns: base.columns }, { range: 'visible', idPrefix: 'p' }));
    expect(svg).not.toBe(exportChartSvg({ ...headless, panelWidth: 320 }, { range: 'visible', idPrefix: 'p' }));
  });
});

describe('serializeSvg keeps core’s rules', () => {
  const MARKUP =
    `<g xmlns="${SVG_NS}" class="flag"><rect width="5" height="5" fill="url(https://x.example/p)" ` +
    `style="stroke: red; fill: url(https://x.example/f)"/><image href="https://x.example/i.png"/>` +
    `<image href="data:image/png;base64,AAAA"/><use href="#y"/><animate attributeName="x"/></g>`;

  /** `MARKUP` built as nodes */
  function node(): SVGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'flag');
    const rect = document.createElementNS(SVG_NS, 'rect');
    for (const [k, v] of [
      ['width', '5'],
      ['height', '5'],
      ['fill', 'url(https://x.example/p)'],
      ['style', 'stroke: red; fill: url(https://x.example/f)'],
    ]) {
      rect.setAttribute(k, v);
    }
    const remote = document.createElementNS(SVG_NS, 'image');
    remote.setAttribute('href', 'https://x.example/i.png');
    const inline = document.createElementNS(SVG_NS, 'image');
    inline.setAttribute('href', 'data:image/png;base64,AAAA');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#y');
    const animate = document.createElementNS(SVG_NS, 'animate');
    animate.setAttribute('attributeName', 'x');
    g.append(rect, remote, inline, use, animate);
    return g;
  }

  it('drops remote resources and animations, keeps fragments and inline images', () => {
    const out = serializeSvg(node(), window);
    expect(out).toBe(
      `<g xmlns="${SVG_NS}" class="flag"><rect width="5" height="5" style="stroke: red"/><image/>` +
        `<image href="data:image/png;base64,AAAA"/><use href="#y"/></g>`,
    );
    expect(out).toBe(sanitizeSvgMarkup(MARKUP));
  });

  it('a custom bar node exports as its markup does headless', async () => {
    const el = mount({ renderBar: ctx => (ctx.row.task.id === 'a' ? node() : null) });
    const headless = createExportSource({
      tasks: plan(),
      options: BASE,
      now: NOW,
      customBar: ctx => (ctx.row.task.id === 'a' ? MARKUP : null),
    });
    expect(await el.exportSvg({ idPrefix: 'p' })).toBe(exportChartSvg(headless, { idPrefix: 'p' }));
  });
});
