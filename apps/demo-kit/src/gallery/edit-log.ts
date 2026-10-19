/**
 * The editing cases' change log: one line per accepted change ("Moved Design 2 days later",
 * "Undo: moved Design 2 days earlier", "Linked Research → Build (finish to start)", "Edited Name of
 * Design"), newest first, at most `EDIT_LOG_LIMIT` lines. A page shows it in `ol.gs-case-log`,
 * which is not a live region: the chart announces each change itself.
 */

import type {
  DependencyChangeEvent,
  DependencyType,
  GanttChange,
  GanttChangeOp,
  GanttTask,
  GanttTasksChangeEvent,
} from '@gantryjs/core';

/** The lines a log keeps */
export const EDIT_LOG_LIMIT = 5;

const LINK_TYPES: Readonly<Record<DependencyType, string>> = {
  FS: 'finish to start',
  SS: 'start to start',
  FF: 'finish to finish',
  SF: 'start to finish',
};

/** The task fields and built-in column keys in words (any other key is capitalised: `owner` → "Owner"). */
const FIELDS: Readonly<Record<string, string>> = {
  name: 'Name',
  start: 'Start',
  end: 'End',
  duration: 'Duration',
  progress: 'Progress',
  predecessors: 'Predecessors',
  dependency: 'Predecessors',
};

const fieldName = (key: string): string => FIELDS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** A date shift in days as words: whole days, else hours ("2 days later", "4 hours earlier"). */
function shift(days: number): string {
  const whole = Math.abs(days - Math.round(days)) < 1e-9;
  const amount = whole ? plural(Math.abs(Math.round(days)), 'day') : plural(Math.round(Math.abs(days) * 24), 'hour');
  return `${amount} ${days < 0 ? 'earlier' : 'later'}`;
}

function linkText(event: DependencyChangeEvent, nameOf: (id: string) => string): string {
  const lag = event.lag ? `, ${event.lag > 0 ? '+' : '−'}${plural(Math.abs(event.lag), 'day')}` : '';
  return `${nameOf(event.fromId)} → ${nameOf(event.toId)} (${LINK_TYPES[event.type]}${lag})`;
}

/** One op as a sentence; `next` is read too when it is the end of a two-edge change of the same task. */
function opText(op: GanttChangeOp, next: GanttChangeOp | undefined, nameOf: (id: string) => string): [string, number] {
  switch (op.op) {
    case 'move': {
      const name = nameOf(op.event.taskId);
      // Both edges by different amounts: a move by the start's shift, then a resize of the end
      if (next?.op === 'resize' && next.event.edge === 'end' && next.event.taskId === op.event.taskId) {
        const end = op.event.daysMoved + next.event.daysDelta;
        return [`Moved the start of ${name} ${shift(op.event.daysMoved)} and the end ${shift(end)}`, 2];
      }
      return [`Moved ${name} ${shift(op.event.daysMoved)}`, 1];
    }
    case 'resize':
      return [`Moved the ${op.event.edge} of ${nameOf(op.event.taskId)} ${shift(op.event.daysDelta)}`, 1];
    case 'progress':
      return [`Set the progress of ${nameOf(op.event.taskId)} to ${Math.round(op.event.newProgress)}%`, 1];
    case 'link':
      return [`Linked ${linkText(op.event, nameOf)}`, 1];
    case 'unlink':
      return [`Removed the link ${linkText(op.event, nameOf)}`, 1];
  }
}

/**
 * `change` in words, task names read from `tasks` (else the id). A cell edit reads "Edited <column>
 * of <task>"; otherwise each op in order (moved, resized, progress, linked, unlinked), joined by
 * "; ", and a change without ops (a renamed task) reads "Edited <fields> of <task>". The source is
 * not mentioned: `describeTasksChange` adds "Undo: " / "Redo: ".
 */
export function describeGanttChange(change: GanttChange, tasks: readonly GanttTask[]): string {
  const names = new Map(tasks.map(t => [t.id, t.name]));
  const nameOf = (id: string) => names.get(id) ?? id;

  const column = change.column;
  if (column !== undefined) {
    const ids = new Set(change.updates.map(u => u.taskId));
    return [...ids].map(id => `Edited ${fieldName(column)} of ${nameOf(id)}`).join('; ');
  }
  if (change.ops.length === 0) {
    return change.updates
      .map(u => `Edited ${Object.keys(u.after).map(fieldName).join(', ')} of ${nameOf(u.taskId)}`)
      .join('; ');
  }
  const parts: string[] = [];
  for (let i = 0; i < change.ops.length;) {
    const op = change.ops[i];
    const [text, used] = opText(op, change.ops[i + 1], nameOf);
    parts.push(text);
    i += used;
  }
  return parts.join('; ');
}

/** Each "; "-separated part lowercased at its start ("Set …; Moved …" → "set …; moved …") */
const lowerFirst = (text: string): string =>
  text
    .split('; ')
    .map(part => part.charAt(0).toLowerCase() + part.slice(1))
    .join('; ');

/**
 * The log line of a `tasks-change` detail: the change in words (`describeGanttChange`), after
 * "Undo: " or "Redo: " when the history made it ("Undo: moved Design 2 days earlier": an undo's
 * change is the inverse, as it happened). `tasks` gives the names (usually `detail.tasks`).
 */
export function describeTasksChange(detail: GanttTasksChangeEvent, tasks: readonly GanttTask[]): string {
  const text = describeGanttChange(detail.change, tasks);
  if (!text) return '';
  if (detail.change.source === 'undo') return `Undo: ${lowerFirst(text)}`;
  if (detail.change.source === 'redo') return `Redo: ${lowerFirst(text)}`;
  return text;
}

/** `log` with `line` first, at most `EDIT_LOG_LIMIT` lines (a new array; an empty line is not added). */
export function pushLog(log: readonly string[], line: string): string[] {
  return (line ? [line, ...log] : [...log]).slice(0, EDIT_LOG_LIMIT);
}
