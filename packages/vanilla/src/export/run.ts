/**
 * @file run.ts
 * The export run (Phase 12, plan §3c), loaded on demand with `import('../export/run')` by the
 * engine (`engine.exportChart()`: the element's export methods and `LayerContext.runExport`, the
 * toolbar): a lazy chunk, so the element's entry bundle stays as it is.
 *
 *   svg / csv / png   the chart snapshot (`buildExportSource`) through core `exportChartSvg`,
 *                     `exportChartCsv`, `buildExportModel` + `planRaster` + `svgToPng`; no event
 *   download          cancelable `before-export` → the file (`exportFileText`, `EXPORT_MIME`) →
 *                     `downloadBlob` → `export` → `announceExportReady`
 *   print             one at a time; `before-export` → `exportChartPages` → `announcePrintReady`
 *                     → `printPages` → `export`
 *
 * Every step draws the chart as it was when the method was called (`snap`, taken by the engine with
 * `captureExport` before this chunk loads: D27). Failures reject: a `RangeError` for size limits
 * (`planRaster`, `maxPages`), an `Error` otherwise. A run started from the toolbar is caught by the
 * engine (`LayerContext.runExport`): `labels.announceExportFailed` (`announcePrintFailed` for a
 * print) in the alert region and `console.error`. Angular's `GanttExportService` runs the same
 * steps.
 */

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
  type GanttCsvExportOptions,
  type GanttExportFormat,
  type GanttExportTrigger,
  type GanttFileOptions,
  type GanttPngExportOptions,
  type GanttPrintOptions,
  type GanttSvgExportOptions,
} from '@gantryjs/core';
import type { Engine } from '../engine/engine';
import type { ExportCapture } from '../engine/export-capture';
import { buildExportSource } from './source';
import { downloadBlob } from './download';
import { printPages } from './print';
import { svgToPng } from './rasterize';

/** The options of a `download()`: its format's options and the file name. */
export type DownloadOptions = (GanttSvgExportOptions | GanttPngExportOptions | GanttCsvExportOptions) &
  GanttFileOptions;

/** One export: data (`svg`, `csv`, `png`), a file (`download`) or a print. */
export type ExportRequest =
  | { kind: 'svg'; options?: GanttSvgExportOptions | undefined }
  | { kind: 'csv'; options?: GanttCsvExportOptions | undefined }
  | { kind: 'png'; options?: GanttPngExportOptions | undefined }
  | {
      kind: 'download';
      format: 'svg' | 'png' | 'csv';
      options?: DownloadOptions | undefined;
      trigger: GanttExportTrigger;
    }
  | { kind: 'print'; options?: GanttPrintOptions | undefined; trigger: GanttExportTrigger };

/** Id prefix of a PNG's SVG (an image document of its own: no id can clash with the page's). */
const PNG_ID_PREFIX = 'gantry-png';

/** Charts printing now: one print at a time per chart (`print()` meanwhile resolves `false`). */
const printing = new WeakSet<Engine>();

/**
 * Runs `request` on `engine`'s chart as captured in `snap`: the SVG or CSV text, the PNG `Blob`,
 * or whether the download / print ran (`false`: vetoed, or a print already running).
 */
export async function runExport(
  engine: Engine,
  request: ExportRequest,
  snap: ExportCapture,
): Promise<string | Blob | boolean> {
  switch (request.kind) {
    case 'svg':
      return svgOf(engine, snap, request.options);
    case 'csv':
      return csvOf(engine, snap, request.options);
    case 'png':
      return pngOf(engine, snap, request.options);
    case 'download':
      return downloadFile(engine, snap, request.format, request.options, request.trigger);
    case 'print':
      return printChart(engine, snap, request.options, request.trigger);
  }
}

function svgOf(engine: Engine, snap: ExportCapture, options: GanttSvgExportOptions | undefined): string {
  const r = resolveExportCall(snap.config, 'svg', options);
  return exportChartSvg(buildExportSource(engine, snap, r.customBars), options);
}

function csvOf(engine: Engine, snap: ExportCapture, options: GanttCsvExportOptions | undefined): string {
  return exportChartCsv(buildExportSource(engine, snap, 'builtin'), options);
}

/** The PNG: the model at the largest scale that fits the canvas limits (`planRaster`), rasterized. */
function pngOf(engine: Engine, snap: ExportCapture, options: GanttPngExportOptions | undefined): Promise<Blob> {
  const r = resolveExportCall(snap.config, 'png', options);
  const model = buildExportModel(buildExportSource(engine, snap, r.customBars), r);
  const size = planRaster(model.width, model.height, r);
  const svg = renderExportSvg(model, null, { idPrefix: PNG_ID_PREFIX, scale: size.scale, prolog: false });
  return svgToPng(svg, size, engine.ctx.shadow.ownerDocument, model.background);
}

/**
 * Offers the export as a cancelable `before-export` (D8): `false` when a listener vetoed it, with
 * `event.preventDefault()` or `detail.preventDefault()`, synchronously.
 */
function allowed(
  engine: Engine,
  format: GanttExportFormat,
  trigger: GanttExportTrigger,
  fileName: string | null,
): boolean {
  const detail = createBeforeExportDetail(format, trigger, fileName);
  return engine.ctx.emit('before-export', detail) && !detail.defaultPrevented;
}

async function downloadFile(
  engine: Engine,
  snap: ExportCapture,
  format: 'svg' | 'png' | 'csv',
  options: DownloadOptions | undefined,
  trigger: GanttExportTrigger,
): Promise<boolean> {
  const { ctx } = engine;
  const fileName = exportFileName(snap.config.export, format, options?.fileName);
  if (!allowed(engine, format, trigger, fileName)) return false;
  let blob: Blob;
  if (format === 'png') blob = await pngOf(engine, snap, options as GanttPngExportOptions | undefined);
  else {
    const text =
      format === 'svg'
        ? exportFileText('svg', svgOf(engine, snap, options as GanttSvgExportOptions | undefined))
        : exportFileText('csv', csvOf(engine, snap, options as GanttCsvExportOptions | undefined), {
            bom: resolveExportCall(snap.config, 'csv', options as GanttCsvExportOptions | undefined).bom,
          });
    blob = new Blob([text], { type: EXPORT_MIME[format] });
  }
  downloadBlob(blob, fileName, ctx.shadow.ownerDocument, ctx.shadow);
  ctx.emit('export', { format, trigger, fileName, size: blob.size, pages: null });
  ctx.announce.say(snap.i18n.labels.announceExportReady(fileName));
  return true;
}

async function printChart(
  engine: Engine,
  snap: ExportCapture,
  options: GanttPrintOptions | undefined,
  trigger: GanttExportTrigger,
): Promise<boolean> {
  // Checked and taken before any await (the engine runs same-tick calls in order)
  if (printing.has(engine)) return false;
  // Taken before `before-export`: a print started by one of its listeners resolves `false`
  printing.add(engine);
  try {
    if (!allowed(engine, 'print', trigger, null)) return false;
    const { ctx } = engine;
    const r = resolveExportCall(snap.config, 'print', options);
    const doc = exportChartPages(buildExportSource(engine, snap, r.customBars), options);
    const pages = doc.pages.length;
    ctx.announce.say(snap.i18n.labels.announcePrintReady(pages));
    await printPages(doc, ctx.shadow.ownerDocument);
    ctx.emit('export', { format: 'print', trigger, fileName: null, size: null, pages });
    return true;
  } finally {
    printing.delete(engine);
  }
}
