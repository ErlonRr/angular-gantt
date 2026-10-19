// ─────────────────────────────────────────────────────────────
//  gantry · editing/describe.ts
//  A change in words: what the live region says after an edit, and the
//  history's undo / redo labels ("Undone: Design moved 2 days later").
//  Every sentence comes from a label (`announceMoved`,
//  `announceResized`, `announceProgress`, `announceLinkCreated`,
//  `announceLinkDeleted`, `describeEdit`).
// ─────────────────────────────────────────────────────────────

import { announceAmount } from '../interaction/announce';
import type { AnnounceUnit, GanttChange, GanttChangeOp, GanttLabels, TaskDragEvent, TaskResizeEvent } from '../types';

/** Sentences of one change are joined like `announceKeyboardEdit`'s. */
const SENTENCE_SEPARATOR = '. ';

/** The words for a task field or built-in column key (a custom key reads as itself). */
const FIELD_LABELS: Readonly<Record<string, (l: GanttLabels) => string>> = {
  name: l => l.colName,
  start: l => l.colStart,
  end: l => l.colEnd,
  duration: l => l.colDuration,
  // The progress header is "%": read the word
  progress: l => l.ttProgress,
  predecessors: l => l.colPredecessors,
  dependency: l => l.colPredecessors,
  id: l => l.colId,
  type: l => l.colType,
  status: l => l.colStatus,
};

/**
 * The label of a built-in column or task field in `labels` (`start` → `colStart`, `progress` →
 * `ttProgress`, `dependency` / `predecessors` → `colPredecessors`, …); any other key is returned
 * as is. The default column label of `describeChange`.
 */
export function fieldLabel(key: string, labels: GanttLabels): string {
  return FIELD_LABELS[key]?.(labels) ?? key;
}

/** Days when every amount is whole, else hours (as `announceKeyboardEdit` guesses). */
function guessUnit(days: readonly number[]): AnnounceUnit {
  return days.every(d => Math.abs(d - Math.round(d)) < 1e-9) ? 'day' : 'hour';
}

/** A move and a resize of the end of one task, next to each other in either order: read as the net change of each edge. */
function movePair(
  a: GanttChangeOp,
  b: GanttChangeOp | undefined,
): { move: TaskDragEvent; resize: TaskResizeEvent } | null {
  if (!b) return null;
  if (a.op === 'move' && b.op === 'resize' && b.event.edge === 'end' && b.event.taskId === a.event.taskId) {
    return { move: a.event, resize: b.event };
  }
  if (a.op === 'resize' && a.event.edge === 'end' && b.op === 'move' && b.event.taskId === a.event.taskId) {
    return { move: b.event, resize: a.event };
  }
  return null;
}

/** Every date amount the sentences will read (to guess one unit for all). */
function dateAmounts(ops: readonly GanttChangeOp[]): number[] {
  const out: number[] = [];
  for (const op of ops) {
    if (op.op === 'move') out.push(op.event.daysMoved);
    else if (op.op === 'resize') out.push(op.event.daysDelta);
  }
  return out;
}

/**
 * `change` as one sentence: a cell edit (`change.column` set) reads `describeEdit(name, column)`
 * for each edited task; otherwise each op in order (moved, resized, progress, linked, unlinked),
 * joined by ". ". A move next to a resize of the same task's end reads as the net change of each
 * edge ("Design start moved 2 days later. Design end moved 3 days later"), as in
 * `announceKeyboardEdit`. A change with updates but no op (a renamed task) reads
 * `describeEdit(name, field)` per update. Empty change: `''`.
 *
 * @param nameOf A task's display name (link ends use it too)
 * @param unit The scale's snap unit for date amounts (hours on hour scales, `editTiming().snap`);
 * guessed once for the whole sentence when omitted (whole days → days, else hours)
 * @param columnLabel The header of a column key (default `fieldLabel`: the built-in column labels)
 */
export function describeChange(
  change: GanttChange,
  nameOf: (taskId: string) => string,
  labels: GanttLabels,
  unit?: AnnounceUnit,
  columnLabel?: (key: string) => string,
): string {
  const label = columnLabel ?? ((key: string) => fieldLabel(key, labels));

  if (change.column !== undefined) {
    const column = label(change.column);
    const ids = new Set<string>(change.updates.map(u => u.taskId));
    if (ids.size === 0)
      for (const op of change.ops) ids.add(op.op === 'link' || op.op === 'unlink' ? op.event.toId : op.event.taskId);
    return [...ids].map(id => labels.describeEdit(nameOf(id), column)).join(SENTENCE_SEPARATOR);
  }

  if (change.ops.length === 0) {
    return change.updates
      .map(u => {
        const keys = Object.keys(u.after);
        return labels.describeEdit(nameOf(u.taskId), keys.map(label).join(labels.ariaListSeparator));
      })
      .join(SENTENCE_SEPARATOR);
  }

  const u = unit ?? guessUnit(dateAmounts(change.ops));
  const parts: string[] = [];
  const ops = change.ops;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op) continue;
    const pair = movePair(op, ops[i + 1]);
    if (pair) {
      const name = nameOf(pair.move.taskId);
      const start = announceAmount(pair.move.daysMoved, u);
      const end = announceAmount(pair.move.daysMoved + pair.resize.daysDelta, u);
      parts.push(labels.announceResized(name, 'start', start.amount, start.unit));
      if (end.amount !== 0) parts.push(labels.announceResized(name, 'end', end.amount, end.unit));
      i++;
      continue;
    }
    switch (op.op) {
      case 'move': {
        const a = announceAmount(op.event.daysMoved, u);
        parts.push(labels.announceMoved(nameOf(op.event.taskId), a.amount, a.unit));
        break;
      }
      case 'resize': {
        const a = announceAmount(op.event.daysDelta, u);
        parts.push(labels.announceResized(nameOf(op.event.taskId), op.event.edge, a.amount, a.unit));
        break;
      }
      case 'progress':
        parts.push(labels.announceProgress(nameOf(op.event.taskId), Math.round(op.event.newProgress)));
        break;
      case 'link':
        parts.push(labels.announceLinkCreated(nameOf(op.event.fromId), nameOf(op.event.toId)));
        break;
      case 'unlink':
        parts.push(labels.announceLinkDeleted(nameOf(op.event.fromId), nameOf(op.event.toId)));
        break;
    }
  }
  return parts.join(SENTENCE_SEPARATOR);
}
