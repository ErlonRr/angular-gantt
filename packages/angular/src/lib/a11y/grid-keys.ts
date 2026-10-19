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
//  Cell editing (Phase 11, D15; `handleCellKey`, from the task list's own
//  `keydown` listener, so it runs before the chart's keymap): on an
//  editable cell F2 / Enter open its editor and a printable key opens a
//  text (or, for digits, number) editor seeded with that character (core
//  `cellEditKey`, which wins over the single-key shortcuts there); in the
//  editor Enter commits, Tab / Shift+Tab commit and edit the next /
//  previous editable cell, Escape cancels — unless a custom editor
//  prevented the key. Keys typed during an IME composition are left
//  alone, and the grid's navigation ignores the editor.
//
//  Also here: the context every key handler reads (`GanttKeyContext`,
//  built by the chart's keyboard directive) and the focus helpers the
//  chart's focus restore shares (`findFocusKey`, `focusIntoView`, `isInert`).
// ─────────────────────────────────────────────────────────────

import {
  HEADER_ROW,
  ROW_FOCUS,
  bodyHeight,
  cellEditKey,
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
import { type GanttEditorService } from '../editing/gantt-editor.service';
import { type GanttCellEditService } from '../editing/cell-edit';

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
   * The chart's change pipeline (undo / redo, links, move mode). Set by `GanttKeyboardDirective`;
   * optional only so the context compiles while a directive does not provide it.
   */
  readonly editor?: GanttEditorService;
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
 * with its whole focus ring, core `timelineScrollPadding`). `visible`: the browser shows its focus
 * ring (`:focus-visible`) even after a pointer input, where `focusVisible` is supported.
 */
export function focusIntoView(el: HTMLElement | SVGElement, visible = false): void {
  const options: FocusOptions & { focusVisible?: boolean } = visible
    ? { preventScroll: true, focusVisible: true }
    : { preventScroll: true };
  el.focus(options);
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
function rowOf(ctx: Pick<GanttKeyContext, 'layout'>, el: Element): GanttFlatRow | undefined {
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

/** What the cell-editing keys read: the cell editor, the rows and the task list's columns. */
export interface GanttCellKeyContext {
  readonly layout: GanttLayoutService;
  readonly cells: GanttCellEditService;
  /** The task list's columns in the current view */
  columns(): readonly ColumnDef[];
  /**
   * Renders now (the task list: `ApplicationRef.tick()`): the editor a key opened is mounted and
   * focused before the next key, so fast typing loses nothing (the Web Component's `renderNow`)
   */
  renderNow?: (() => void) | undefined;
}

/**
 * The cell-editing keys (D15), from the task list's own `keydown` listener (before the chart's
 * keymap): prevents what it used, so the keymap leaves it alone.
 * - In the open editor: Enter → commit, Tab / Shift+Tab → commit and edit the next / previous
 *   editable cell of the row, Escape → cancel (focus back to the cell). A key the custom editor
 *   prevented, and any other key, stays the editor's.
 * - On an editable cell with focus (not a control inside it): F2 / Enter → edit, a printable key
 *   → edit seeded with it (text editors; digits for number editors).
 * The key that opens an editor (F2, Enter, a typed character; Tab / Shift+Tab to the next one)
 * renders it at once (`ctx.renderNow`): its field has focus before the next key.
 */
export function handleCellKey(ctx: GanttCellKeyContext, event: KeyboardEvent): void {
  if (event.isComposing) return;
  const origin = event.composedPath()[0];
  if (!(origin instanceof Element)) return;
  const { cells } = ctx;
  if (cells.active() && origin.closest('.gantt-tl-cell--editing')) {
    if (event.defaultPrevented) return;
    const kind = cells.session()?.editor.kind ?? 'text';
    const action = cellEditKey(event, { editing: true, kind });
    if (action === null) return;
    event.preventDefault();
    if (action === 'cancel') cells.cancel();
    else cells.commit(action === 'commit-next' ? 'next' : action === 'commit-prev' ? 'prev' : undefined);
    // Tab / Shift+Tab opened the next editor: its field has focus before the next key
    if (action !== 'commit' && action !== 'cancel' && cells.active()) ctx.renderNow?.();
    return;
  }
  if (event.defaultPrevented || !origin.classList.contains('gantt-tl-cell')) return;
  // Text editors take every key another kind takes: anything else (arrows, Space…) is not resolved
  if (cellEditKey(event, { editing: false, kind: 'text' }) === null) return;
  const rowEl = origin.closest('.gantt-tl-row');
  const row = rowEl ? rowOf(ctx, rowEl) : undefined;
  const col = ctx.columns()[columnOf(origin)];
  if (!row || !col) return;
  const kind = cells.kindOf(row.task.id, col.key);
  if (kind === null) return;
  const action = cellEditKey(event, { editing: false, kind });
  if (action !== 'start' && action !== 'seed') return;
  if (!cells.start(row.task.id, col.key, action === 'seed' ? event.key : undefined)) return;
  event.preventDefault();
  // The field is mounted and focused now: the keys typed right after this one reach it
  ctx.renderNow?.();
}

/**
 * A grid key on `origin` (inside the task list). Returns `true` when the grid used it (the caller
 * prevents its default action), `false` to let the global shortcuts or the browser have it.
 */
export function handleGridKey(ctx: GanttKeyContext, event: KeyboardEvent, origin: Element, cmd: Command): boolean {
  // An open cell editor keeps its keys (a custom editor's buttons, arrows…)
  if (origin.closest('.gantt-tl-cell--editing')) return false;
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
