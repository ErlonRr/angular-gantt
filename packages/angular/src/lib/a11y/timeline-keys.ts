// ─────────────────────────────────────────────────────────────
//  gantry · a11y/timeline-keys.ts
//
//  Keys on a focused bar (the timeline's roving tab stop, D5 of Gantry 2
//  phase 9), the Web Component's `interaction/timeline-keys.ts`, through
//  core `navigateTimeline` / `panScrollLeft` and the selection rules of
//  the task list:
//
//    ↑/↓, PgUp/PgDn, Home/End (Ctrl too)   focus the bar of the previous / next row, ± one viewport
//                                          page, the first / last row (scrolled into view)
//    ←/→                                   pan the timeline by one bottom-tier header cell
//    Space / Shift+Space / Ctrl+Space      select (toggles with multiple selection) / range / toggle
//    Enter / F2                            move mode on a movable bar (`drag/keyboard-edit.ts`),
//                                          otherwise activate: select only this row + `rowClick`
//
//  A bar beyond the virtual window (PageDown, End) is mounted first: its
//  row is pinned (`focusedRowId`) and the chart focuses it after the
//  next render.
// ─────────────────────────────────────────────────────────────

import { isKeySelectionCommand, navigateTimeline, panScrollLeft, type Command, type MoveCommand } from '@gantryjs/core';

import { type KeyboardEdit } from '../drag/keyboard-edit';
import { moveFocus, pageRows, selectByKey, type GanttKeyContext } from './grid-keys';

/** Pans the timeline one bottom-tier cell earlier (`-1`) or later (`1`), at once. */
function pan(ctx: GanttKeyContext, dir: -1 | 1): void {
  const viewport = ctx.chart.viewport();
  if (!viewport) return;
  const tl = ctx.layout.timeline();
  const width = ctx.layout.viewportWidth() || viewport.clientWidth;
  ctx.scroll.scrollToX(panScrollLeft(tl, viewport.scrollLeft, width, dir), 'instant');
}

/**
 * A key on the focused bar `bar` (a child of `g.gantt-bars-layer`). Returns `true` when the
 * timeline used it (the caller prevents its default action), `false` to let the global shortcuts
 * or the browser have it.
 */
export function handleTimelineKey(
  ctx: GanttKeyContext,
  event: KeyboardEvent,
  bar: Element,
  cmd: Command,
  edit: KeyboardEdit,
): boolean {
  const { layout } = ctx;
  const row = layout.geometryById().get(bar.getAttribute('data-task-id') ?? '')?.row;
  if (!row) return false;

  if (cmd.startsWith('move.')) {
    const rows = layout.visibleRows();
    const next = navigateTimeline({ row: row.visibleIndex, rowCount: rows.length }, cmd as MoveCommand, {
      pageSize: pageRows(layout),
    });
    if (next.action === 'pan') pan(ctx, next.dir);
    else if (next.action === 'move') {
      const id = rows[next.row]?.task.id;
      if (id !== undefined) moveFocus(ctx, bar.parentElement, `bar:${id}`, id);
    }
    return true;
  }
  if (cmd === 'activate' || cmd === 'edit') {
    if (!edit.start(row)) ctx.chart.rowClick(row, event);
    return true;
  }
  if (isKeySelectionCommand(cmd)) {
    selectByKey(ctx, row.task.id, cmd);
    return true;
  }
  return false;
}
