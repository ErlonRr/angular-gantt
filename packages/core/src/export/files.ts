// ─────────────────────────────────────────────────────────────
//  gantry · export/files.ts
//  What the bindings' export runs share (Phase 12, D8 / D15, plan §3c):
//  a call's options over the chart's `export` defaults, safe file names
//  with their extension, MIME types, the file text (the SVG's XML
//  declaration, the CSV's byte order mark), the `before-export` detail
//  and the download URL lifetime.
// ─────────────────────────────────────────────────────────────

import type { GanttBeforeExportEvent, GanttExportFormat, GanttExportOptions, GanttExportTrigger } from '../types';
import {
  DEFAULT_EXPORT_FILE_NAME,
  resolveExportFormat,
  type ResolvedExport,
  type ResolvedGanttConfig,
  type ResolvedImageExport,
} from '../render/config';

/** The MIME type of each file format (the `Blob` type of a download). */
export const EXPORT_MIME = Object.freeze({
  svg: 'image/svg+xml;charset=utf-8',
  png: 'image/png',
  csv: 'text/csv;charset=utf-8',
} as const);

/** A download's object URL is revoked this long after its click (ms). */
export const DOWNLOAD_REVOKE_MS = 30_000;

/** Longest file name `sanitizeFileName` keeps, in characters (code points), before the extension. */
const MAX_FILE_NAME = 120;

/** Characters no OS takes in a file name (Windows' list; `/` everywhere). */
const RESERVED_CHARS = new Set('/\\:*?"<>|');

/**
 * Code points a file name drops: C0 and C1 controls, DEL, lone surrogates, the byte order mark and
 * the bidirectional controls (they can disguise an extension: `gantt\u202Egvs.exe`).
 */
const isUnsafeCodePoint = (cp: number): boolean =>
  cp < 0x20 ||
  (cp >= 0x7f && cp <= 0x9f) ||
  (cp >= 0xd800 && cp <= 0xdfff) ||
  cp === 0xfeff ||
  cp === 0x200e ||
  cp === 0x200f ||
  (cp >= 0x202a && cp <= 0x202e) ||
  (cp >= 0x2066 && cp <= 0x2069);

/** Windows device names, which no file may be called (with any extension). */
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Dots and white space at the start or end (hidden files, names Windows trims). */
const EDGE_DOTS_SPACES = /^[\s.]+|[\s.]+$/g;

/**
 * `name` safe as a file name on every OS: `/ \ : * ? " < > |`, control characters (C0, C1, DEL),
 * lone surrogates and bidirectional controls removed, dots and spaces at either end removed, at
 * most 120 characters, a Windows device name (`CON`, `nul.csv`…) prefixed with `_`; `'gantt'`
 * when nothing is left (a value that is not a string included).
 */
export function sanitizeFileName(name: string): string {
  let out = '';
  for (const ch of typeof name === 'string' ? name : '') {
    if (!RESERVED_CHARS.has(ch) && !isUnsafeCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  }
  out = out.replace(EDGE_DOTS_SPACES, '');
  const chars = Array.from(out);
  if (chars.length > MAX_FILE_NAME) out = chars.slice(0, MAX_FILE_NAME).join('').replace(EDGE_DOTS_SPACES, '');
  if (!out) return DEFAULT_EXPORT_FILE_NAME;
  return WINDOWS_DEVICE.test(out.split('.')[0] ?? '') ? `_${out}` : out;
}

/**
 * The file name of a download: `call` (a call's `fileName`, unless empty or blank), else
 * `exp.fileName(format)`, sanitized (`sanitizeFileName`), with `.svg` / `.png` / `.csv` added
 * when it doesn't end with it already (in any case: `Plan.CSV` stays).
 */
export function exportFileName(
  exp: Pick<ResolvedExport, 'fileName'>,
  format: 'svg' | 'png' | 'csv',
  call?: string,
): string {
  const name = sanitizeFileName(typeof call === 'string' && call.trim() ? call : exp.fileName(format));
  const ext = `.${format}`;
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}

/**
 * A range an image export can draw: `'visible'`, valid dates (swapped when `end` comes first), else
 * `'all'` (unset, unknown, or dates that are not valid `Date`s).
 */
function rangeOf(range: ResolvedImageExport['range']): NonNullable<ResolvedImageExport['range']> {
  if (range === 'visible') return range;
  if (typeof range === 'object' && range !== null) {
    const { start, end } = range as { start: unknown; end: unknown };
    if (start instanceof Date && end instanceof Date && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return start.getTime() <= end.getTime() ? range : { start: end, end: start };
    }
  }
  return 'all';
}

/**
 * A call's options over the chart's `export.<format>` (`resolveExportFormat` with
 * `cfg.export[format]` as the base). Image formats then get a `range` (`'all'` when unset or
 * invalid; dates in order) and `today` (`cfg.showToday` when unset); `legend`, `title` and
 * `description` stay `undefined` for `buildExportModel`, which fills them from the chart.
 */
export function resolveExportCall<F extends GanttExportFormat>(
  cfg: Pick<ResolvedGanttConfig, 'export' | 'showToday'>,
  format: F,
  call?: GanttExportOptions[F],
): ResolvedExport[F] {
  const out = resolveExportFormat(format, call, cfg.export[format]);
  if (format === 'csv') return out;
  const image = out as ResolvedImageExport;
  const range = rangeOf(image.range);
  const today = typeof image.today === 'boolean' ? image.today : cfg.showToday;
  if (range === image.range && today === image.today) return out;
  return { ...image, range, today } as ResolvedExport[F];
}

/**
 * The `before-export` detail (frozen): `defaultPrevented` reads live, `preventDefault()` sets it
 * (the bindings check it after emitting).
 */
export function createBeforeExportDetail(
  format: GanttExportFormat,
  trigger: GanttExportTrigger,
  fileName: string | null,
): GanttBeforeExportEvent {
  let prevented = false;
  return Object.freeze({
    format,
    trigger,
    fileName,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  });
}

/** The XML declaration that starts a downloaded SVG file. */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** The UTF-8 byte order mark (so Excel reads a CSV file as UTF-8). */
const BOM = '\uFEFF';

/**
 * The text of a downloaded file: an SVG gets the XML declaration, a CSV the byte order mark when
 * `bom` (default false: pass the resolved `csv.bom`); neither is added twice. `exportSvg()` /
 * `exportCsv()` return the text without them.
 */
export function exportFileText(
  format: 'svg' | 'csv',
  text: string,
  opts: { readonly bom?: boolean | undefined } = {},
): string {
  if (format === 'svg') return text.startsWith('<?xml') ? text : XML_DECLARATION + text;
  return opts.bom === true && !text.startsWith(BOM) ? BOM + text : text;
}
