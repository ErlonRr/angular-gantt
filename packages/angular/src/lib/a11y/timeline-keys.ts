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
//    L                                     link mode from this bar's end (`editing.dependencies`,
//                                          `editRules(row).linkFrom`; `editing/link.ts`, mode
//                                          `'keyboard'`)
//
//  In keyboard link mode the focused bar is the target (the keyboard
//  directive's `focusin` follows focus). In keyboard or click mode,
//  Enter, F2 or L on a bar creates the link to it (FS from the keyboard)
//  through the chart's editor, and on the source bar itself cancels
//  (announced). Esc cancels; so do Tab out of the bars and a pointer
//  press in keyboard mode (the keyboard directive).
//
//  A bar beyond the virtual window (PageDown, End) is mounted first: its
//  row is pinned (`focusedRowId`) and the chart focuses it after the
//  next render.
// ─────────────────────────────────────────────────────────────

import { untracked } from '@angular/core';
import { isKeySelectionCommand, navigateTimeline, panScrollLeft, type Command, type MoveCommand } from '@gantryjs/core';

import { type KeyboardEdit } from '../drag/keyboard-edit';
import { type GanttLinkService } from '../editing/link';
import { moveFocus, pageRows, selectByKey, type GanttKeyContext } from './grid-keys';

/** The key context of the timeline: the grid's, plus the chart's link interactions (L, link mode). */
export interface GanttTimelineKeyContext extends GanttKeyContext {
  readonly link: GanttLinkService;
}

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
  ctx: GanttTimelineKeyContext,
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
  // Link mode: Enter, F2 or L on a bar finishes it there (a pointer drag's session is the pointer's)
  const linking = untracked(layout.link);
  if (linking && linking.mode !== 'drag' && (cmd === 'activate' || cmd === 'edit' || cmd === 'link')) {
    ctx.link.over(row.task.id);
    ctx.link.finish();
    return true;
  }
  if (cmd === 'link') {
    if (linking) return false;
    ctx.link.start(row.task.id, 'end', 'keyboard', null);
    return ctx.link.active();
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
