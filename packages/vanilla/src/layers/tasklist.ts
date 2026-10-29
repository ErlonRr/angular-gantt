/**
 * @file tasklist.ts
 * Task-list region: the treegrid of the split panel and of the table view, patched in place.
 *
 *   div.gantt-tasklist.gantry-tasklist-container   role=treegrid (the skeleton's container)
 *     div.gantt-tl-col-headers                     role=row: header cells keyed by column key
 *       div.gantt-tl-col-header                    span.gantt-tl-ellipsis (label) ·
 *                                                  span.gantt-tl-sort-icon(--active) · div.gantt-col-resize
 *     div.gantt-tl-rows                            role=rowgroup
 *       div (spacer) · rows keyed by task id · div (spacer)
 *         div.gantt-tl-cell (name)                 span.gantt-tl-name > button.gantt-collapse-btn |
 *                                                  span.gantt-tl-indent · span.gantt-tl-icon · span.gantt-tl-ellipsis
 *         div.gantt-tl-cell (other columns)        span.gantt-tl-status-dot? · span.gantt-tl-ellipsis
 *   div.gantt-tl-load-more                         the treegrid's next sibling in the panel, attached
 *                                                  while a data source feeds rows (`graph.chartState.footer`):
 *                                                  outside the treegrid, which may only hold rows (as in Angular)
 *     button.gantt-load-more-btn                   "Load more", "Loading…" (aria-disabled) — full width, the
 *                                                  toolbar's control size tall (`--gantry-control-size`)
 *     | div.gantt-load-error > span + button.gantt-load-more-btn   a failed page: the message and Retry
 *     | div.gantt-load-done                        everything loaded (`labels.allLoaded`)
 *                                                  The same DOM and look as Angular's `gantt-load-more`
 *
 * ARIA (treegrid): the header row is `aria-rowindex=1`; header cells and cells carry
 * `aria-colindex` (1-based column position); rows carry `aria-rowindex`, `aria-level`,
 * `aria-posinset` / `aria-setsize` (their place among their siblings, core `reindexVisible`),
 * `aria-selected` and, for groups, `aria-expanded`. Without rows, or while the first data-source
 * page loads or failed, the chart's state box (`layers/states.ts`) shows instead of the footer.
 *
 * Row backgrounds are core `rowPaint` with the row's resolved style (`graph.rowStyle`: selection,
 * else `rowColor`, else the zebra); the name cell's icon takes the style's `color` (the stylesheet
 * gives the others the muted text). The row under a mouse or pen pointer (`hoveredRowId`, in either
 * pane, D4) gets `gantt-tl-row--hover`: the `--gantt-row-hover-bg` tint as a background image over
 * that background, like the timeline's `rect.gantt-row-hover` (`layers/hover.ts`).
 *
 * Rows are keyed by task id, so a row keeps its node (and keyboard focus) across scrolls,
 * selections, sorts and collapses; rows leaving the window go to a pool the next new rows come
 * from. Cells are keyed by column key, and a row's cells are rendered again only when its row,
 * the columns, the cell context, the labels or the indent changed: a scroll or a selection
 * patches the row attributes only. Pinned rows (the focused row kept mounted outside the virtual
 * window) are taken out of the flow and positioned at their row offset (`.gantt-tl-row--pinned`).
 *
 * Keyboard (row-first treegrid, D6): the whole grid is one tab stop. Header cells, rows and cells
 * are focusable (`data-focus-key` `head:<column>`, `row:<id>`, `cell:<id>:<column>`) with
 * `tabindex=-1`, except one with `tabindex=0` (core `gridTabStop`): the header cell or the cell
 * focused last in the list (a cell only while its row is the tab-stop row), else the tab-stop row —
 * the focused row (in either pane: `focusedRowId`), else the one focused last while it is mounted,
 * else the first row in view (core `tabStopIndex`) — else, without rows, the first header cell, so
 * the scrollable list always keeps a keyboard stop. While the chart is not ready the state box
 * covers the rows: they are `inert` and the header row (above the box) holds the tab stop.
 * Collapse toggles are `tabindex=-1` (the row expands with →). The keys themselves are
 * `interaction/grid-keys.ts`.
 *
 * Cell editor (Phase 11, D14–D16, contract §3d, shared with Angular): while a cell is edited
 * (`inputs.cellEdit`, `interaction/cell-edit.ts`) its row is pinned and raised and the cell shows
 * the editor instead of its content (detached, built again when the editor closes):
 *
 *     div.gantt-tl-row.gantt-tl-row--editing > div.gantt-tl-cell.gantt-tl-cell--editing
 *       input.gantt-tl-editor[type][aria-label][aria-invalid?][aria-describedby?]
 *         | select.gantt-tl-editor (kind 'select') | the custom editor's node (+ class gantt-tl-editor)
 *       div.gantt-tl-editor-error#gantry-<n>-editor-error   last child, attached only while invalid
 *
 * The editor is built once per edit (its text then belongs to it: typing re-runs nothing here),
 * named `labels.ariaCellEditor(column, task)` and focused through its `editor:<id>:<column>` key
 * (a custom node: the node, else its first focusable child). While `editing.cells` is on every
 * cell carries `aria-readonly` (core `cellEditable`); with it off, no attribute.
 *
 * Listeners are delegated: one click / dblclick and one pointerover / pointerleave (the hovered
 * row; a touch never hovers) on the rows group, one click / pointerdown on the header row, one
 * focusin on the list (where its tab stop goes), one keydown / input / focusout on the list for
 * the cell editor (keys `grid-keys.ts` `handleCellKey`; a double-click on an editable cell opens
 * it too, `row-dblclick` still fires; clicks inside the editor are its own), one click on the
 * footer. Column
 * resizing captures the pointer on the handle (`interaction/column-resize.ts`) and is aborted when
 * the element disconnects.
 *
 * Class names and element order are the paint-snapshot keys and the e2e contract, shared with
 * Angular's task list: keep them. Styles and text colours live in `styles/tasklist.css.ts`; what
 * varies per column or row (grid template, heights, alignment, indent, row and status paints, the
 * icon colour of a styled task) goes through the CSSOM.
 */

import {
  cellEditable,
  computeCellVisual,
  gridTabStop,
  resourceAccessibleName,
  resourceRowInfo,
  rowPaint,
  sameGridSpot,
  tabStopIndex,
  type ColumnContext,
  type GanttFlatRow,
  type GanttLabels,
  type GridFocusSpot,
  type StyleResolver,
} from '@gantryjs/core';
import { h } from '../dom/h';
import { createPool, reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText, toggleClass } from '../dom/patch';
import type { MountedRow } from '../engine/graph/tasklist';
import type { EditRulesOf } from '../engine/graph/visuals';
import type { GanttLoadMoreState, SortState } from '../engine/inputs';
import { editorFocusKey, type CellEditSession } from '../interaction/cell-edit';
import { createColumnResize } from '../interaction/column-resize';
import { cycleSort, handleCellKey, setCollapsed } from '../interaction/grid-keys';
import { computed, signal } from '../reactive';
import type { VanillaColumnDef } from '../types';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/** Rows kept for reuse after leaving the window (a scroll recycles them at the other end). */
const POOL_SIZE = 64;

/** Task lists built so far: the error node's id is unique per element (`gantry-<n>-editor-error`, as Angular's `uid`) */
let nextUid = 0;

/** What a custom editor's focus goes to: the node itself, else its first focusable child. */
const FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex], [contenteditable]';

/** Whether a cell is editable (core `cellEditable` with the row's edit rules); `null` while `editing.cells` is off. */
type EditableOf = (col: VanillaColumnDef, row: GanttFlatRow) => boolean;

/** The open editor's state the task list paints (its text is the editor's own: typing re-runs nothing). */
interface EditView {
  readonly taskId: string;
  readonly columnKey: string;
  readonly error: string | null;
}

const sameEditView = (a: EditView | null, b: EditView | null) =>
  a === b || (!!a && !!b && a.taskId === b.taskId && a.columnKey === b.columnKey && a.error === b.error);

/** A mounted cell editor. */
interface EditorMount {
  /** The edit it belongs to (one per `start`) */
  readonly context: CellEditSession['context'];
  /** The cell's child: `input` / `select.gantt-tl-editor`, or the custom editor's node (class added) */
  readonly node: HTMLElement;
  /** What takes focus and carries the name, `aria-invalid` and `aria-describedby` (the node or its first focusable child) */
  readonly field: HTMLElement;
  /** A built-in editor: its `input` events are the text */
  readonly builtin: boolean;
}

/** What a row's cells are rendered from: they render again only when one of these changes. */
interface CellEnv {
  readonly cols: readonly VanillaColumnDef[];
  readonly ctx: ColumnContext;
  readonly labels: GanttLabels;
  readonly indent: number;
  /** Which cells can be edited (`aria-readonly`), `null` while `editing.cells` is off (no attribute) */
  readonly editable: EditableOf | null;
}

const sameEnv = (a: CellEnv | undefined, b: CellEnv) =>
  a !== undefined &&
  a.cols === b.cols &&
  a.ctx === b.ctx &&
  a.labels === b.labels &&
  a.indent === b.indent &&
  a.editable === b.editable;

/** What a row element shows (also how the delegated listeners find the row of an event). */
interface RowState {
  readonly row: GanttFlatRow;
  readonly env: CellEnv;
  /** The column whose cell shows the editor, `null` = none */
  readonly editCol: string | null;
}

/** A cell's inner nodes, by what the cell shows. */
type CellParts =
  | { readonly kind: 'template' }
  | {
      readonly kind: 'name';
      readonly wrap: HTMLElement;
      readonly pad: HTMLElement;
      toggle: HTMLButtonElement | null;
      readonly icon: HTMLElement;
      readonly text: HTMLElement;
    }
  | { readonly kind: 'text'; dot: HTMLElement | null; readonly text: HTMLElement };

/** A header cell's inner nodes and the column it shows. */
interface HeadParts {
  col: VanillaColumnDef | null;
  readonly label: HTMLElement;
  arrow: HTMLElement | null;
  handle: HTMLElement | null;
}

type FooterKind = 'loading' | 'error' | 'more' | 'done';

function justify(align: VanillaColumnDef['align']): string {
  return align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
}

/** Keys from `key`, made unique within one render (`id`, `id#1`, …): duplicates still render. */
function uniqueKeys<T>(key: (item: T) => string): (item: T) => string {
  const seen = new Map<string, number>();
  return item => {
    const k = key(item);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n ? `${k}#${n}` : k;
  };
}

export function createTasklistLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom, columns } = ctx;
  const root = dom.tasklistContainer;
  const rowState = new WeakMap<Element, RowState>();
  const cellParts = new WeakMap<Element, CellParts>();
  const headParts = new WeakMap<Element, HeadParts>();
  /** Column key of each cell */
  const cellKeys = new WeakMap<Element, string>();
  /** The name cell's icon of each row element (`null`: no name column) */
  const rowIcons = new WeakMap<Element, HTMLElement | null>();

  // ── Persistent nodes ─────────────────────────────────────
  setAttr(root, 'class', 'gantt-tasklist gantry-tasklist-container');
  setAttr(root, 'role', 'treegrid');
  const head = h('div', { class: 'gantt-tl-col-headers', attrs: { role: 'row', 'aria-rowindex': 1 } });
  const spacer = () => h('div', { attrs: { 'aria-hidden': 'true' } });
  const top = spacer();
  const bottom = spacer();
  const body = h('div', { class: 'gantt-tl-rows', attrs: { role: 'rowgroup' } }, top, bottom);
  const footer = h('div', { class: 'gantt-tl-load-more' });
  const footerButton = h('button', {
    class: 'gantt-load-more-btn',
    attrs: { type: 'button' },
    dataset: { focusKey: 'load-more' },
  });
  const footerMessage = h('span');
  const footerError = h('div', { class: 'gantt-load-error' }, footerMessage);
  const footerDone = h('div', { class: 'gantt-load-done' });
  let footerKind: FooterKind | null = null;
  /** The row that held focus last: it keeps the tab stop while mounted, so Tab returns to it */
  let lastFocusedId: string | null = null;
  /** Where focus was last inside the list (the header cell or cell that keeps the tab stop) */
  const focusSpot = signal<GridFocusSpot | null>(null, { equals: sameGridSpot });
  /** The cell that has `tabindex=0` (`null`: a row or a header cell has it) */
  let stopCell: HTMLElement | null = null;
  root.append(head, body);

  // ── Cell editor (Phase 11, D14–D16, §3d) ─────────────────
  const errorId = `gantry-${++nextUid}-editor-error`;
  /** The editor's message: the editing cell's last child while the text is invalid */
  const errorNode = h('div', { class: 'gantt-tl-editor-error', attrs: { id: errorId } });
  /** The open editor without its text: typing re-runs nothing here */
  const editView = computed(
    (): EditView | null => {
      const state = I.cellEdit();
      return state && { taskId: state.taskId, columnKey: state.columnKey, error: state.error };
    },
    { equals: sameEditView },
  );
  let editor: EditorMount | null = null;
  /** `env.editable`, kept while the edit rules (and so the config) are the same */
  let editableCache: { rules: EditRulesOf; fn: EditableOf } | null = null;

  const pool = createPool(() => h('div', { class: 'gantt-tl-row', attrs: { role: 'row', tabindex: -1 } }), POOL_SIZE);

  // ── Interaction ──────────────────────────────────────────
  const resize = createColumnResize({
    onWidth: (key, width) => columns.setColumnWidth(key, width),
    onEnd: () => ctx.saveState(),
  });

  /** The row an event happened in. */
  const rowOf = (target: EventTarget | null): GanttFlatRow | undefined => {
    const el = (target as Element | null)?.closest?.('.gantt-tl-row');
    return el ? rowState.get(el)?.row : undefined;
  };

  /** An event inside the open editor (its clicks and keys are the editor's). */
  const inEditor = (target: EventTarget | null): boolean =>
    !!(target as Element | null)?.closest?.('.gantt-tl-cell--editing');

  body.addEventListener('click', e => {
    const row = rowOf(e.target);
    if (!row || inEditor(e.target)) return;
    if ((e.target as Element).closest('.gantt-collapse-btn')) {
      e.stopPropagation();
      setCollapsed(ctx, row, !I.collapsedIds.peek().has(row.task.id));
      return;
    }
    ctx.rowClick(row, e);
  });
  // A double-click on an editable cell (not on a control inside it) also opens its editor
  body.addEventListener('dblclick', e => {
    const target = e.target as Element;
    const row = rowOf(target);
    if (!row || inEditor(target)) return;
    const cell = target.closest('.gantt-tl-cell');
    const key = cell && cellKeys.get(cell);
    // Mounted and focused at once: a key typed right away reaches the field
    if (key != null && !target.closest('button, a[href]') && ctx.cells.start(row.task.id, key)) ctx.renderNow();
    ctx.emit('row-dblclick', row);
  });
  // The hovered row (mouse and pen; never while a bar is dragged): its tint shows in both panes
  const hover = (id: string | null): void => {
    if (I.hoveredRowId.peek() !== id) I.hoveredRowId.set(id);
  };
  body.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch' || ctx.drag.state.peek().kind !== 'idle') return;
    hover(rowOf(e.target)?.task.id ?? null);
  });
  body.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'touch') hover(null);
  });
  // F2 / Enter / typing on an editable cell and the editor's Enter / Tab / Escape, before the
  // element's keymap (`keyboard.ts`, on the shadow root) sees them
  root.addEventListener('keydown', e => handleCellKey(ctx, e));
  // A built-in editor's text (a custom editor calls `setValue`)
  root.addEventListener('input', e => {
    const m = editor;
    if (m?.builtin && e.target === m.node) ctx.cells.input((m.node as HTMLInputElement | HTMLSelectElement).value);
  });
  // Focus leaving the editor's cell commits it (else cancels), once focus has settled: a press
  // elsewhere, Tab out of a custom editor, or the editor removed with its row
  root.addEventListener('focusout', e => {
    const cell = editor?.node.parentElement;
    const open = ctx.cells.active();
    if (!cell || !open || !cell.contains(e.target as Node)) return;
    const next = e.relatedTarget as Node | null;
    if (next && cell.contains(next)) return;
    queueMicrotask(() => {
      const now = ctx.cells.active();
      if (now?.taskId !== open.taskId || now.columnKey !== open.columnKey) return;
      const active = ctx.shadow.activeElement;
      if (active && editor?.node.parentElement?.contains(active)) return;
      ctx.cells.blur();
    });
  });
  // The keys are `interaction/grid-keys.ts`; this only records where the list's tab stop goes
  root.addEventListener('focusin', e => {
    const target = e.target as Element;
    const headCell = target.closest('.gantt-tl-col-header');
    const key = headCell && headParts.get(headCell)?.col?.key;
    if (key != null) {
      focusSpot.set({ kind: 'head', key });
      return;
    }
    const rowEl = target.closest('.gantt-tl-row');
    const id = rowEl && rowState.get(rowEl)?.row.task.id;
    if (id == null) return;
    const cell = target.closest('.gantt-tl-cell');
    const col = cell && cellKeys.get(cell);
    focusSpot.set(col != null ? { kind: 'cell', id, key: col } : { kind: 'row', id });
  });

  /** The sortable column of the header cell an event happened in. */
  const sortableOf = (target: EventTarget | null): VanillaColumnDef | undefined => {
    const el = (target as Element | null)?.closest?.('.gantt-tl-col-header');
    const col = el ? headParts.get(el)?.col : undefined;
    return col?.sortable ? col : undefined;
  };

  head.addEventListener('click', e => {
    // The click that ends a resize belongs to the handle, never to the sort
    if ((e.target as Element).closest('.gantt-col-resize')) {
      e.stopPropagation();
      return;
    }
    const col = sortableOf(e.target);
    if (col && !resize.active()) cycleSort(ctx, col.key);
  });
  head.addEventListener('pointerdown', e => {
    const handle = (e.target as Element).closest<HTMLElement>('.gantt-col-resize');
    const col = handle?.parentElement ? headParts.get(handle.parentElement)?.col : undefined;
    if (handle && col) resize.start(handle, e, col);
  });

  footer.addEventListener('click', e => {
    if (!(e.target as Element).closest('.gantt-load-more-btn')) return;
    const ds = I.dataSource.peek();
    if (footerKind === 'error') void ds?.retry();
    else if (footerKind === 'more') void ds?.loadNext();
  });

  // ── Header cells ─────────────────────────────────────────
  const createHead = (): HTMLElement => {
    const label = h('span', { class: 'gantt-tl-ellipsis' });
    const el = h('div', { class: 'gantt-tl-col-header', attrs: { role: 'columnheader' } }, label);
    headParts.set(el, { col: null, label, arrow: null, handle: null });
    return el;
  };

  const updateHead = (
    el: HTMLElement,
    col: VanillaColumnDef,
    sort: SortState | null,
    colIndex: number,
    tabStop: boolean,
  ): void => {
    const p = headParts.get(el)!;
    p.col = col;
    setAttr(el, 'aria-colindex', colIndex);
    // Every header cell is in the grid navigation (the header row is above row 1)
    setAttr(el, 'tabindex', tabStop ? 0 : -1);
    setAttr(el, 'data-focus-key', `head:${col.key}`);
    setStyleProp(el, 'justify-content', justify(col.align));
    setText(p.label, col.label);
    setAttr(p.label, 'title', col.label);

    const sortable = !!col.sortable;
    const dir = sortable && sort?.key === col.key ? sort.dir : null;
    setAttr(el, 'aria-sort', sortable ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : null);
    if (sortable) {
      const arrow = (p.arrow ??= h('span', { class: 'gantt-tl-sort-icon', attrs: { 'aria-hidden': 'true' } }));
      if (arrow.parentNode !== el) p.label.after(arrow);
      toggleClass(arrow, 'gantt-tl-sort-icon--active', dir !== null);
      setText(arrow, dir === 'desc' ? '▼' : dir === 'asc' ? '▲' : '⇅');
    } else p.arrow?.remove();

    if (col.resizable !== false) {
      const handle = (p.handle ??= h('div', { class: 'gantt-col-resize', attrs: { 'aria-hidden': 'true' } }));
      if (handle.parentNode !== el) el.appendChild(handle);
    } else p.handle?.remove();
  };

  // ── Cells ────────────────────────────────────────────────
  const createCell = (): HTMLElement => h('div', { class: 'gantt-tl-cell', attrs: { role: 'gridcell', tabindex: -1 } });

  const nameParts = (): CellParts => {
    const pad = h('span', { class: 'gantt-tl-indent' });
    const icon = h('span', { class: 'gantt-tl-icon', attrs: { 'aria-hidden': 'true' } });
    const text = h('span', { class: 'gantt-tl-ellipsis' });
    const wrap = h('span', { class: 'gantt-tl-name' }, pad, icon, text);
    return { kind: 'name', wrap, pad, toggle: null, icon, text };
  };

  const updateCell = (
    cell: HTMLElement,
    col: VanillaColumnDef,
    colIndex: number,
    row: GanttFlatRow,
    env: CellEnv,
    editing: boolean,
  ): void => {
    setAttr(cell, 'aria-colindex', colIndex);
    setAttr(cell, 'data-focus-key', `cell:${row.task.id}:${col.key}`);
    cellKeys.set(cell, col.key);
    setStyleProp(cell, 'justify-content', justify(col.align));
    // While editing cells: editable cells are `aria-readonly=false`, the others `true`
    setAttr(cell, 'aria-readonly', env.editable ? String(!env.editable(col, row)) : null);
    // The editing cell shows its editor (`placeEditor`); its content is built again when it closes
    toggleClass(cell, 'gantt-tl-cell--editing', editing);
    if (editing) return;
    const template = col.cellTemplate;
    const kind = template ? 'template' : col.key === 'name' ? 'name' : 'text';
    let p = cellParts.get(cell);
    if (p?.kind !== kind) {
      // The column at this key changed what it shows: start the cell over
      cell.replaceChildren();
      setAttr(cell, 'data-status', null);
      setAttr(cell, 'title', null);
      p =
        kind === 'name'
          ? nameParts()
          : kind === 'text'
            ? { kind, dot: null, text: h('span', { class: 'gantt-tl-ellipsis' }) }
            : { kind };
      if (p.kind !== 'template') cell.append(p.kind === 'name' ? p.wrap : p.text);
      cellParts.set(cell, p);
    }

    if (p.kind === 'template') {
      const content = template!(row, env.ctx);
      if (typeof content === 'string') cell.textContent = content;
      else cell.replaceChildren(content);
    } else if (p.kind === 'name') {
      // A consumer `render` on the name column changes the text, keeping indent and toggle
      const text = !col.builtin && col.render ? col.render(row, env.ctx) : row.task.name;
      setStyleProp(p.wrap, 'padding-left', `${row.level * env.indent}px`);
      const lead = row.hasChildren
        ? (p.toggle ??= h('button', { class: 'gantt-collapse-btn', attrs: { type: 'button', tabindex: -1 } }))
        : p.pad;
      if (p.wrap.firstChild !== lead) {
        p.wrap.firstChild?.remove();
        p.wrap.prepend(lead);
      }
      if (row.hasChildren) {
        const name = row.task.name;
        setAttr(lead, 'data-focus-key', `collapse:${row.task.id}`);
        setAttr(lead, 'aria-expanded', String(!row.isCollapsed));
        setAttr(lead, 'aria-label', row.isCollapsed ? env.labels.ariaExpand(name) : env.labels.ariaCollapse(name));
        setText(lead, row.isCollapsed ? '▶' : '▼');
      }
      setText(p.icon, row.hasChildren ? '▤' : row.barType === 'milestone' ? '◆' : '▬');
      setText(p.text, text);
    } else {
      const v = computeCellVisual(col, row, env.ctx);
      setAttr(cell, 'data-status', v.status || null);
      setAttr(cell, 'title', v.title || null);
      if (v.status) {
        const dot = (p.dot ??= h('span', { class: 'gantt-tl-status-dot', attrs: { 'aria-hidden': 'true' } }));
        if (dot.parentNode !== cell) cell.insertBefore(dot, p.text);
        setStyleProp(dot, 'background-color', v.dotPaint);
      } else p.dot?.remove();
      setStyleProp(p.text, 'text-align', col.align ?? 'start');
      setText(p.text, v.text);
    }
  };

  // ── Cell editor ──────────────────────────────────────────
  /** Builds the editor of an edit (§3d): a built-in `input` / `select`, or the column's own node. */
  const buildEditor = (s: CellEditSession, labels: GanttLabels): EditorMount => {
    const value = I.cellEdit.peek()?.value ?? s.editor.value;
    const { input } = s.editor;
    const factory = s.editor.kind === 'custom' && typeof s.column.editor === 'function' ? s.column.editor : null;
    let node: HTMLElement;
    let field: HTMLElement;
    if (factory) {
      node = factory(s.context);
      node.classList.add('gantt-tl-editor');
      field = node.matches(FOCUSABLE) ? node : (node.querySelector<HTMLElement>(FOCUSABLE) ?? node);
      // Nothing focusable inside: the node itself takes focus (the keys reach the chart through it)
      if (field === node && !node.matches(FOCUSABLE)) setAttr(node, 'tabindex', -1);
    } else if (input.type === 'select') {
      const select = h(
        'select',
        { class: 'gantt-tl-editor' },
        (input.options ?? []).map(o => h('option', { attrs: { value: o.value } }, o.label)),
      );
      select.value = value;
      node = field = select;
    } else {
      const el = h('input', {
        class: 'gantt-tl-editor',
        attrs: { type: input.type, min: input.min, max: input.max, step: input.step, autocomplete: 'off' },
      });
      el.value = value;
      // F2 / Enter / double-click select the text; a typed character stays with the caret after it
      if (!s.seeded && (input.type === 'text' || input.type === 'number')) {
        el.addEventListener('focus', () => el.select(), { once: true });
      }
      node = field = el;
    }
    if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) {
      setAttr(field, 'aria-label', labels.ariaCellEditor(s.column.label, s.row.task.name));
    }
    setAttr(field, 'data-focus-key', editorFocusKey(s.taskId, s.columnKey));
    return { context: s.context, node, field, builtin: !factory };
  };

  /** Shows the editor in its cell (the content detached) with its error state. */
  const placeEditor = (cell: HTMLElement, m: EditorMount, error: string | null): void => {
    if (m.node.parentNode !== cell) {
      cell.replaceChildren(m.node);
      // Built again from scratch when the editor closes
      cellParts.delete(cell);
      setAttr(cell, 'data-status', null);
      setAttr(cell, 'title', null);
    }
    setAttr(m.field, 'aria-invalid', error ? 'true' : null);
    setAttr(m.field, 'aria-describedby', error ? errorId : null);
    if (m.node !== m.field) setAttr(m.node, 'aria-invalid', error ? 'true' : null);
    if (error) {
      setText(errorNode, error);
      if (cell.lastChild !== errorNode) cell.appendChild(errorNode);
    } else errorNode.remove();
  };

  // ── Rows ─────────────────────────────────────────────────
  const updateRow = (
    el: HTMLElement,
    { row, pinnedTop }: MountedRow,
    grid: string,
    rowHeight: number,
    selected: ReadonlySet<string>,
    hoveredId: string | null,
    styleOf: StyleResolver,
    env: CellEnv,
    tabStop: boolean,
    edit: EditView | null,
  ): void => {
    const id = row.task.id;
    const editCol = edit !== null && editor !== null && edit.taskId === id ? edit.columnKey : null;
    const isSelected = selected.has(id);
    const style = styleOf(row);
    setAttr(el, 'data-task-id', id);
    setAttr(el, 'data-focus-key', `row:${id}`);
    setAttr(el, 'tabindex', tabStop ? 0 : -1);
    setAttr(el, 'aria-rowindex', row.visibleIndex + 2);
    setAttr(el, 'aria-level', row.level + 1);
    setAttr(el, 'aria-posinset', row.posInSet);
    setAttr(el, 'aria-setsize', row.setSize);
    setAttr(el, 'aria-selected', String(isSelected));
    setAttr(el, 'aria-expanded', row.hasChildren ? String(!row.isCollapsed) : null);
    // A resource row (Phase 14) is named by its numbers; every other row by its name cell, as before
    const resource = resourceRowInfo(row.task);
    setAttr(el, 'aria-label', resource ? resourceAccessibleName(resource, env.labels) : null);
    toggleClass(el, 'gantt-tl-row--selected', isSelected);
    toggleClass(el, 'gantt-tl-row--group', row.hasChildren);
    toggleClass(el, 'gantt-tl-row--pinned', pinnedTop !== null);
    toggleClass(el, 'gantt-tl-row--hover', id === hoveredId);
    toggleClass(el, 'gantt-tl-row--editing', editCol !== null);
    setStyleProp(el, 'top', pinnedTop === null ? null : `${pinnedTop}px`);
    setStyleProp(el, 'grid-template-columns', grid);
    setStyleProp(el, 'height', `${rowHeight}px`);
    setStyleProp(el, 'background-color', rowPaint({ row }, isSelected, style));

    const prev = rowState.get(el);
    if (prev?.row !== row || !sameEnv(prev.env, env) || prev.editCol !== editCol) {
      let icon: HTMLElement | null = null;
      reconcile(
        el,
        env.cols,
        uniqueKeys((c: VanillaColumnDef) => c.key),
        createCell,
        (cell, col, i) => {
          updateCell(cell, col, i + 1, row, env, col.key === editCol);
          const p = cellParts.get(cell);
          if (p?.kind === 'name') icon ??= p.icon;
        },
      );
      rowIcons.set(el, icon);
    }
    rowState.set(el, { row, env, editCol });
    if (editCol !== null && editor !== null) {
      const cell = [...el.children].find(c => cellKeys.get(c) === editCol);
      if (cell) placeEditor(cell as HTMLElement, editor, edit?.error ?? null);
    }
    // The icon takes the style's colour (patched on every paint: the style may change without the
    // row, e.g. options.styles); the stylesheet gives every other one the muted text
    const icon = rowIcons.get(el);
    if (icon) setStyleProp(icon, 'color', style.color ?? null);
  };

  // ── Footer (lazy data source) ────────────────────────────
  // It holds no live region: the element announces failures in its own `.gantt-sr-alert`. Every
  // state keeps an element with `data-focus-key="load-more"`, so focus survives Retry / Load more.
  const paintFooter = (state: GanttLoadMoreState, labels: GanttLabels): void => {
    const kind: FooterKind = state.isLoading ? 'loading' : state.error ? 'error' : state.hasMore ? 'more' : 'done';
    setAttr(footer, 'aria-busy', kind === 'loading' ? 'true' : null);
    setAttr(footer, 'tabindex', kind === 'done' ? -1 : null);
    setAttr(footer, 'data-focus-key', kind === 'done' ? 'load-more' : null);
    setText(footerButton, kind === 'loading' ? labels.loading : kind === 'error' ? labels.retry : labels.loadMore);
    setAttr(footerButton, 'aria-disabled', kind === 'loading' ? 'true' : null);
    setText(footerMessage, labels.loadError);
    setText(footerDone, labels.allLoaded(state.loadedCount));
    if (kind === footerKind) return;
    footerKind = kind;
    if (kind === 'error') {
      footerError.append(footerButton);
      footer.replaceChildren(footerError);
    } else footer.replaceChildren(kind === 'done' ? footerDone : footerButton);
  };

  return {
    paint() {
      const cfg = G.config();
      const cols = G.tlColumns();
      const grid = G.tlGridTemplate();
      const mounted = G.tlRows();
      const vw = G.vWindow();
      const rowCount = G.visibleRows().length;
      const { labels } = G.i18n();
      const selected = I.selection().selected;
      const hoveredId = I.hoveredRowId();
      const styleOf = G.rowStyle();
      const sort = I.sort();
      const ds = I.dataSource();
      const loadState = I.loadState();
      // Editing cells: which cells can be edited, kept while the edit rules are the same
      let editable: EditableOf | null = null;
      if (cfg.editing.cells) {
        const rules = G.editRules();
        if (editableCache?.rules !== rules) {
          editableCache = { rules, fn: (col, row) => cellEditable(col, row, rules(row), cfg) };
        }
        editable = editableCache.fn;
      }
      const env: CellEnv = { cols, ctx: G.columnCtx(), labels, indent: cfg.indentSize, editable };
      // The open editor: built once per edit, while its row is shown (pinned through `focusedRowId`)
      const edit = editView();
      const session = edit ? ctx.cells.session() : null;
      if (!session) editor = null;
      else if (editor?.context !== session.context) editor = buildEditor(session, labels);
      const focusedId = I.focusedRowId();
      if (focusedId !== null) lastFocusedId = focusedId;
      // The scroll offset is current here: the window (read above) changes whenever a row crosses the top
      const firstInView = Math.ceil(I.scrollTop.peek() / cfg.rowHeight);
      const stopIndex = tabStopIndex(
        mounted.map(m => m.row.task.id),
        [focusedId, lastFocusedId],
        mounted.findIndex(m => m.pinnedTop === null && m.row.visibleIndex >= firstInView),
      );
      const stop = mounted[stopIndex];
      // The state box covers the rows: inert, and the header row keeps the list's tab stop
      const covered = G.chartState().kind !== 'ready';
      // The tab stop: a header cell or a cell of the tab-stop row focused last, else that row, else
      // (no row) the first header cell
      const tab = gridTabStop(
        focusSpot(),
        covered ? null : (stop?.row.task.id ?? null),
        cols.map(c => c.key),
      );
      const headStop = tab?.kind === 'head' ? tab.key : null;
      const cellStop = tab?.kind === 'cell' ? cols.findIndex(c => c.key === tab.key) : -1;
      const rowStop = tab?.kind === 'row' ? stop : undefined;
      let stopRowEl: HTMLElement | null = null;

      // A row or button that moves or goes away loses focus: the focus-restore region gives it back
      ctx.focus.capture();

      setAttr(root, 'aria-rowcount', rowCount + 1);
      setAttr(root, 'aria-colcount', cols.length);
      setAttr(root, 'aria-label', labels.ariaTaskList);
      setAttr(root, 'aria-multiselectable', String(cfg.selection.enabled && cfg.selection.multi));

      setStyleProp(head, 'grid-template-columns', grid);
      setStyleProp(head, 'height', `${G.headerHeight()}px`);
      reconcile(
        head,
        cols,
        uniqueKeys((c: VanillaColumnDef) => c.key),
        createHead,
        (el, col, i) => updateHead(el, col, sort, i + 1, col.key === headStop),
      );

      body.inert = covered;
      setStyleProp(top, 'height', `${vw.paddingTop}px`);
      setStyleProp(bottom, 'height', `${vw.paddingBottom}px`);
      reconcile(
        body,
        mounted,
        uniqueKeys((m: MountedRow) => m.row.task.id),
        () => pool.acquire(),
        (el, m) => {
          updateRow(el, m, grid, cfg.rowHeight, selected, hoveredId, styleOf, env, m === rowStop, edit);
          if (m === stop) stopRowEl = el;
        },
        bottom,
        pool.release,
      );
      // Cells are -1 when built: only the previous and the new tab-stop cell change
      const cell =
        cellStop >= 0 ? ((stopRowEl as HTMLElement | null)?.children[cellStop] as HTMLElement | undefined) : undefined;
      if (stopCell && stopCell !== cell) setAttr(stopCell, 'tabindex', -1);
      stopCell = cell ?? null;
      if (stopCell) setAttr(stopCell, 'tabindex', 0);

      // Only under rows (or "Load more" before the first page): the state box covers the others
      const showFooter = !!ds && !!loadState && G.chartState().footer;
      showNode(dom.panel, footer, showFooter);
      if (showFooter && loadState) paintFooter(loadState, labels);
    },
    disconnect() {
      resize.abort();
    },
  };
}
