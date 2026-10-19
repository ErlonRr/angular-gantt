/**
 * The export cases' log: one line per finished or blocked `download()` / `print()` ("Saved
 * release-plan.svg (24.6 KB)", "Printed 3 pages", "Blocked: PNG image"), newest first, at most
 * `EXPORT_LOG_LIMIT` lines. Pages keep the lines with `pushLog` (`edit-log.ts`) and show them in
 * `ol.gs-case-log`, which is not a live region: the chart announces each export itself.
 */

import { DEFAULT_LABELS, type GanttExportEvent, type GanttExportFormat, type GanttLabels } from '@gantryjs/core';
import { EDIT_LOG_LIMIT } from './edit-log';

/** The lines a log keeps (the editing cases' limit: both go through `pushLog`) */
export const EXPORT_LOG_LIMIT = EDIT_LOG_LIMIT;

const UNITS = ['KB', 'MB', 'GB'] as const;

/**
 * A file size in words: bytes below 1000 ("980 B"), else KB, MB or GB (1000 each) with one decimal
 * and a `.` ("24.6 KB", "1.2 MB"). A size that rounds up to 1000 of a unit reads in the next one.
 */
export function formatBytes(n: number): string {
  const bytes = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  if (bytes < 1000) return `${bytes} B`;
  let value = bytes / 1000;
  let unit = 0;
  while (unit < UNITS.length - 1 && Math.round(value * 10) / 10 >= 1000) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** The labels a blocked line names a format with (the chart's `labels`, or the defaults) */
export type ExportFormatLabels = Pick<GanttLabels, 'exportSvg' | 'exportPng' | 'exportCsv' | 'exportPrint'>;

/** The menu label of a format, without a trailing ellipsis ("Print…" → "Print"). */
function formatLabel(format: GanttExportFormat, labels: ExportFormatLabels): string {
  const label = {
    svg: labels.exportSvg,
    png: labels.exportPng,
    csv: labels.exportCsv,
    print: labels.exportPrint,
  }[format];
  return label.replace(/(…|\.\.\.)$/, '');
}

/**
 * The log line of an `export` detail: "Saved <file> (<size>)" after a download, "Printed <n>
 * page(s)" after a print.
 */
export function describeExport(detail: GanttExportEvent): string {
  if (detail.format === 'print') {
    const pages = detail.pages ?? 0;
    return `Printed ${pages} ${pages === 1 ? 'page' : 'pages'}`;
  }
  const name = detail.fileName ?? `the ${formatLabel(detail.format, DEFAULT_LABELS)}`;
  return detail.size === null ? `Saved ${name}` : `Saved ${name} (${formatBytes(detail.size)})`;
}

/** The log line of a vetoed `before-export`: "Blocked: " and the format's menu label ("Blocked: PNG image"). */
export function describeBlockedExport(format: GanttExportFormat, labels: ExportFormatLabels = DEFAULT_LABELS): string {
  return `Blocked: ${formatLabel(format, labels)}`;
}

/**
 * The line an export case shows when an export method rejects (a full canvas, no browser window):
 * "Failed: " and the error's message.
 */
export function describeFailedExport(error: unknown): string {
  return `Failed: ${error instanceof Error ? error.message : String(error)}`;
}
