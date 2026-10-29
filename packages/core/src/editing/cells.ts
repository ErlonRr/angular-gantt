// ─────────────────────────────────────────────────────────────
//  gantry · editing/cells.ts
//  Cell editing (D14–D16): which editor a cell gets and how its text
//  becomes task fields, the edit state machine both bindings run, and
//  the keys (APG grid): F2 / Enter edit, a printable key seeds a text or
//  number editor, Enter commits, Tab / Shift+Tab commit and move,
//  Escape cancels.
//
//  Built-in editors (by column key, unless the column brings `parse`):
//  name (text, required), start and end (`date`, or `datetime-local` on
//  hour scales or when the value has a time; start keeps the duration,
//  end ≥ start), duration (text), progress (number 0–100, step = the
//  progress step), predecessors (text, ids or unique names). With a
//  working calendar (Phase 13) a start moves forward and an end back
//  off non-working time, a start keeps the working length, and
//  durations and lags are typed in working units. Other
//  built-ins are read-only. A custom column without `parse` gets a text
//  editor over `exportValue ?? render ?? task[key] ?? task.data[key]`
//  and writes `task[key]` (a `GanttTask` field) or `data[key]`.
// ─────────────────────────────────────────────────────────────

import { followTaskEnd, snapTaskEnd, snapTaskStart } from '../calendar/edit';
import { msOfDay } from '../calendar/time';
import { calendarDays, toLocalDay } from '../gantt-math';
import { DEFAULT_PROGRESS_STEP } from '../interaction/keyboard-edit';
import type { KeyLike } from '../interaction/keymap';
import { taskDependencies, valueToText } from '../render/columns';
import type { ResolvedGanttConfig } from '../render/config';
import { bottomScale } from '../render/scales';
import {
  DependencyType,
  type CellEditorKind,
  type CellEditorOptions,
  type ColumnContext,
  type ColumnDef,
  type GanttDependency,
  type GanttFlatRow,
  type GanttLabels,
  type GanttTask,
} from '../types';
import {
  ParseError,
  endForDuration,
  formatDateInput,
  formatDurationInput,
  formatPredecessors,
  parseDateInput,
  parseDuration,
  parsePredecessors,
  type DateInputKind,
} from './parse';
import { cellEditable, type EditRules } from './permissions';

/** The editor element of a built-in kind: its `type` and attributes (`select`: its options). */
export interface CellEditorInput {
  type: CellEditorKind;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  options?: readonly { value: string; label: string }[] | undefined;
}

/** How a cell is edited: its editor, its first value and its parser / validator. */
export interface ResolvedCellEditor {
  /** A built-in kind, or `'custom'` (the column's `editor` is a framework editor) */
  kind: CellEditorKind | 'custom';
  /** The built-in element to render (ignored for `'custom'`) */
  input: CellEditorInput;
  /** The editor's first value */
  value: string;
  /** The editor's text → the task fields to change; throws `Error(message)` on a bad value */
  parse(value: string): Partial<GanttTask>;
  /** The column's `validate` and the built-in range / order checks: a message, or `null` */
  validate(patch: Partial<GanttTask>): string | null;
}

/** What `resolveCellEditor` reads besides the column and the row. */
export interface ResolveCellEditorContext {
  config: ResolvedGanttConfig;
  ctx: ColumnContext;
  labels: GanttLabels;
  /** The row's edit rules (`editRules`) */
  rules: EditRules;
}

// ─── Helpers ──────────────────────────────────────────────────

const EDITOR_KINDS: ReadonlySet<string> = new Set<CellEditorKind>([
  'text',
  'number',
  'date',
  'datetime-local',
  'select',
]);

/** The fields of `GanttTask`: a custom column keyed by one writes the task, any other key `data`. */
const TASK_FIELDS: ReadonlySet<string> = new Set<keyof GanttTask>([
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
  'style',
  'barColor',
  'rowColor',
  'textColor',
  'progressColor',
  'className',
  'baseline',
  'draggable',
  'editable',
  'status',
  'data',
]);

/** The keys with a built-in editor (`parse` on the column replaces it). */
type BuiltinEditorKey = 'name' | 'start' | 'end' | 'duration' | 'progress' | 'predecessors';
const BUILTIN_EDITORS: ReadonlySet<string> = new Set<BuiltinEditorKey>([
  'name',
  'start',
  'end',
  'duration',
  'progress',
  'predecessors',
]);

/** The column's own editor: a built-in kind, `'custom'` (a framework editor), or `null` (unset). */
function ownKind(col: ColumnDef): CellEditorKind | 'custom' | null {
  const editor: unknown = col.editor;
  if (editor === undefined || editor === null) return null;
  if (typeof editor === 'string') return EDITOR_KINDS.has(editor) ? (editor as CellEditorKind) : 'text';
  return 'custom';
}

const fail = (message: string): never => {
  throw new Error(message);
};

/** The message of anything a parser or validator threw (`ParseError`s become labels). */
function messageOf(error: unknown, labels: GanttLabels): string {
  if (error instanceof ParseError) {
    if (error.code === 'ambiguous') return labels.errorAmbiguousTask(error.ref);
    return error.code === 'unknown' ? labels.errorUnknownTask(error.ref) : labels.errorRejected;
  }
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : labels.errorRejected;
}

/** A number typed in a cell: `45`, `45%`, `-1.5`, `1,5`. Empty → `errorRequired`, else `errorNumber`. */
function readNumber(text: string, labels: GanttLabels): number {
  let t = text.trim().replace(/\s*%$/, '');
  if (!t) return fail(labels.errorRequired);
  if (!t.includes('.')) t = t.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return fail(labels.errorNumber);
  return Number(t);
}

/** A date typed in a cell (`YYYY-MM-DD`, or with a time `YYYY-MM-DDTHH:mm`) shaped like `like`. */
function readDate(text: string, like: Date, labels: GanttLabels): Date {
  const t = text.trim();
  if (!t) return fail(labels.errorRequired);
  const kind: DateInputKind = /[T ]\d{1,2}:\d{2}/.test(t) ? 'datetime-local' : 'date';
  try {
    return parseDateInput(t, kind, like);
  } catch {
    return fail(labels.errorDate);
  }
}

/** The editor kind of a date cell: `datetime-local` on hour scales or when the value has a time. */
function dateKind(date: Date, config: ResolvedGanttConfig): DateInputKind {
  return bottomScale(config.scales).unit === 'hour' || msOfDay(toLocalDay(date)) !== 0 ? 'datetime-local' : 'date';
}

/** The settings of `editorOptions` that are set. */
function ownOptions(options: CellEditorOptions | undefined): Partial<CellEditorInput> {
  const out: Partial<CellEditorInput> = {};
  if (options?.min !== undefined) out.min = options.min;
  if (options?.max !== undefined) out.max = options.max;
  if (options?.step !== undefined) out.step = options.step;
  if (options?.options !== undefined) out.options = options.options;
  return out;
}

/** A dependency field as comparable entries (`'a'` and `[{ taskId: 'a', type: 'FS' }]` are equal). */
const linkList = (dependency: unknown): string =>
  JSON.stringify(
    taskDependencies({ dependency } as GanttTask).map(d => [d.taskId, d.type ?? DependencyType.FS, d.lag ?? 0]),
  );

/** Whether a patched field keeps the task's value: dates by time, links by entries, objects by JSON. */
const sameValue = (field: string, a: unknown, b: unknown): boolean => {
  if (field === 'dependency') return linkList(a) === linkList(b);
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return Object.is(a, b);
};

// ─── Resolving a cell's editor ────────────────────────────────

/** What a kind of cell contributes before the column's `editorOptions` and `validate`. */
interface EditorSpec {
  kind: CellEditorKind | 'custom';
  input: CellEditorInput;
  value: string;
  parse(value: string): Partial<GanttTask>;
  /** The number a `number` editor produced (its `min` / `max` are checked) */
  numberOf?: ((patch: Partial<GanttTask>) => unknown) | undefined;
  /** A check of its own (predecessors: entries repeated in the text) */
  check?: ((patch: Partial<GanttTask>) => string | null) | undefined;
}

/** The built-in editor of `key` (`name`, `start`, `end`, `duration`, `progress`, `predecessors`). */
function builtinSpec(
  key: BuiltinEditorKey,
  own: CellEditorKind | 'custom' | null,
  task: GanttTask,
  context: ResolveCellEditorContext,
): EditorSpec {
  const { config, ctx, labels } = context;
  // The column's kind (default text); for a custom editor, `input` names the built-in element it replaces
  const kind = own ?? 'text';
  const input = (fallback: CellEditorKind): CellEditorInput => ({ type: kind === 'custom' ? fallback : kind });
  switch (key) {
    case 'name':
      return {
        kind,
        input: input('text'),
        value: task.name,
        parse: v => {
          const name = v.trim();
          return name ? { name } : fail(labels.errorRequired);
        },
      };
    case 'start':
    case 'end': {
      const like = key === 'start' ? task.start : (task.end ?? task.start);
      const auto = dateKind(like, config);
      const dateKindOwn = own ?? auto;
      const shown: DateInputKind = dateKindOwn === 'date' || dateKindOwn === 'datetime-local' ? dateKindOwn : auto;
      return {
        kind: dateKindOwn,
        input: { type: dateKindOwn === 'custom' ? shown : dateKindOwn },
        value: formatDateInput(like, shown),
        parse: v => {
          const date = readDate(v, like, labels);
          if (key === 'end') return { end: snapTaskEnd(date, config) };
          const start = snapTaskStart(date, config);
          // A start that snaps back onto the current one changes nothing (the end stays as it is)
          if (config.calendar && start.getTime() === task.start.getTime()) return {};
          return { start, end: followTaskEnd(task, start, config) };
        },
      };
    }
    case 'duration':
      return {
        kind,
        input: input('text'),
        value: formatDurationInput(task, config),
        parse: v => {
          let days: number;
          try {
            days = parseDuration(v, config);
          } catch {
            return fail(labels.errorDuration);
          }
          return days > 0 ? { end: endForDuration(task, days, config) } : fail(labels.errorDuration);
        },
      };
    case 'progress': {
      const step = config.editing.progress ? config.editing.progress.step : DEFAULT_PROGRESS_STEP;
      const progressKind = own ?? 'number';
      return {
        kind: progressKind,
        input: { type: progressKind === 'custom' ? 'number' : progressKind, min: 0, max: 100, step },
        value: String(task.progress ?? 0),
        parse: v => ({ progress: readNumber(v, labels) }),
        numberOf: patch => patch.progress,
      };
    }
    case 'predecessors':
      return {
        kind,
        input: input('text'),
        value: formatPredecessors(task, config),
        parse: v => {
          let deps: GanttDependency[];
          try {
            deps = parsePredecessors(v, {
              tasks: [...ctx.taskById.values()],
              selfId: task.id,
              dates: config,
            });
          } catch (error) {
            // An entry without a task (`+2d`) reads as an unknown task
            if (error instanceof ParseError && error.code === 'syntax') fail(labels.errorUnknownTask(error.ref));
            throw error;
          }
          return { dependency: deps.length ? deps : undefined };
        },
        check: patch => {
          const deps = Array.isArray(patch.dependency) ? patch.dependency : [];
          const seen = new Set<string>();
          for (const d of deps) {
            const k = `${d.taskId}\u0000${d.type ?? DependencyType.FS}`;
            if (seen.has(k)) return labels.errorDuplicateLink;
            seen.add(k);
          }
          return null;
        },
      };
  }
}

/** The editor of a custom column, or of any column with its own `parse`. */
function customSpec(
  col: ColumnDef,
  own: CellEditorKind | 'custom' | null,
  row: GanttFlatRow,
  context: ResolveCellEditorContext,
): EditorSpec {
  const { ctx, labels } = context;
  const { task } = row;
  const key = col.key;
  const onTask = TASK_FIELDS.has(key);
  const fields = task as unknown as Record<string, unknown>;
  const raw = (onTask ? fields[key] : undefined) ?? task.data?.[key];
  const kind = own ?? 'text';
  const dateLike = kind === 'date' || kind === 'datetime-local';

  let value: string;
  if (col.exportValue) value = col.exportValue(row, ctx);
  else if (dateLike && raw instanceof Date) value = formatDateInput(raw, kind);
  else if (col.render) value = col.render(row, ctx);
  else value = raw == null ? '' : valueToText(raw);

  const read = (patch: Partial<GanttTask>): unknown =>
    onTask ? (patch as Record<string, unknown>)[key] : patch.data?.[key];

  const write = (v: unknown): Partial<GanttTask> => {
    if (onTask) return { [key]: v };
    const data: Record<string, unknown> = { ...task.data };
    if (v === undefined) delete data[key];
    else data[key] = v;
    return { data };
  };

  const ownParse = col.parse;
  const parse = ownParse
    ? (v: string) => ownParse(v, row, ctx)
    : (v: string): Partial<GanttTask> => {
        const text = v.trim();
        if (!text) return write(undefined);
        if (kind === 'number') return write(readNumber(text, labels));
        if (dateLike) return write(readDate(text, raw instanceof Date ? raw : new Date(2000, 0, 1), labels));
        return write(text);
      };

  return { kind, input: { type: kind === 'custom' ? 'text' : kind }, value, parse, numberOf: read };
}

/**
 * Field checks every cell edit gets, whatever the column: a progress from 0 to 100, valid dates,
 * and an end not before the start (compared as local calendar days, so an inclusive end on its
 * start day is fine).
 */
function fieldCheck(
  patch: Partial<GanttTask>,
  task: GanttTask,
  config: ResolvedGanttConfig,
  labels: GanttLabels,
): string | null {
  if (typeof patch.progress === 'number' && !(patch.progress >= 0 && patch.progress <= 100)) {
    return labels.errorRange(0, 100);
  }
  if ('start' in patch || 'end' in patch) {
    const start = patch.start ?? task.start;
    const end = patch.end ?? task.end ?? start;
    if (!(start instanceof Date) || !(end instanceof Date)) return labels.errorDate;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return labels.errorDate;
    if (calendarDays(end, config.normalizeDateOnly) < calendarDays(start, config.normalizeDateOnly)) {
      return labels.errorEndBeforeStart;
    }
  }
  return null;
}

/**
 * The editor of `col`'s cell on `row`, or `null` when the cell can't be edited (`cellEditable`).
 *
 * - **Built-in editors** (a column keyed `name`, `start`, `end`, `duration`, `progress` or
 *   `predecessors` without its own `parse`, whatever renders it):
 *   - `name`: text, trimmed, required;
 *   - `start` / `end`: `date`, or `datetime-local` on hour scales or when the value has a time
 *     (`formatDateInput`). The value is the stored date (an inclusive end shows its last day, as
 *     the cell does). A new start keeps the duration (the end moves with it); an end must not be
 *     before the start. Date-only values stay date-only (`parseDateInput`). With a working
 *     calendar (`skipNonWorking`) a start on non-working time moves forward to the next working
 *     time and an end back to the end of the last working time; with working durations a new
 *     start keeps the working length (the bar widens over the days off). A date that snaps back
 *     onto the current one commits nothing;
 *   - `duration`: text (`5`, `5d`, `2w`, `4h`, `1.5d`) as drawn; it sets the end
 *     (`endForDuration`) and must be more than 0. With working durations it is measured days
 *     (`w` = the working week, `h` an hour of the working day) counted in working time;
 *   - `progress`: number 0–100 (`45` or `45%`), step = `editing.progress.step`;
 *   - `predecessors`: text by id (`formatPredecessors`), read by `parsePredecessors` (ids, else
 *     unique names; lags in the units of the chart's durations); an empty text removes every link
 *     (`dependency: undefined`).
 * - **Custom columns** (and any column with `parse`): `editor` (default `'text'`) over
 *   `exportValue`, else (date editors) the date field, else `render`, else `task[key]` /
 *   `task.data[key]`. Without `parse`, the trimmed text (a number for `'number'`, a date for the
 *   date kinds; empty text clears the field) goes to `task[key]` when `key` is a `GanttTask`
 *   field, else to `data[key]` (a new `data` object).
 *
 * `editor` set to a built-in kind picks the element (a date column keeps its date format unless
 * it is `date` / `datetime-local`); anything else (a function, an Angular template) is `'custom'`
 * and the binding mounts it over the same value and parser. `editorOptions` overrides the
 * element's `min` / `max` / `step` / `options`.
 *
 * `parse` throws `Error(message)` with a label (`errorRequired`, `errorNumber`, `errorDate`,
 * `errorDuration`, `errorUnknownTask`, `errorAmbiguousTask`) or the column parser's message.
 * `validate` checks, in order: a `number` editor's `min` / `max` (`errorRange`), a progress from 0
 * to 100, valid dates and the end not before the start (`errorEndBeforeStart`), repeated
 * predecessors (`errorDuplicateLink`), then the column's `validate`. Links that are self links,
 * loops or parent ↔ child are rejected by the change pipeline (`prepareChange`).
 */
export function resolveCellEditor(
  col: ColumnDef,
  row: GanttFlatRow,
  context: ResolveCellEditorContext,
): ResolvedCellEditor | null {
  const { config, ctx, labels, rules } = context;
  if (!cellEditable(col, row, rules, config)) return null;
  const own = ownKind(col);
  const spec =
    !col.parse && BUILTIN_EDITORS.has(col.key)
      ? builtinSpec(col.key as BuiltinEditorKey, own, row.task, context)
      : customSpec(col, own, row, context);
  const input: CellEditorInput = { ...spec.input, ...ownOptions(col.editorOptions) };

  const validate = (patch: Partial<GanttTask>): string | null => {
    try {
      const n = spec.kind === 'number' ? spec.numberOf?.(patch) : undefined;
      if (typeof n === 'number' && (input.min !== undefined || input.max !== undefined)) {
        const min = input.min ?? -Infinity;
        const max = input.max ?? Infinity;
        if (!(n >= min && n <= max)) return labels.errorRange(min, max);
      }
      const message =
        fieldCheck(patch, row.task, config, labels) ?? spec.check?.(patch) ?? col.validate?.(patch, row, ctx);
      return message || null;
    } catch (error) {
      return messageOf(error, labels);
    }
  };

  return {
    kind: spec.kind,
    input,
    value: spec.value,
    parse: value => {
      try {
        return spec.parse(value);
      } catch (error) {
        throw new Error(messageOf(error, labels), { cause: error });
      }
    },
    validate,
  };
}

/**
 * Parses and validates `value`: the fields to change (`taskChange` with source `'cell'`), or the
 * error to show (`aria-invalid`, the alert region).
 *
 * The text the editor started with gives `{ patch: {} }` (nothing to commit: close the editor),
 * and so do fields equal to the task's current values (`ctx.taskById`, else `row.task`; dates by
 * time), which are left out of the patch. A field the patch removes is kept as `undefined`.
 */
export function commitCellValue(
  editor: ResolvedCellEditor,
  value: string,
  row: GanttFlatRow,
  ctx: ColumnContext,
): { patch: Partial<GanttTask> } | { error: string } {
  if (value === editor.value) return { patch: {} };
  let patch: Partial<GanttTask>;
  try {
    patch = editor.parse(value);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const error = editor.validate(patch);
  if (error) return { error };
  const current = (ctx.taskById.get(row.task.id) ?? row.task) as unknown as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  for (const [field, v] of Object.entries(patch)) if (!sameValue(field, v, current[field])) changed[field] = v;
  return { patch: changed };
}

// ─── The edit state machine ───────────────────────────────────

/** The cell being edited (`null`: none): its text, the first value and the error shown (`aria-invalid`). */
export type CellEditState = {
  taskId: string;
  columnKey: string;
  value: string;
  initial: string;
  error: string | null;
} | null;

/** An event of the cell edit machine. */
export type CellEditEvent =
  /** Edit a cell, from `value`; `seed` (a typed character) replaces it */
  | { type: 'start'; taskId: string; columnKey: string; value: string; seed?: string | undefined }
  /** The editor's text changed (clears the error) */
  | { type: 'input'; value: string }
  /** A commit failed: the editor stays open with the message */
  | { type: 'invalid'; error: string }
  /** Committed or cancelled: no cell is edited */
  | { type: 'done' };

/**
 * The cell edit state after `event`: `start` opens a cell (`initial` = `value`, the text = the
 * seed when typed, no error); `input` sets the text and clears the error; `invalid` keeps the
 * editor open with the message; `done` closes it. `input` / `invalid` without an open cell change
 * nothing, and an event that changes nothing returns the same state object.
 */
export function reduceCellEdit(state: CellEditState, event: CellEditEvent): CellEditState {
  switch (event.type) {
    case 'start':
      return {
        taskId: event.taskId,
        columnKey: event.columnKey,
        value: event.seed ?? event.value,
        initial: event.value,
        error: null,
      };
    case 'input':
      if (!state || (state.value === event.value && state.error === null)) return state;
      return { ...state, value: event.value, error: null };
    case 'invalid':
      if (!state || state.error === event.error) return state;
      return { ...state, error: event.error };
    case 'done':
      return null;
  }
}

// ─── Keys ─────────────────────────────────────────────────────

/** What a key does to a cell (`cellEditKey`). */
export type CellEditKey = 'start' | 'seed' | 'commit' | 'commit-next' | 'commit-prev' | 'cancel';

/** What `cellEditKey` reads besides the key. */
export interface CellEditKeyOptions {
  /** An editor is open on the cell */
  editing: boolean;
  /** The cell's editor kind (only text and number editors are seeded by a printable key) */
  kind: CellEditorKind | 'custom';
}

/**
 * A key on an editable cell: not editing, F2 / Enter → `'start'`, a printable key → `'seed'` (text
 * and number editors); editing, Enter → `'commit'`, Tab / Shift+Tab → `'commit-next'` /
 * `'commit-prev'`, Escape → `'cancel'`. `null`: the key is not the cell's (Alt and Ctrl/⌘
 * combinations included).
 *
 * Seeds: any single printable character but Space (it selects the row) for text editors, digits
 * for number editors. A seed wins over the single-character shortcuts (`+`, `-`, `T`, `F`, `L`)
 * on that cell. Shift is allowed with Enter and printable keys; Escape cancels with any modifier.
 * Bindings skip keys typed during an IME composition (`isComposing`).
 */
export function cellEditKey(event: KeyLike, options: CellEditKeyOptions): CellEditKey | null {
  const { key } = event;
  if (options.editing && key === 'Escape') return 'cancel';
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (options.editing) {
    if (key === 'Enter') return 'commit';
    if (key === 'Tab') return event.shiftKey ? 'commit-prev' : 'commit-next';
    return null;
  }
  if (key === 'F2') return event.shiftKey ? null : 'start';
  if (key === 'Enter') return event.shiftKey ? null : 'start';
  if ([...key].length !== 1 || key === ' ') return null;
  if (options.kind === 'text') return 'seed';
  if (options.kind === 'number') return /^\d$/.test(key) ? 'seed' : null;
  return null;
}
