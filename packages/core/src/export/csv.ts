// ─────────────────────────────────────────────────────────────
//  gantry · export/csv.ts
//  The CSV table (Phase 12, D13 / D14): the chosen columns over every
//  loaded task (or the shown rows), as data values or as the cells
//  show them (`exportValue` wins in both), RFC 4180 quoting with CRLF
//  line endings, and formula neutralisation against CSV injection
//  (a leading `'` on cells starting with = + - @ tab or CR that are not
//  plain numbers, header cells included). The byte order mark belongs
//  to files only (`exportFileText`).
// ─────────────────────────────────────────────────────────────

import {
  TaskType,
  type BuiltinColumnKey,
  type ColumnContext,
  type ColumnDef,
  type GanttCsvExportOptions,
  type GanttFlatRow,
  type GanttTask,
} from '../types';
import { toLocalDay } from '../gantt-math';
import { measureVariance, measuresWorkingTime, taskDuration } from '../calendar/durations';
import { computeCellVisual, findColumn, taskStatus, valueToText } from '../render/columns';
import { formatDurationInput, formatPredecessors, parseDuration } from '../editing/parse';
import { DEFAULT_ASSIGNMENT_UNITS, taskAssignments, type ResourceIndex } from '../resources/model';
import { resourceInfoOf } from '../resources/rows';
import { resolveExportCall } from './files';
import type { ChartExportSource } from './source';

/** The line ending between records (RFC 4180). */
const CRLF = '\r\n';

/**
 * A chart snapshot as CSV text (`exportCsv()`): `options` over the chart's `export.csv`
 * (`resolveExportCall`), a header line of column labels (`header`), one line per row, `\r\n`
 * between lines (none after the last), no byte order mark; `''` without columns. Pure and DOM-free.
 */
export function exportChartCsv(source: ChartExportSource, options?: GanttCsvExportOptions): string {
  const o = resolveExportCall(source.config, 'csv', options);
  const delimiter = o.delimiter === ';' || o.delimiter === '\t' ? o.delimiter : ',';
  const values = o.values === 'display' ? 'display' : 'data';
  const columns = csvColumns(source, o.columns);
  if (!columns.length) return '';
  const rows = o.rows === 'shown' ? source.rows : source.allRows;
  const line = (cells: readonly string[]): string =>
    // A lone empty field is quoted, so its record is not a blank line
    cells.length === 1 && cells[0] === ''
      ? '""'
      : cells.map(c => csvField(c, delimiter, o.neutralizeFormulas)).join(delimiter);
  const lines: string[] = [];
  if (o.header) lines.push(line(columns.map(c => textOf(c.label))));
  for (const row of rows) lines.push(line(columns.map(c => csvCellValue(c, row, source.columnCtx, values))));
  return lines.join(CRLF);
}

/**
 * The task fields a key of `columns` exports when no column has that key (`RAW_TASK_FIELDS`): the
 * field as stored, so a CSV can carry the tree (`parentId`) and the links (`dependency`). Objects
 * (`baseline`, `style`, `data`) are not fields here.
 */
const RAW_TASK_FIELDS: ReadonlySet<string> = new Set<keyof GanttTask>([
  'id',
  'name',
  'start',
  'end',
  'progress',
  'type',
  'parentId',
  'collapsed',
  'dependency',
  'barType',
  'status',
  'barColor',
  'rowColor',
  'textColor',
  'progressColor',
  'className',
  'draggable',
  'editable',
]);

/**
 * A raw task field as a CSV column (`columns: ['parentId', …]`): the key as its header, the field
 * as stored in both `values` modes — a date as local ISO, a number or a boolean as is, `dependency`
 * as predecessor ids (`a FS+2d; b SS`, what the Predecessors cell reads back: lags in working days
 * or hours with a working calendar), unset `''`.
 */
function rawFieldColumn(key: string): ColumnDef {
  return {
    key,
    label: key,
    width: 0,
    exportValue: ({ task }, ctx) =>
      key === 'dependency'
        ? formatPredecessors(task, ctx)
        : dataText((task as unknown as Record<string, unknown>)[key]),
  };
}

/**
 * The columns of a CSV: `'visible'` = the view shown (the table view's, else the split panel's,
 * the chart view included); `'all'` = the catalogue; keys = those columns of the catalogue (then of
 * the views), else a raw task field (`RAW_TASK_FIELDS`), in order, each once, unknown keys left out.
 */
function csvColumns(source: ChartExportSource, columns: GanttCsvExportOptions['columns']): readonly ColumnDef[] {
  const { split, table, all } = source.columns;
  if (columns === 'all') return all.filter(c => !(c.builtin && resourceColumnUnused(c.key, source)));
  if (!Array.isArray(columns)) return source.view === 'table' ? table : split;
  const out: ColumnDef[] = [];
  const seen = new Set<string>();
  for (const key of columns as readonly string[]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const col = findColumn(all, [...split, ...table], key) ?? (RAW_TASK_FIELDS.has(key) ? rawFieldColumn(key) : null);
    if (col) out.push(col);
  }
  return out;
}

/**
 * A resource-view built-in column the chart has no use for, left out of `columns: 'all'` so a chart
 * without resources exports as before (Phase 14 D18): `capacity` and `load` outside the resource view,
 * `resources` inside it (its rows are resources) and in a chart without any resource. Asked for by key,
 * they are always there.
 */
function resourceColumnUnused(key: string, source: ChartExportSource): boolean {
  const resourceView = source.config.rows === 'resources';
  if (key === 'capacity' || key === 'load') return !resourceView;
  return key === 'resources' && (resourceView || !source.columnCtx.resources?.list.length);
}

/**
 * One CSV field: neutralized (`neutralize`, `neutralizeFormula`), then quoted when it holds the
 * delimiter, `"`, CR or LF (`"` doubled).
 */
export function csvField(text: string, delimiter: ',' | ';' | '\t', neutralize: boolean): string {
  const t = neutralize ? neutralizeFormula(text) : text;
  return t.includes(delimiter) || /["\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** The first characters that make a spreadsheet read a cell as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** `text` with a leading `'` when it starts with `=`, `+`, `-`, `@`, tab or CR and is not a plain number. */
export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) && !isPlainNumber(text) ? `'${text}` : text;
}

const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** `text` is a plain number (`-3`, `+2.5`, `.5`, `1e3`): kept as is by the neutralisation. */
export function isPlainNumber(text: string): boolean {
  return PLAIN_NUMBER.test(text);
}

/**
 * `col`'s value for `row` as text, per `values` (plan §3a table); `exportValue` wins in both.
 * - `'display'`: the cell's text (`computeCellVisual`).
 * - `'data'`, a built-in column: `id` / `name` as is; dates as local ISO (`YYYY-MM-DD` at
 *   midnight, else `YYYY-MM-DDTHH:mm`, `:ss` when not zero) of the date the cell shows;
 *   `duration` the days of the drawn span and `variance` the signed days (numbers, `.` decimal,
 *   at most 2 decimals; working days with a working calendar); `progress` the number; `predecessors` by id (`a FS+2d; b SS`); `status`
 *   and `type` their keys; the resource view's `capacity` and `load` (peak) as percent numbers on a
 *   resource row, `resources` the assignments by id (`ana, bo 50%`) on a task row.
 * - `'data'`, another column: its `render` text, else the task's field (`task[key]`, else
 *   `task.data[key]`): a date as local ISO, a number as is, an object as JSON.
 */
export function csvCellValue(
  col: ColumnDef,
  row: GanttFlatRow,
  ctx: ColumnContext,
  values: 'data' | 'display',
): string {
  if (col.exportValue) return textOf(col.exportValue(row, ctx));
  if (values === 'display') return computeCellVisual(col, row, ctx).text;
  if (col.builtin && isBuiltinKey(col.key)) return builtinData(col.key, row, ctx);
  if (col.render) return textOf(col.render(row, ctx));
  const { task } = row;
  const raw = (task as unknown as Record<string, unknown>)[col.key] ?? task.data?.[col.key];
  return dataText(raw);
}

const BUILTIN_KEYS: ReadonlySet<string> = new Set<BuiltinColumnKey>([
  'id',
  'name',
  'type',
  'status',
  'start',
  'end',
  'duration',
  'progress',
  'predecessors',
  'baselineStart',
  'baselineEnd',
  'variance',
  'resources',
  'capacity',
  'load',
]);

const isBuiltinKey = (key: string): key is BuiltinColumnKey => BUILTIN_KEYS.has(key);

/** A built-in column's data value (`values: 'data'`). */
function builtinData(key: BuiltinColumnKey, row: GanttFlatRow, ctx: ColumnContext): string {
  const { task } = row;
  switch (key) {
    case 'id':
      return textOf(task.id);
    case 'name':
      return textOf(task.name);
    case 'type':
      return task.type ?? (row.hasChildren ? TaskType.Group : row.barType);
    case 'status':
      return taskStatus(task, ctx.now, ctx);
    case 'start':
      return localIso(task.start);
    case 'end':
      return localIso(task.end ?? task.start);
    case 'duration':
      return durationDays(row, ctx);
    case 'progress':
      return numberText(task.progress ?? 0);
    case 'predecessors':
      return formatPredecessors(task, ctx);
    case 'baselineStart':
      return task.baseline ? localIso(task.baseline.start) : '';
    case 'baselineEnd':
      return task.baseline ? localIso(task.baseline.end) : '';
    case 'variance': {
      // As the Variance column: the drawn end against the baseline's, in measured days
      const days = measureVariance(task, ctx);
      return days === null ? '' : numberText(days);
    }
    // The resource view's columns (Phase 14 D13): numbers on a resource row, the assignments on a task
    case 'capacity': {
      const capacity = resourceInfoOf(task)?.capacity;
      return capacity == null ? '' : numberText(capacity);
    }
    case 'load': {
      const info = resourceInfoOf(task);
      return info ? numberText(info.peak) : '';
    }
    case 'resources':
      return assignmentIds(task, ctx.resources);
  }
}

/**
 * A task's assignments by resource id (`ana, bo 50%`: units are left out at 100), what the Resources cell
 * reads back; `''` for a resource row, an unassigned task or a chart without resources.
 */
function assignmentIds(task: GanttTask, index: ResourceIndex | undefined): string {
  if (!index || resourceInfoOf(task)) return '';
  return taskAssignments(task, index)
    .map(a => (a.units === DEFAULT_ASSIGNMENT_UNITS ? a.resourceId : `${a.resourceId} ${numberText(a.units)}%`))
    .join(', ');
}

/**
 * The days of a row's drawn span as a number: working days with working durations, else as the
 * built-in duration editor reads them (whole local calendar days, then the real time left, to the
 * minute); `''` when the dates are not valid.
 */
function durationDays(row: GanttFlatRow, ctx: ColumnContext): string {
  try {
    if (measuresWorkingTime(ctx)) return numberText(taskDuration(row.task, ctx));
    return numberText(parseDuration(formatDurationInput(row.task, ctx)));
  } catch {
    return '';
  }
}

/** A value of any type as cell text (`null` / `undefined` → `''`). */
const textOf = (v: unknown): string => (v == null ? '' : valueToText(v));

/** A field's data text: a date as local ISO, a finite number as is (`''` when not finite), others as cell text. */
function dataText(v: unknown): string {
  if (v instanceof Date) return localIso(v);
  if (typeof v === 'number') return numberText(v, false);
  return textOf(v);
}

/** A number with `.` as decimal separator, rounded to 2 decimals (`round`), no `-0`; `''` when not finite. */
function numberText(n: number, round = true): string {
  if (!Number.isFinite(n)) return '';
  return String((round ? Math.round(n * 100) / 100 : n) || 0);
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/**
 * A date as local ISO text, read as the cells read it (`toLocalDay`: a UTC date-only value is its
 * own day): `YYYY-MM-DD` at local midnight, else `YYYY-MM-DDTHH:mm`, with `:ss` when the seconds
 * are not zero (milliseconds dropped). `''` for an invalid date.
 */
function localIso(date: Date | undefined): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const d = toLocalDay(date);
  const day = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const h = d.getHours(),
    m = d.getMinutes(),
    s = d.getSeconds();
  if (h === 0 && m === 0 && s === 0 && d.getMilliseconds() === 0) return day;
  return `${day}T${pad(h)}:${pad(m)}${s ? `:${pad(s)}` : ''}`;
}
