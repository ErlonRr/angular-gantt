// ─────────────────────────────────────────────────────────────
//  gantry · a11y/grid-keys.ts
//
//  Keys in the task list (row-first treegrid, D6 of Gantry 2 phase 9),
//  the Web Component's `interaction/grid-keys.ts`, through the core
//  reducers: `navigateGrid` (with `rowFocus` and the header row) for the
//  moves, `keySelectionModifiers` for Space / Shift+Space / Ctrl+Space,
//  and the row activation and header sort of Enter.
//
//    Row      ↑/↓ PgUp/PgDn Home/End       previous / next row, ± one viewport page, first / last row
//             →                            collapsed parent: expand; otherwise its first cell
//             ←                            expanded parent: collapse; otherwise the parent row
//    Cell     ←/→                          previous / next cell (← on the first cell: the row)
//             ↑/↓, Home/End, Ctrl+Home/End same column; first / last cell; first / last row
//    Header   (above row 1; cells only)    Enter / Space sort the column
//    Row / cell  Enter                     select only this row + `rowClick`
//                Space, Shift+Space, Ctrl+Space   select (toggles with multiple selection) / range / toggle
//
//  Focus moves to the control's `data-focus-key` (`row:<id>`,
//  `cell:<id>:<column>`, `head:<column>`): at once when it is mounted
//  (scrolled into view by the least amount), else its row is pinned
//  (`focusedRowId`) and the chart focuses it after the next render
//  (`requestFocus`). Expanding and collapsing from the keyboard is
//  announced in the polite live region.
//
//  A button or link inside a cell (the collapse toggle, a consumer's
//  template) keeps Enter and Space. The task list paints the roving
//  `tabindex` (one tab stop for the whole grid).
//
//  Also here: the context every key handler reads (`GanttKeyContext`,
//  built by the chart's keyboard directive) and the focus helpers the
//  chart's focus restore shares (`findFocusKey`, `focusIntoView`, `isInert`).
// ─────────────────────────────────────────────────────────────

import {
  HEADER_ROW,
  ROW_FOCUS,
  bodyHeight,
  isGridEdgeJump,
  isKeySelectionCommand,
  keySelectionModifiers,
  navigateGrid,
  pageRowCount,
  type BarVisual,
  type Command,
  type KeySelectionCommand,
  type MoveCommand,
} from '@gantryjs/core';

import {
  type ColumnDef,
  type GanttFlatRow,
  type RowGeometry,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '../types';
import { type GanttLayoutService } from '../layout/gantt-layout.service';
import { type GanttSelectionService } from '../selection/gantt-selection.service';
import { type GanttScrollService } from '../scroll/gantt-scroll.service';
import { type GanttDragService } from '../drag/gantt-drag.service';
import { type GanttI18nService } from '../services/gantt-i18n.service';
import { type GanttAnnouncer } from './announcer';

/** What the chart (`GantryComponent`) does for the keys: its element, outputs and public actions. */
export interface GanttKeyboardHost {
  /** The chart's host element (the task list, the bars and the viewport are inside it) */
  readonly element: HTMLElement;
  /** The timeline viewport (`.gantry-canvas-viewport`), `null` before the first render */
  viewport(): HTMLElement | null;
  /** The task list's columns in the current view */
  columns(): readonly ColumnDef[];
  /** Bar visual of a row geometry (the canvas' memoised `computeBarVisual`) */
  barVisual(geo: RowGeometry): BarVisual;
  /** `options.enableDrag ?? enableDrag` */
  dragEnabled(): boolean;
  /** `options.enableResize ?? enableResize` */
  resizeEnabled(): boolean;
  /** Selects the row as a click with the event's modifiers would, then emits `rowClick` */
  rowClick(row: GanttFlatRow, event: KeyboardEvent): void;
  /** Cycles a column's sort (ascending → descending → original order), state saved */
  sort(key: string): void;
  /** Debounced `stateChange` + `options.stateKey` persistence */
  saveState(): void;
  selectAll(): void;
  zoomIn(): void;
  zoomOut(): void;
  scrollToToday(): void;
  fitToScreen(): void;
  /** A keyboard move was committed: update the task, then emit `taskDragged` */
  taskDragged(event: TaskDragEvent): void;
  /** A keyboard resize was committed: update the task, then emit `taskResized` */
  taskResized(event: TaskResizeEvent): void;
}

/** Everything the key handlers read and write (one per chart, built by `GanttKeyboardDirective`). */
export interface GanttKeyContext {
  readonly layout: GanttLayoutService;
  readonly selection: GanttSelectionService;
  readonly scroll: GanttScrollService;
  readonly drag: GanttDragService;
  readonly i18n: GanttI18nService;
  readonly announcer: GanttAnnouncer;
  readonly chart: GanttKeyboardHost;
  /**
   * Focus the control with `key` after the next render, scrolled into view (a keyboard move to a
   * control that may not be mounted yet).
   */
  requestFocus(key: string): void;
}

/** `data-focus-key` of an element (HTML or SVG). */
export const focusKeyOf = (el: Element | null | undefined): string | null => el?.getAttribute('data-focus-key') ?? null;

/** The element of `root` with `data-focus-key` = `key` (compared as strings: keys hold task ids). */
export function findFocusKey(root: ParentNode, key: string): HTMLElement | SVGElement | null {
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-focus-key]')) {
    if (el.getAttribute('data-focus-key') === key) return el;
  }
  return null;
}

/** Whether `el` is inside an inert subtree (it can't take focus): the table view's timeline, what the state box covers. */
export function isInert(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as Partial<HTMLElement>).inert === true || node.hasAttribute('inert')) return true;
  }
  return false;
}

/**
 * Focuses `el` and scrolls it into view by the least amount (a keyboard move: `focus()` alone may
 * centre it), below the sticky headers (the panes' scroll padding: in the timeline a bar lands
 * with its whole focus ring, core `timelineScrollPadding`).
 */
export function focusIntoView(el: HTMLElement | SVGElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** The task list (`gantt-tasklist`, the treegrid) of the chart. */
export const taskListOf = (ctx: GanttKeyContext): HTMLElement | null =>
  ctx.chart.element.querySelector<HTMLElement>('gantt-tasklist');

/** Rows of one viewport page (PageUp / PageDown): core `pageRowCount` of the body under the header. */
export function pageRows(layout: GanttLayoutService): number {
  return pageRowCount(bodyHeight(layout.viewportHeight(), layout.headerHeight()), layout.rowHeight());
}

/**
 * Moves keyboard focus to the control with `key` inside `root` and scrolls it into view: now when
 * it is mounted, else after the next render, with the row `rowId` pinned in the virtual window so
 * that render mounts it.
 */
export function moveFocus(ctx: GanttKeyContext, root: ParentNode | null, key: string, rowId: string | null): void {
  const el = root ? findFocusKey(root, key) : null;
  if (el) {
    focusIntoView(el);
    return;
  }
  if (rowId !== null) ctx.layout.focusedRowId.set(rowId);
  ctx.requestFocus(key);
}

/** Space / Shift+Space / Ctrl+Space / Enter on the row of `id`: the click rules with the key's modifiers. */
export function selectByKey(ctx: GanttKeyContext, id: string, cmd: KeySelectionCommand): void {
  const policy = ctx.layout.cfg().selection;
  ctx.selection.handleClick(id, keySelectionModifiers(cmd, policy.multi), ctx.layout.visibleRows(), policy);
}

/** Expand or collapse a group (state saved), read out in the polite live region. */
export function setCollapsed(ctx: GanttKeyContext, row: GanttFlatRow, collapsed: boolean): void {
  const id = row.task.id;
  ctx.layout.collapsedIds.update(ids => {
    const next = new Set(ids);
    if (collapsed) next.add(id);
    else next.delete(id);
    return next;
  });
  ctx.chart.saveState();
  const labels = ctx.i18n.labels();
  ctx.announcer.announce(collapsed ? labels.announceCollapsed(row.task.name) : labels.announceExpanded(row.task.name));
}

/** 0-based column of a header cell or a cell (`aria-colindex` is 1-based). */
const columnOf = (el: Element): number => Number(el.getAttribute('aria-colindex')) - 1;

/** The visible row a task-list row element shows (`aria-rowindex` 1 is the header row). */
function rowOf(ctx: GanttKeyContext, el: Element): GanttFlatRow | undefined {
  const rows = ctx.layout.visibleRows();
  const id = el.getAttribute('data-task-id');
  const row = rows[Number(el.getAttribute('aria-rowindex')) - 2];
  return row?.task.id === id ? row : rows.find(r => r.task.id === id);
}

/** Focus the grid position `row` / `col` (`HEADER_ROW`, `ROW_FOCUS`), mounting it first if needed. */
function focusPosition(ctx: GanttKeyContext, row: number, col: number): void {
  const cols = ctx.chart.columns();
  const list = taskListOf(ctx);
  if (row === HEADER_ROW) {
    const key = cols[col]?.key;
    if (key !== undefined) moveFocus(ctx, list, `head:${key}`, null);
    return;
  }
  const id = ctx.layout.visibleRows()[row]?.task.id;
  if (id === undefined) return;
  const key = col === ROW_FOCUS ? `row:${id}` : `cell:${id}:${cols[col]?.key ?? ''}`;
  moveFocus(ctx, list, key, id);
}

/**
 * A grid key on `origin` (inside the task list). Returns `true` when the grid used it (the caller
 * prevents its default action), `false` to let the global shortcuts or the browser have it.
 */
export function handleGridKey(ctx: GanttKeyContext, event: KeyboardEvent, origin: Element, cmd: Command): boolean {
  const head = origin.closest('.gantt-tl-col-header');
  const rowEl = head ? null : origin.closest('.gantt-tl-row');
  if (!head && !rowEl) return false;
  const cell = rowEl ? origin.closest('.gantt-tl-cell') : null;
  const row = rowEl ? rowOf(ctx, rowEl) : undefined;
  if (rowEl && !row) return false;
  const control = origin !== head && origin !== rowEl && origin !== cell && origin.closest('button, a[href]');
  if (control && (cmd === 'activate' || isKeySelectionCommand(cmd))) return false;

  if (cmd.startsWith('move.')) {
    const next = navigateGrid(
      {
        row: row ? row.visibleIndex : HEADER_ROW,
        col: head ? columnOf(head) : cell ? columnOf(cell) : ROW_FOCUS,
        rowCount: ctx.layout.visibleRows().length,
        colCount: ctx.chart.columns().length,
      },
      cmd as MoveCommand,
      {
        rowFocus: true,
        header: true,
        pageSize: pageRows(ctx.layout),
        toEdge: isGridEdgeJump(event),
        hasChildren: row?.hasChildren,
        expanded: row ? !row.isCollapsed : false,
        parentRow: row?.parentIndex,
      },
    );
    if (next.action === 'move') focusPosition(ctx, next.row, next.col);
    else if (row && (next.action === 'expand' || next.action === 'collapse'))
      setCollapsed(ctx, row, next.action === 'collapse');
    return true;
  }

  if (head) {
    const col = ctx.chart.columns()[columnOf(head)];
    if ((cmd === 'activate' || cmd === 'toggle.select') && col?.sortable) ctx.chart.sort(col.key);
    return cmd === 'activate' || isKeySelectionCommand(cmd);
  }
  if (!row) return false;
  if (cmd === 'activate') {
    ctx.chart.rowClick(row, event);
    return true;
  }
  if (isKeySelectionCommand(cmd)) {
    selectByKey(ctx, row.task.id, cmd);
    return true;
  }
  return false;
}
