// ─────────────────────────────────────────────────────────────
//  Tests — Phase 12 contract (step 1.0): the `export` option and its
//  resolved defaults per format, `fileName` (string / function),
//  `formats`, `toolbar.export`, the new labels, the export constants,
//  the toolbar model's new unions at their neutral values (no export
//  group: the Phase 11 output), and the export modules at the package
//  root.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import * as core from '../index';
import {
  DEFAULT_EXPORT_FILE_NAME,
  DEFAULT_EXPORT_FORMATS,
  DEFAULT_LABELS,
  DOWNLOAD_REVOKE_MS,
  EXPORT_LEGEND,
  EXPORT_MIME,
  EXPORT_TABLE,
  LEGEND_SWATCH_SIZE,
  PAPER_SIZES_MM,
  PNG_DEFAULT_SCALE,
  PNG_MAX_PIXELS,
  PNG_MAX_SIDE,
  PRINT_CLEANUP_MS,
  PRINT_DEFAULT_MARGIN_MM,
  PRINT_FOOTER_HEIGHT,
  PRINT_MAX_PAGES,
  PRINT_MIN_SCALE,
  PX_PER_MM,
  TOOLBAR_ICONS,
  buildToolbar,
  layoutToolbar,
  resolveConfig,
  resolveExport,
  resolveExportFormat,
  type GanttBeforeExportEvent,
  type GanttCsvExportOptions,
  type GanttExportEvent,
  type GanttExportFormat,
  type GanttExportOptions,
  type GanttExportTrigger,
  type GanttLabels,
  type GanttOptions,
  type GanttPngExportOptions,
  type GanttPrintOptions,
  type GanttSvgExportOptions,
  type GanttToolbarOptions,
  type ResolvedCsvExport,
  type ResolvedExport,
  type ResolvedPngExport,
  type ResolvedPrintExport,
  type ResolvedSvgExport,
  type ResolvedToolbar,
  type ToolbarAction,
  type ToolbarGroup,
  type ToolbarGroupKey,
  type ToolbarIcon,
  type ToolbarInput,
  type ToolbarLayout,
  type ToolbarLayoutInput,
} from '../index';

const exp = (o?: GanttOptions['export']): ResolvedExport => resolveConfig({ export: o }).export;

const IMAGE = {
  view: 'auto',
  range: undefined,
  theme: 'current',
  background: 'theme',
  legend: undefined,
  today: undefined,
  title: undefined,
  description: undefined,
  customBars: 'render',
} as const;

const SVG: ResolvedSvgExport = { ...IMAGE, scale: 1, idPrefix: undefined };
const PNG: ResolvedPngExport = { ...IMAGE, scale: 2, maxSide: 16_384, maxPixels: 16_777_216 };
const PRINT: ResolvedPrintExport = {
  ...IMAGE,
  theme: 'light',
  paper: 'a4',
  orientation: 'landscape',
  margin: 10,
  fit: 'width',
  scale: 1,
  minScale: 0.5,
  repeatHeader: true,
  repeatTable: true,
  pageNumbers: true,
  maxPages: 200,
};
const CSV: ResolvedCsvExport = {
  columns: 'visible',
  rows: 'all',
  values: 'data',
  delimiter: ',',
  header: true,
  bom: true,
  neutralizeFormulas: true,
};

// ─── resolveConfig: export ────────────────────────────────────

describe('resolveConfig: export defaults per format', () => {
  it('fills every format: svg / png show the current theme, print the light one', () => {
    const e = exp();
    expect(e.svg).toEqual(SVG);
    expect(e.png).toEqual(PNG);
    expect(e.csv).toEqual(CSV);
    expect(e.print).toEqual(PRINT);
    expect(e.formats).toEqual(['svg', 'png', 'csv', 'print']);
    expect(e.fileName('svg')).toBe('gantt');
  });

  it("leaves the chart's values unset: range, legend, today, title and description", () => {
    for (const f of ['svg', 'png', 'print'] as const) {
      const r = exp()[f];
      expect([r.range, r.legend, r.today, r.title, r.description]).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    }
  });

  it('{} and undefined resolve alike', () => {
    const a = exp();
    const b = exp({});
    expect(b).toEqual(a);
    expect(resolveExport(undefined)).toEqual(a);
  });

  it('a set field wins, the others keep their defaults', () => {
    const range = { start: new Date(2026, 2, 1), end: new Date(2026, 3, 30) };
    const e = exp({
      svg: { theme: 'dark', background: 'transparent', scale: 3, idPrefix: 'plan', range },
      png: { scale: 4, maxSide: 8192, legend: false, customBars: 'builtin' },
      csv: { columns: ['name', 'start'], rows: 'shown', values: 'display', delimiter: ';', bom: false },
      print: {
        paper: { width: 11, height: 17, unit: 'in' },
        orientation: 'auto',
        margin: 0,
        fit: 'none',
        theme: 'current',
        repeatTable: false,
        maxPages: 12.7,
        title: 'Plan',
      },
    });
    expect(e.svg).toEqual({ ...SVG, theme: 'dark', background: 'transparent', scale: 3, idPrefix: 'plan', range });
    expect(e.png).toEqual({ ...PNG, scale: 4, maxSide: 8192, legend: false, customBars: 'builtin' });
    expect(e.csv).toEqual({
      ...CSV,
      columns: ['name', 'start'],
      rows: 'shown',
      values: 'display',
      delimiter: ';',
      bom: false,
    });
    expect(e.print).toEqual({
      ...PRINT,
      paper: { width: 11, height: 17, unit: 'in' },
      orientation: 'auto',
      margin: 0,
      fit: 'none',
      theme: 'current',
      repeatTable: false,
      maxPages: 12,
      title: 'Plan',
    });
  });

  it('a number out of range keeps the default (untyped callers)', () => {
    const e = exp({
      svg: { scale: 0 },
      png: { scale: -1, maxSide: 0, maxPixels: Number.NaN },
      print: { margin: -5, scale: 0, minScale: Number.POSITIVE_INFINITY, maxPages: 0.5 },
    });
    expect(e.svg.scale).toBe(1);
    expect([e.png.scale, e.png.maxSide, e.png.maxPixels]).toEqual([2, 16_384, 16_777_216]);
    expect([e.print.margin, e.print.scale, e.print.minScale, e.print.maxPages]).toEqual([10, 1, 0.5, 200]);
  });

  it('a background colour passes through', () => {
    expect(exp({ png: { background: '#fafafa' } }).png.background).toBe('#fafafa');
  });
});

describe('resolveConfig: export.fileName', () => {
  it("defaults to 'gantt' for every format", () => {
    const { fileName } = exp();
    expect(['svg', 'png', 'csv'].map(f => fileName(f as 'svg'))).toEqual(['gantt', 'gantt', 'gantt']);
    expect(DEFAULT_EXPORT_FILE_NAME).toBe('gantt');
  });

  it('a string: the same base name for every format (not sanitized, no extension yet)', () => {
    const { fileName } = exp({ fileName: 'Release plan: Q3' });
    expect(fileName('svg')).toBe('Release plan: Q3');
    expect(fileName('csv')).toBe('Release plan: Q3');
  });

  it('a function: called with the format', () => {
    const fn = (f: 'svg' | 'png' | 'csv') => `plan-${f}`;
    const { fileName } = exp({ fileName: fn });
    expect(fileName).toBe(fn);
    expect([fileName('svg'), fileName('png'), fileName('csv')]).toEqual(['plan-svg', 'plan-png', 'plan-csv']);
  });

  it('equal options resolve to the same function, so equal configs stay equal', () => {
    expect(exp().fileName).toBe(exp().fileName);
    expect(exp({ fileName: 'a' }).fileName).toBe(exp({ fileName: 'a' }).fileName);
    expect(exp({ fileName: 'a' }).fileName).not.toBe(exp({ fileName: 'b' }).fileName);
    expect(exp({ fileName: 'gantt' }).fileName).toBe(exp().fileName);
  });
});

describe('resolveConfig: export.formats', () => {
  it('defaults to svg, png, csv, print', () => {
    expect(exp().formats).toEqual([...DEFAULT_EXPORT_FORMATS]);
    expect(DEFAULT_EXPORT_FORMATS).toEqual(['svg', 'png', 'csv', 'print']);
    expect(Object.isFrozen(DEFAULT_EXPORT_FORMATS)).toBe(true);
  });

  it('keeps the given order, each format once, known formats only; [] means none', () => {
    expect(exp({ formats: ['csv', 'print'] }).formats).toEqual(['csv', 'print']);
    expect(exp({ formats: ['print', 'svg', 'print', 'svg'] }).formats).toEqual(['print', 'svg']);
    expect(exp({ formats: ['pdf', 'png'] as unknown as GanttExportFormat[] }).formats).toEqual(['png']);
    expect(exp({ formats: [] }).formats).toEqual([]);
  });

  it('a fresh array each time (the default list is never handed out)', () => {
    const a = exp().formats;
    a.push('svg');
    expect(exp().formats).toEqual(['svg', 'png', 'csv', 'print']);
  });
});

describe('resolveExportFormat: a call over a base', () => {
  it('without options: the base (the defaults when no base)', () => {
    expect(resolveExportFormat('svg', undefined)).toEqual(SVG);
    expect(resolveExportFormat('print', undefined)).toEqual(PRINT);
    const base = exp({ png: { scale: 3 } }).png;
    expect(resolveExportFormat('png', undefined, base)).toBe(base);
  });

  it("set fields over the base's, invalid numbers keep the base's", () => {
    const base = exp({ png: { scale: 3, theme: 'dark' } }).png;
    expect(resolveExportFormat('png', { scale: 1.5, today: false }, base)).toEqual({
      ...base,
      scale: 1.5,
      today: false,
    });
    expect(resolveExportFormat('png', { scale: 0 }, base).scale).toBe(3);
    const csv = exp({ csv: { delimiter: '\t' } }).csv;
    expect(resolveExportFormat('csv', { header: false }, csv)).toEqual({ ...CSV, delimiter: '\t', header: false });
  });

  it('is what resolveConfig uses', () => {
    const o: GanttExportOptions = { svg: { scale: 2 }, print: { paper: 'letter' } };
    expect(resolveExport(o)).toEqual(exp(o));
    expect(resolveExportFormat('print', o.print)).toEqual(exp(o).print);
  });
});

describe('resolveConfig: export changes nothing else (no paint change)', () => {
  it('the rest of the config is the same with or without export options', () => {
    const { export: off, ...base } = resolveConfig({ viewMode: 'Day' });
    const { export: on, ...rest } = resolveConfig({
      viewMode: 'Day',
      export: { fileName: 'x', formats: ['csv'], png: { scale: 4 } },
    });
    expect(rest).toEqual(base);
    expect(on.formats).toEqual(['csv']);
    expect(off.formats).toEqual(['svg', 'png', 'csv', 'print']);
  });

  it('two resolutions of the same options are equal', () => {
    const o: GanttOptions = { viewMode: 'Week', export: { fileName: 'plan' }, toolbar: { export: true } };
    expect(resolveConfig(o)).toEqual(resolveConfig(o));
  });
});

// ─── toolbar.export ───────────────────────────────────────────

describe('resolveConfig: toolbar.export', () => {
  const toolbar = (o: GanttOptions = {}) => resolveConfig(o).toolbar as ResolvedToolbar;

  it('defaults to false; true turns it on; no toolbar, no field', () => {
    expect(toolbar().export).toBe(false);
    expect(toolbar({ toolbar: {} }).export).toBe(false);
    expect(toolbar({ toolbar: { export: true } }).export).toBe(true);
    expect(toolbar({ toolbar: { export: undefined } }).export).toBe(false);
    expect(resolveConfig({ toolbar: false }).toolbar).toBe(false);
  });

  it('toolbar.export changes nothing else in the toolbar config', () => {
    const { export: off, ...base } = toolbar();
    const { export: on, ...rest } = toolbar({ toolbar: { export: true } });
    expect(rest).toEqual(base);
    expect([off, on]).toEqual([false, true]);
  });
});

describe('toolbar model: the Phase 12 fields at their neutral values', () => {
  const cfg = resolveConfig({ editing: true });
  const groups = buildToolbar({
    toolbar: cfg.toolbar,
    zoomLevels: cfg.zoomLevels,
    labels: DEFAULT_LABELS,
    viewMode: cfg.level.name,
    view: 'split',
  });

  it('the default toolbar is the Phase 11 one: no export group, no menu on any group', () => {
    expect(groups.map(g => g.key)).toEqual(['zoom', 'levels', 'today', 'views']);
    for (const g of groups) expect(g.menu).toBeNull();
  });

  it('a layout has no Export menu (wide, narrow, wrap)', () => {
    const base = { groups, controlSize: cfg.controlSize, labels: DEFAULT_LABELS };
    for (const width of [0, 300, 2000]) {
      expect(layoutToolbar({ ...base, width, overflow: 'menu' }).exportMenu).toBeNull();
      expect(layoutToolbar({ ...base, width, overflow: 'wrap' }).exportMenu).toBeNull();
    }
    const narrow = layoutToolbar({ ...base, width: 300, overflow: 'menu' });
    expect(narrow.groups.at(-1)?.key).toBe('more');
    expect(narrow.groups.at(-1)?.menu).toBeNull();
  });

  it('the export icon: an arrow down into a tray, on the 16 px grid', () => {
    expect(TOOLBAR_ICONS.export).toEqual([
      'M8 2.5v7',
      'M5 6.5l3 3 3-3',
      'M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
    ]);
  });

  it('the unions compile with the new members', () => {
    expectTypeOf<'export'>().toExtend<ToolbarIcon>();
    expectTypeOf<'export'>().toExtend<ToolbarGroupKey>();
    expectTypeOf<Extract<ToolbarAction, { type: 'exportMenu' }>>().toEqualTypeOf<{ type: 'exportMenu' }>();
    expectTypeOf<Extract<ToolbarAction, { type: 'export' }>>().toEqualTypeOf<{
      type: 'export';
      format: GanttExportFormat;
    }>();
    expectTypeOf<ToolbarGroup['menu']>().toEqualTypeOf<readonly ToolbarGroup['items'][number][] | null>();
    expectTypeOf<ToolbarLayout['exportMenu']>().toEqualTypeOf<ToolbarLayout['menu']>();
    expectTypeOf<ToolbarInput['export']>().toEqualTypeOf<
      { formats: readonly GanttExportFormat[] } | null | undefined
    >();
    expectTypeOf<ToolbarLayoutInput['exportMenuOpen']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<GanttToolbarOptions['export']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<ResolvedToolbar['export']>().toEqualTypeOf<boolean>();
  });
});

// ─── Labels ───────────────────────────────────────────────────

describe('labels: Phase 12', () => {
  const STRINGS: Partial<Record<keyof GanttLabels, string>> = {
    exportMenu: 'Export',
    exportSvg: 'SVG image',
    exportPng: 'PNG image',
    exportCsv: 'CSV table',
    exportPrint: 'Print…',
  };

  it('adds 5 strings and 5 sentences (10 required labels)', () => {
    expect(DEFAULT_LABELS).toMatchObject(STRINGS);
    expect(Object.keys(STRINGS)).toHaveLength(5);
    const L = DEFAULT_LABELS;
    expect(L.exportDescription(1, 'Mar 2, 2026', 'Mar 9, 2026')).toBe('1 task from Mar 2, 2026 to Mar 9, 2026');
    expect(L.exportDescription(12, 'Mar 2, 2026', 'Apr 30, 2026')).toBe('12 tasks from Mar 2, 2026 to Apr 30, 2026');
    expect(L.exportDescription(0, 'a', 'b')).toBe('0 tasks from a to b');
    expect(L.printPage(2, 5)).toBe('Page 2 of 5');
    expect(L.announceExportReady('release-plan.png')).toBe('release-plan.png is ready');
    expect(L.announcePrintReady(1)).toBe('Printing 1 page');
    expect(L.announcePrintReady(3)).toBe('Printing 3 pages');
    expect(L.announceExportFailed(L.exportPng)).toBe('Couldn’t export the PNG image');
  });

  it('are required members of GanttLabels; options.labels stays partial', () => {
    expectTypeOf<GanttLabels['exportMenu']>().toEqualTypeOf<string>();
    expectTypeOf<GanttLabels['exportDescription']>().toEqualTypeOf<
      (count: number, start: string, end: string) => string
    >();
    expectTypeOf<GanttLabels['printPage']>().toEqualTypeOf<(page: number, total: number) => string>();
    expectTypeOf<GanttLabels['announceExportReady']>().toEqualTypeOf<(fileName: string) => string>();
    expectTypeOf<GanttLabels['announcePrintReady']>().toEqualTypeOf<(pages: number) => string>();
    expectTypeOf<GanttLabels['announceExportFailed']>().toEqualTypeOf<(what: string) => string>();
    expectTypeOf<{ exportMenu: string }>().toExtend<NonNullable<GanttOptions['labels']>>();
  });
});

// ─── Constants and types ──────────────────────────────────────

describe('export constants', () => {
  it('the PNG and print defaults match resolveConfig', () => {
    const e = exp();
    expect([PNG_DEFAULT_SCALE, PNG_MAX_SIDE, PNG_MAX_PIXELS]).toEqual([e.png.scale, e.png.maxSide, e.png.maxPixels]);
    expect(PNG_MAX_PIXELS).toBe(4096 * 4096);
    expect([PRINT_DEFAULT_MARGIN_MM, PRINT_MIN_SCALE, PRINT_MAX_PAGES]).toEqual([
      e.print.margin,
      e.print.minScale,
      e.print.maxPages,
    ]);
  });

  it('paper sizes in mm (portrait), 96 px per inch, the footer reserve and the timers', () => {
    expect(PAPER_SIZES_MM).toEqual({
      a4: { width: 210, height: 297 },
      a3: { width: 297, height: 420 },
      letter: { width: 215.9, height: 279.4 },
      legal: { width: 215.9, height: 355.6 },
      tabloid: { width: 279.4, height: 431.8 },
    });
    expect(PX_PER_MM * 25.4).toBeCloseTo(96, 10);
    expect(PRINT_FOOTER_HEIGHT).toBe(24);
    expect([PRINT_CLEANUP_MS, DOWNLOAD_REVOKE_MS]).toEqual([60_000, 30_000]);
  });

  it('MIME types', () => {
    expect(EXPORT_MIME).toEqual({
      svg: 'image/svg+xml;charset=utf-8',
      png: 'image/png',
      csv: 'text/csv;charset=utf-8',
    });
  });

  it('the task list and legend metrics (the Web Component CSS)', () => {
    expect(EXPORT_TABLE).toMatchObject({
      cellPadX: 8,
      toggle: 24,
      nameGap: 4,
      statusDot: 8,
      statusDotGap: 6,
      border: 1,
    });
    expect(EXPORT_LEGEND).toMatchObject({ fontPx: 11, lineHeight: 16, padY: 6, padX: 12, itemGap: 14, swatchGap: 5 });
    expect(LEGEND_SWATCH_SIZE).toEqual({ width: 18, height: 12 });
    for (const c of [PAPER_SIZES_MM, EXPORT_MIME, EXPORT_TABLE, EXPORT_LEGEND]) expect(Object.isFrozen(c)).toBe(true);
  });
});

describe('export types', () => {
  it('options, call options and events', () => {
    expectTypeOf<GanttOptions['export']>().toEqualTypeOf<GanttExportOptions | undefined>();
    expectTypeOf<GanttExportOptions['svg']>().toEqualTypeOf<GanttSvgExportOptions | undefined>();
    expectTypeOf<GanttExportOptions['png']>().toEqualTypeOf<GanttPngExportOptions | undefined>();
    expectTypeOf<GanttExportOptions['csv']>().toEqualTypeOf<GanttCsvExportOptions | undefined>();
    expectTypeOf<GanttExportOptions['print']>().toEqualTypeOf<GanttPrintOptions | undefined>();
    expectTypeOf<GanttExportFormat>().toEqualTypeOf<'svg' | 'png' | 'csv' | 'print'>();
    expectTypeOf<GanttExportTrigger>().toEqualTypeOf<'toolbar' | 'api'>();
    expectTypeOf<GanttBeforeExportEvent['fileName']>().toEqualTypeOf<string | null>();
    expectTypeOf<GanttBeforeExportEvent['preventDefault']>().toEqualTypeOf<() => void>();
    expectTypeOf<GanttExportEvent>().toEqualTypeOf<{
      format: GanttExportFormat;
      trigger: GanttExportTrigger;
      fileName: string | null;
      size: number | null;
      pages: number | null;
    }>();
    expectTypeOf<ResolvedExport['print']>().toEqualTypeOf<ResolvedPrintExport>();
    // A resolved format is a valid call (the bindings pass `resolveExportCall` results to core)
    expectTypeOf<ResolvedSvgExport>().toExtend<GanttSvgExportOptions>();
    expectTypeOf<ResolvedPngExport>().toExtend<GanttPngExportOptions>();
    expectTypeOf<ResolvedCsvExport>().toExtend<GanttCsvExportOptions>();
    expectTypeOf<ResolvedPrintExport>().toExtend<GanttPrintOptions>();
  });

  it('the export modules are exported from the package root', () => {
    for (const fn of [
      core.createExportSource,
      core.exportTheme,
      core.exportTimeline,
      core.buildExportModel,
      core.buildTimelinePart,
      core.buildTablePart,
      core.buildLegendPart,
      core.escapeXml,
      core.stripInvalidXml,
      core.inlineThemeVars,
      core.renderExportSvg,
      core.exportChartSvg,
      core.paperSizePx,
      core.paginateChart,
      core.printCss,
      core.exportChartPages,
      core.exportChartCsv,
      core.csvField,
      core.neutralizeFormula,
      core.csvCellValue,
      core.isPlainNumber,
      core.sanitizeFileName,
      core.exportFileName,
      core.resolveExportCall,
      core.createBeforeExportDetail,
      core.exportFileText,
      core.planRaster,
      core.resolveExport,
      core.resolveExportFormat,
    ]) {
      expect(typeof fn).toBe('function');
    }
    // `num` (export/xml.ts) stays internal
    expect('num' in core).toBe(false);
  });
});
