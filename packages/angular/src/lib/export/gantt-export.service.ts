// ─────────────────────────────────────────────────────────────
//  gantry · export/gantt-export.service.ts
//
//  The export run (Gantry 2 phase 12, plan §3c), the Web Component's
//  `export/run.ts`. Provided by GantryComponent (one per chart, bound
//  once from its constructor); its methods back the component's
//  `exportSvg`, `exportCsv`, `exportPng`, `download` and `print`, and
//  `run` backs the toolbar's Export menu:
//
//    svg / csv / png   the chart snapshot (`buildExportSource`, read
//                      `untracked` from the layout graph) through core
//                      `exportChartSvg`, `exportChartCsv`,
//                      `buildExportModel` + `planRaster` + `svgToPng`;
//                      no output
//    download          `beforeExport` (vetoed by its `preventDefault()`)
//                      → the file (`exportFileText`, `EXPORT_MIME`) →
//                      `downloadBlob` → `export` → `announceExportReady`
//    print             one at a time (the lock is taken before
//                      `beforeExport`: a print started by its listener
//                      resolves `false`); `beforeExport` →
//                      `exportChartPages` → `announcePrintReady` →
//                      `printPages` → `export`
//
//  Every step reads the chart when it runs (a snapshot, D27). Failures
//  reject: a `RangeError` for size limits (`planRaster`, `maxPages`), an
//  `Error` otherwise. A run started from the toolbar (`run`) never
//  rejects: `labels.announceExportFailed` (`announcePrintFailed` for a
//  print) in the alert region, and `console.error`.
//
//  `exportSvg()` / `exportCsv()` work on the server (custom bars drawn
//  as built-in); `exportPng()`, `download()` and `print()` reject there
//  (`… needs a browser`). Custom bar components are rendered off-screen
//  once each (`GanttCanvasComponent.renderCustomBarMarkup`, D5). The DOM
//  helpers (`export/{download,rasterize,print,serialize}.ts`) come
//  through `GANTT_EXPORT_DOM`.
// ─────────────────────────────────────────────────────────────

import { DOCUMENT, Injectable, InjectionToken, PLATFORM_ID, inject, untracked } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import {
  buildExportModel,
  createBeforeExportDetail,
  exportChartCsv,
  exportChartPages,
  exportChartSvg,
  exportFileName,
  exportFileText,
  planRaster,
  renderExportSvg,
  resolveExportCall,
  EXPORT_MIME,
  type ChartExportSource,
  type ExportCustomBar,
  type GanttBeforeExportEvent,
  type GanttCsvExportOptions,
  type GanttExportEvent,
  type GanttExportFormat,
  type GanttExportTrigger,
  type GanttFileOptions,
  type GanttLabels,
  type GanttOptions,
  type GanttPngExportOptions,
  type GanttPrintOptions,
  type GanttSvgExportOptions,
} from '@gantryjs/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttThemeService } from '../services/gantt-theme.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttColumnService } from '../columns/gantt-column.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttAnnouncer } from '../a11y/announcer';
import { buildExportSource, type GanttExportGraph } from './source';
import { downloadBlob } from './download';
import { printPages } from './print';
import { svgToPng } from './rasterize';
import { serializeSvg } from './serialize';

/** The options of a `download()`: its format's options and the file name. */
export type GanttDownloadOptions = (GanttSvgExportOptions | GanttPngExportOptions | GanttCsvExportOptions) &
  GanttFileOptions;

/** The DOM helpers of an export (plan §3f): a token, so a test can stand in for the browser. */
export interface GanttExportDom {
  readonly downloadBlob: typeof downloadBlob;
  readonly svgToPng: typeof svgToPng;
  readonly printPages: typeof printPages;
  readonly serializeSvg: typeof serializeSvg;
}

/** The export's DOM helpers (internal: not exported from the package). */
export const GANTT_EXPORT_DOM = new InjectionToken<GanttExportDom>('GANTT_EXPORT_DOM', {
  providedIn: 'root',
  factory: () => ({ downloadBlob, svgToPng, printPages, serializeSvg }),
});

/** The export outputs, by the Web Component's event names */
export interface GanttExportEvents {
  readonly 'before-export': GanttBeforeExportEvent;
  readonly export: GanttExportEvent;
}

/** What GantryComponent binds once: the inputs no service holds, its outputs and live regions. */
export interface GanttExportSources {
  /** The chart's `options` (its `theme`: the overrides a light or dark export keeps) */
  readonly options: () => GanttOptions;
  /** The chart's `showLegend` input */
  readonly showLegend: () => boolean;
  /** Where a download's link is clicked: the chart's host */
  readonly mount: () => ParentNode;
  /** A custom bar's markup (D5): the canvas' `renderCustomBarMarkup`, `null` for a built-in bar */
  readonly customBar: ExportCustomBar;
  /** Emits an output (`beforeExport`, `export`) */
  readonly emit: <K extends keyof GanttExportEvents>(type: K, detail: GanttExportEvents[K]) => void;
  /** Writes the alert region (`.gantt-sr-alert`): a failed toolbar export */
  readonly alert: (text: string) => void;
}

/** Id prefix of a PNG's SVG (an image document of its own: no id can clash with the page's). */
const PNG_ID_PREFIX = 'gantry-png';

/** What the alert region says when an export from the toolbar failed. */
function failureText(labels: GanttLabels, format: GanttExportFormat): string {
  switch (format) {
    case 'svg':
      return labels.announceExportFailed(labels.exportSvg);
    case 'png':
      return labels.announceExportFailed(labels.exportPng);
    case 'csv':
      return labels.announceExportFailed(labels.exportCsv);
    case 'print':
      return labels.announcePrintFailed;
  }
}

@Injectable()
export class GanttExportService {
  private readonly layout = inject(GanttLayoutService);
  private readonly theme = inject(GanttThemeService);
  private readonly i18n = inject(GanttI18nService);
  private readonly columns = inject(GanttColumnService);
  private readonly scroll = inject(GanttScrollService);
  private readonly announcer = inject(GanttAnnouncer);
  private readonly doc = inject(DOCUMENT);
  private readonly dom = inject(GANTT_EXPORT_DOM);
  /** Rendering on the server: data only (custom bars drawn as built-in) */
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  private sources: GanttExportSources | null = null;
  /** A print is running: `print()` meanwhile resolves `false` */
  private printing = false;

  /** Bind the chart's sources (once, from GantryComponent's constructor). */
  bind(sources: GanttExportSources): void {
    this.sources = sources;
  }

  /** The chart as an SVG image (the `<svg>` element, no XML declaration). */
  exportSvg(options?: GanttSvgExportOptions): Promise<string> {
    return attempt(() => this.svgOf(options));
  }

  /** The chart's tasks as CSV text (no byte order mark). */
  exportCsv(options?: GanttCsvExportOptions): Promise<string> {
    return attempt(() => this.csvOf(options));
  }

  /** The chart as a PNG image; rejects with a `RangeError` when it can't fit the canvas limits. */
  exportPng(options?: GanttPngExportOptions): Promise<Blob> {
    return attempt(() => {
      this.needsBrowser('exportPng()');
      return this.pngOf(options);
    });
  }

  /** Saves the chart as a file; `false` when `beforeExport` vetoed it. */
  download(
    format: 'svg' | 'png' | 'csv',
    options?: GanttDownloadOptions,
    trigger: GanttExportTrigger = 'api',
  ): Promise<boolean> {
    return attempt(() => this.downloadFile(format, options, trigger));
  }

  /** Prints the whole chart; `false` when `beforeExport` vetoed it or a print is running. */
  print(options?: GanttPrintOptions, trigger: GanttExportTrigger = 'api'): Promise<boolean> {
    return attempt(() => this.printChart(options, trigger));
  }

  /**
   * The toolbar's Export menu: `download(format)` or `print()` with `trigger`; never rejects (a
   * failure is announced in the alert region and logged).
   */
  run(format: GanttExportFormat, trigger: GanttExportTrigger): Promise<boolean> {
    const job = format === 'print' ? this.print(undefined, trigger) : this.download(format, undefined, trigger);
    return job.then(
      ran => ran,
      (error: unknown) => {
        const labels = untracked(this.i18n.labels);
        this.bound().alert(failureText(labels, format));
        console.error('[gantry] export failed:', error);
        return false;
      },
    );
  }

  // ── Steps ─────────────────────────────────────────────────

  private bound(): GanttExportSources {
    if (!this.sources) throw new Error('[gantry] export used before the chart bound it');
    return this.sources;
  }

  /** Rejects on the server (no window): PNGs, files and prints need a browser */
  private needsBrowser(what: string): void {
    if (this.server || !this.doc.defaultView) throw new Error(`Gantry: ${what} needs a browser`);
  }

  /** The chart now; custom bars drawn with `customBars: 'render'` in the browser */
  private source(customBars: 'render' | 'builtin'): ChartExportSource {
    const sources = this.bound();
    const graph: GanttExportGraph = {
      layout: this.layout,
      theme: this.theme,
      i18n: this.i18n,
      columns: this.columns,
      scroll: this.scroll,
      options: sources.options,
      showLegend: sources.showLegend,
    };
    const custom = customBars === 'render' && !this.server ? sources.customBar : null;
    return buildExportSource(graph, custom);
  }

  private svgOf(options: GanttSvgExportOptions | undefined): string {
    const r = resolveExportCall(untracked(this.layout.cfg), 'svg', options);
    return exportChartSvg(this.source(r.customBars), options);
  }

  private csvOf(options: GanttCsvExportOptions | undefined): string {
    return exportChartCsv(this.source('builtin'), options);
  }

  /** The PNG: the model at the largest scale that fits the canvas limits (`planRaster`), rasterized. */
  private pngOf(options: GanttPngExportOptions | undefined): Promise<Blob> {
    const r = resolveExportCall(untracked(this.layout.cfg), 'png', options);
    const model = buildExportModel(this.source(r.customBars), r);
    const size = planRaster(model.width, model.height, r);
    const svg = renderExportSvg(model, null, { idPrefix: PNG_ID_PREFIX, scale: size.scale, prolog: false });
    return this.dom.svgToPng(svg, size, this.doc, model.background);
  }

  /**
   * Offers the export through `beforeExport` (D8): `false` when a listener vetoed it with
   * `preventDefault()`, synchronously.
   */
  private allowed(format: GanttExportFormat, trigger: GanttExportTrigger, fileName: string | null): boolean {
    const detail = createBeforeExportDetail(format, trigger, fileName);
    this.bound().emit('before-export', detail);
    return !detail.defaultPrevented;
  }

  private async downloadFile(
    format: 'svg' | 'png' | 'csv',
    options: GanttDownloadOptions | undefined,
    trigger: GanttExportTrigger,
  ): Promise<boolean> {
    this.needsBrowser('download()');
    const sources = this.bound();
    const cfg = untracked(this.layout.cfg);
    const fileName = exportFileName(cfg.export, format, options?.fileName);
    if (!this.allowed(format, trigger, fileName)) return false;
    let blob: Blob;
    if (format === 'png') blob = await this.pngOf(options as GanttPngExportOptions | undefined);
    else {
      const text =
        format === 'svg'
          ? exportFileText('svg', this.svgOf(options as GanttSvgExportOptions | undefined))
          : exportFileText('csv', this.csvOf(options as GanttCsvExportOptions | undefined), {
              bom: resolveExportCall(cfg, 'csv', options as GanttCsvExportOptions | undefined).bom,
            });
      blob = new Blob([text], { type: EXPORT_MIME[format] });
    }
    this.dom.downloadBlob(blob, fileName, this.doc, sources.mount());
    sources.emit('export', { format, trigger, fileName, size: blob.size, pages: null });
    this.announcer.announce(untracked(this.i18n.labels).announceExportReady(fileName));
    return true;
  }

  private async printChart(options: GanttPrintOptions | undefined, trigger: GanttExportTrigger): Promise<boolean> {
    this.needsBrowser('print()');
    if (this.printing) return false;
    // Taken before `beforeExport`: a print started by one of its listeners resolves `false`
    this.printing = true;
    try {
      if (!this.allowed('print', trigger, null)) return false;
      const r = resolveExportCall(untracked(this.layout.cfg), 'print', options);
      const doc = exportChartPages(this.source(r.customBars), options);
      const pages = doc.pages.length;
      this.announcer.announce(untracked(this.i18n.labels).announcePrintReady(pages));
      await this.dom.printPages(doc, this.doc);
      this.bound().emit('export', { format: 'print', trigger, fileName: null, size: null, pages });
      return true;
    } finally {
      this.printing = false;
    }
  }
}

/** `run()`'s value as a promise, run now: a throw rejects it (the methods never throw synchronously). */
function attempt<T>(run: () => T | Promise<T>): Promise<T> {
  return new Promise<T>(resolve => resolve(run()));
}
