/**
 * Case `export-csv`: the tasks as a CSV table, previewed on the page (`exportCsv(options)`) and
 * downloaded (`download('csv', options)`): the columns shown or all of them (`columns`), as data
 * (ISO dates, numbers, keys) or as the cells show them (`values`), with a byte order mark for
 * Excel (`bom`, files only). Four task names start like spreadsheet formulas: the export prefixes
 * them with an apostrophe (`neutralizeFormulas`, on by default).
 */

import { TaskType, type GanttCsvExportOptions, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { dayAt } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const EXPORT_CSV_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  panel: { columns: ['name', 'start', 'end', 'progress'] },
  export: { fileName: 'budget-plan' },
  labels: { ariaChart: 'Budget plan' },
};

export type CsvColumns = 'visible' | 'all';
export type CsvValues = 'data' | 'display';

export const CSV_COLUMNS: readonly GalleryChoice<CsvColumns>[] = [
  { value: 'visible', label: 'Shown' },
  { value: 'all', label: 'All' },
];

export const CSV_VALUES: readonly GalleryChoice<CsvValues>[] = [
  { value: 'data', label: 'Data' },
  { value: 'display', label: 'As shown' },
];

/** The controls' state: the columns, the values and the byte order mark */
export interface ExportCsvState {
  readonly columns: CsvColumns;
  readonly values: CsvValues;
  readonly bom: boolean;
}

/** The controls' first values */
export const EXPORT_CSV_INITIAL: ExportCsvState = { columns: 'visible', values: 'data', bom: true };

/** The options of `exportCsv()` and of `download('csv')` for the controls' state (`bom` changes files only). */
export function csvExportOptions(state: ExportCsvState): GanttCsvExportOptions {
  return { columns: state.columns, values: state.values, bom: state.bom };
}

export const EXPORT_CSV_HINT =
  'Names that start with = + - or @ get a leading apostrophe, so a spreadsheet shows them as text.';

/**
 * Six budget steps in a row, four of them named like formulas (`=HYPERLINK(…)`, `+…`, `-…`, `@…`).
 * Ids: `kickoff`, `approve`, `review`, `scope`, `vendor`, `launch` (a milestone).
 */
export function exportCsvTasks(now: Date = new Date()): GanttTask[] {
  const d = (offset: number) => dayAt(now, offset);
  return [
    { id: 'kickoff', name: 'Kick-off', start: d(-12), end: d(-10), progress: 100 },
    {
      id: 'approve',
      name: '=HYPERLINK("https://example.com","Approve")',
      start: d(-9),
      end: d(-4),
      progress: 100,
      dependency: 'kickoff',
    },
    { id: 'review', name: '+Budget review', start: d(-3), end: d(5), progress: 40, dependency: 'approve' },
    { id: 'scope', name: '-Scope cut', start: d(3), end: d(9), progress: 0, dependency: 'review' },
    { id: 'vendor', name: '@Vendor sync', start: d(6), end: d(13), progress: 0, dependency: 'review' },
    {
      id: 'launch',
      name: 'Launch',
      type: TaskType.Milestone,
      start: d(15),
      end: d(15),
      progress: 0,
      dependency: [{ taskId: 'scope' }, { taskId: 'vendor' }],
    },
  ];
}

/**
 * The first `limit` records of a CSV text, one line each, for a preview: line breaks inside a
 * quoted field show as `↵`, a byte order mark is dropped, and `… n more rows` ends a preview that
 * leaves records out. The page shows them in `pre.gs-case-csv`, joined with line breaks.
 */
export function csvPreviewLines(csv: string, limit = 6): string[] {
  const records: string[] = [];
  let record = '';
  let quoted = false;
  const text = csv.startsWith('﻿') ? csv.slice(1) : csv;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    if (c === '\r' || c === '\n') {
      // CRLF counts once
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (quoted) record += '↵';
      else {
        records.push(record);
        record = '';
      }
      continue;
    }
    record += c;
  }
  // No record after a final line break (an export never writes an empty record: it quotes `""`)
  if (record !== '') records.push(record);
  const max = Math.max(0, Math.floor(limit));
  if (records.length <= max) return records;
  const more = records.length - max;
  return [...records.slice(0, max), `… ${more} more ${more === 1 ? 'row' : 'rows'}`];
}

export const exportCsvCase: GalleryCaseData = {
  charts: now => [{ tasks: exportCsvTasks(now), options: EXPORT_CSV_OPTIONS }],
};
