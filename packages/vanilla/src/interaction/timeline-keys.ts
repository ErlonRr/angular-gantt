/**
 * @file timeline-keys.ts
 * Keys on a focused bar (the timeline's roving tab stop, D5 of Gantry 2 phase 9), through core
 * `navigateTimeline` / `panScrollLeft` and the selection rules of the task list:
 *
 *   ↑/↓, PgUp/PgDn, Home/End (Ctrl too)   focus the bar of the previous / next row, ± one viewport
 *                                         page, the first / last row (scrolled into view)
 *   ←/→                                   pan the timeline by one bottom-tier header cell
 *   Space / Shift+Space / Ctrl+Space      select (toggles with multiple selection) / range / toggle
 *   Enter / F2                            move mode on a movable bar (`keyboard-edit.ts`), otherwise
 *                                         activate: select only this row + `row-click`
 *
 * A bar beyond the virtual window (PageDown, End) is mounted first: its row is pinned
 * (`focusedRowId`) and the focus-restore region focuses it after the flush.
 */

import { isKeySelectionCommand, navigateTimeline, panScrollLeft, type Command, type MoveCommand } from '@gantryjs/core';
import type { LayerContext } from '../layers/context';
import { moveFocus, pageRows, selectByKey } from './grid-keys';
import type { KeyboardEdit } from './keyboard-edit';
import { scrollToX } from './scroll';

/** Pans the timeline one bottom-tier cell earlier (`-1`) or later (`1`). Handlers may read the scroll offset. */
function pan(ctx: LayerContext, dir: -1 | 1): void {
  const { inputs: I, graph: G, dom } = ctx;
  const tl = G.timeline.peek();
  const width = I.canvasW.peek() || dom.viewport.clientWidth;
  const left = panScrollLeft(tl, dom.viewport.scrollLeft, width, dir);
  scrollToX(dom.viewport, left, 'instant', { inputs: I, maxLeft: tl.totalWidth - width });
}

/**
 * A key on the focused bar `bar` (a child of `g.gantt-bars-layer`). Returns `true` when the
 * timeline used it (the caller prevents its default action), `false` to let the global shortcuts
 * or the browser have it.
 */
export function handleTimelineKey(
  ctx: LayerContext,
  event: KeyboardEvent,
  bar: Element,
  cmd: Command,
  edit: KeyboardEdit,
): boolean {
  const { graph: G, dom } = ctx;
  const row = G.geoById.peek().get(bar.getAttribute('data-task-id') ?? '')?.row;
  if (!row) return false;

  if (cmd.startsWith('move.')) {
    const rows = G.visibleRows.peek();
    const next = navigateTimeline({ row: row.visibleIndex, rowCount: rows.length }, cmd as MoveCommand, {
      pageSize: pageRows(ctx),
    });
    if (next.action === 'pan') pan(ctx, next.dir);
    else if (next.action === 'move') {
      const id = rows[next.row]?.task.id;
      if (id !== undefined) moveFocus(ctx, dom.bars, `bar:${id}`, id);
    }
    return true;
  }
  if (cmd === 'activate' || cmd === 'edit') {
    if (!edit.start(row)) ctx.rowClick(row, event);
    return true;
  }
  if (isKeySelectionCommand(cmd)) {
    selectByKey(ctx, row.task.id, cmd);
    return true;
  }
  return false;
}
