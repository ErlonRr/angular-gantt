/**
 * @file tasklist.ts
 * Task-list region: the treegrid of the split panel and of the table view, patched in place.
 *
 *   div.gantt-tasklist.gantry-tasklist-container   role=treegrid (the skeleton's container)
 *     div.gantt-tl-col-headers                     role=row: header cells keyed by column key
 *     div.gantt-tl-rows                            role=rowgroup
 *       div (spacer) · rows keyed by task id · div (spacer)
 *     div.gantt-tl-load-more                       attached while a data source is set
 *
 * Rows are keyed by task id, so a row keeps its node (and keyboard focus) across scrolls,
 * selections, sorts and collapses; rows leaving the window go to a pool the next new rows come
 * from. Cells are keyed by column key, and a row's cells are rendered again only when its row,
 * the columns, the cell context, the labels or the indent changed: a scroll or a selection
 * patches the row attributes only. Pinned rows (the focused row kept mounted outside the virtual
 * window) are taken out of the flow and positioned at their row offset (`.gantt-tl-row--pinned`).
 *
 * Keyboard: the list is one tab stop. One mounted row has `tabindex=0`, the others `-1`: the
 * focused row, else the row focused last (while it is mounted), else the first row in view.
 * Moving between rows with the arrow keys (roving focus) comes with the keyboard model.
 *
 * Listeners are delegated: one click / dblclick / keydown on the rows group, one click / keydown
 * / pointerdown on the header row, one click on the footer. Column resizing captures the pointer
 * on the handle (`interaction/column-resize.ts`) and is aborted when the element disconnects.
 *
 * Class names, element order and the class-less inner spans are the paint-snapshot keys and the
 * e2e contract: keep them. Styles shared by every row live in `styles/tasklist.css.ts`; geometry
 * and paints go through the CSSOM.
 */

import {
  computeCellVisual,
  rowPaint,
  themeVar,
  type ColumnContext,
  type GanttFlatRow,
  type GanttLabels,
} from '@gantry/core';
import { h } from '../dom/h';
import { createPool, reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText, toggleClass, type StylableElement } from '../dom/patch';
import type { MountedRow } from '../engine/graph/tasklist';
import type { GanttLoadMoreState, SortState } from '../engine/inputs';
import { createColumnResize } from '../interaction/column-resize';
import type { VanillaColumnDef } from '../types';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/** Rows kept for reuse after leaving the window (a scroll recycles them at the other end). */
const POOL_SIZE = 64;

/** What a row's cells are rendered from: they render again only when one of these changes. */
interface CellEnv {
  readonly cols: readonly VanillaColumnDef[];
  readonly ctx: ColumnContext;
  readonly labels: GanttLabels;
  readonly indent: number;
}

const sameEnv = (a: CellEnv | undefined, b: CellEnv) =>
  a !== undefined && a.cols === b.cols && a.ctx === b.ctx && a.labels === b.labels && a.indent === b.indent;

/** What a row element shows (also how the delegated listeners find the row of an event). */
interface RowState {
  readonly row: GanttFlatRow;
  readonly env: CellEnv;
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

/** Sets several inline style properties through the CSSOM. */
function styles(el: StylableElement, props: Readonly<Record<string, string>>): void {
  for (const [prop, value] of Object.entries(props)) setStyleProp(el, prop, value);
}

function justify(align: VanillaColumnDef['align']): string {
  return align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
}

/**
 * The row that takes the list's tab stop: the first of `preferred` (task ids) that is mounted,
 * else the first row of the window at or below `firstInView` (a visible index), else the first
 * row of the window, else the first mounted row.
 */
function tabStopRow(
  mounted: readonly MountedRow[],
  preferred: readonly (string | null)[],
  firstInView: number,
): MountedRow | undefined {
  for (const id of preferred) {
    const m = id === null ? undefined : mounted.find(r => r.row.task.id === id);
    if (m) return m;
  }
  const windowed = mounted.filter(m => m.pinnedTop === null);
  return windowed.find(m => m.row.visibleIndex >= firstInView) ?? windowed[0] ?? mounted[0];
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
  const footerDone = document.createTextNode('');
  let footerKind: FooterKind | null = null;
  /** The row that held focus last: it keeps the tab stop while mounted, so Tab returns to it */
  let lastFocusedId: string | null = null;
  root.append(head, body);

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

  const toggleCollapsed = (id: string): void => {
    I.collapsedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    ctx.saveState();
  };

  body.addEventListener('click', e => {
    const row = rowOf(e.target);
    if (!row) return;
    if ((e.target as Element).closest('.gantt-collapse-btn')) {
      e.stopPropagation();
      toggleCollapsed(row.task.id);
      return;
    }
    ctx.rowClick(row, e);
  });
  body.addEventListener('dblclick', e => {
    const row = rowOf(e.target);
    if (row) ctx.emit('row-dblclick', row);
  });
  // Enter / Space on a focused row select it like a click (modifiers included)
  body.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = (e.target as Element).classList.contains('gantt-tl-row') ? rowOf(e.target) : undefined;
    if (!row) return;
    e.preventDefault();
    ctx.rowClick(row, e);
  });

  /** The sortable column of the header cell an event happened in. */
  const sortableOf = (target: EventTarget | null): VanillaColumnDef | undefined => {
    const el = (target as Element | null)?.closest?.('.gantt-tl-col-header');
    const col = el ? headParts.get(el)?.col : undefined;
    return col?.sortable ? col : undefined;
  };

  // Cycle a column's sort: ascending → descending → original order
  const sortBy = (key: string): void => {
    I.sort.update(cur => (cur?.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null));
    ctx.saveState();
  };

  head.addEventListener('click', e => {
    // The click that ends a resize belongs to the handle, never to the sort
    if ((e.target as Element).closest('.gantt-col-resize')) {
      e.stopPropagation();
      return;
    }
    const col = sortableOf(e.target);
    if (col && !resize.active()) sortBy(col.key);
  });
  head.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const col = sortableOf(e.target);
    if (!col) return;
    e.preventDefault();
    sortBy(col.key);
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
    const label = h('span');
    styles(label, { overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    const el = h('div', { class: 'gantt-tl-col-header', attrs: { role: 'columnheader' } }, label);
    headParts.set(el, { col: null, label, arrow: null, handle: null });
    return el;
  };

  const updateHead = (el: HTMLElement, col: VanillaColumnDef, sort: SortState | null): void => {
    const p = headParts.get(el)!;
    p.col = col;
    setStyleProp(el, 'justify-content', justify(col.align));
    setText(p.label, col.label);
    setAttr(p.label, 'title', col.label);

    const sortable = !!col.sortable;
    const dir = sortable && sort?.key === col.key ? sort.dir : null;
    setAttr(el, 'aria-sort', sortable ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : null);
    setAttr(el, 'tabindex', sortable ? 0 : null);
    setAttr(el, 'data-focus-key', sortable ? `sort:${col.key}` : null);
    if (sortable) {
      const arrow = (p.arrow ??= h('span', { attrs: { 'aria-hidden': 'true' } }));
      setStyleProp(arrow, 'font-size', '9px');
      if (arrow.parentNode !== el) p.label.after(arrow);
      setStyleProp(arrow, 'color', themeVar(dir ? 'textPrimary' : 'textMuted'));
      setText(arrow, dir === 'desc' ? '▼' : dir === 'asc' ? '▲' : '⇅');
    } else p.arrow?.remove();

    if (col.resizable !== false) {
      const handle = (p.handle ??= h('div', { class: 'gantt-col-resize', attrs: { 'aria-hidden': 'true' } }));
      if (handle.parentNode !== el) el.appendChild(handle);
    } else p.handle?.remove();
  };

  // ── Cells ────────────────────────────────────────────────
  const createCell = (): HTMLElement => h('div', { class: 'gantt-tl-cell', attrs: { role: 'gridcell' } });

  const nameParts = (): CellParts => {
    const pad = h('span');
    styles(pad, { width: '20px', 'flex-shrink': '0' });
    const icon = h('span', { attrs: { 'aria-hidden': 'true' } });
    styles(icon, { 'flex-shrink': '0', 'font-size': '10px' });
    const text = h('span');
    styles(text, { overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    const wrap = h('span', null, pad, icon, text);
    styles(wrap, { display: 'flex', 'align-items': 'center', gap: '4px', overflow: 'hidden', width: '100%' });
    return { kind: 'name', wrap, pad, toggle: null, icon, text };
  };

  const updateCell = (cell: HTMLElement, col: VanillaColumnDef, row: GanttFlatRow, env: CellEnv): void => {
    setStyleProp(cell, 'justify-content', justify(col.align));
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
        ? (p.toggle ??= h('button', { class: 'gantt-collapse-btn', attrs: { type: 'button' } }))
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
      setStyleProp(p.icon, 'color', row.task.barColor ?? themeVar('textMuted'));
      setText(p.icon, row.hasChildren ? '▤' : row.barType === 'milestone' ? '◆' : '▬');
      setStyleProp(p.text, 'font-weight', row.hasChildren ? '600' : '400');
      setStyleProp(p.text, 'color', themeVar(row.hasChildren ? 'textPrimary' : 'textSecondary'));
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

  // ── Rows ─────────────────────────────────────────────────
  const updateRow = (
    el: HTMLElement,
    { row, pinnedTop }: MountedRow,
    grid: string,
    rowHeight: number,
    selected: ReadonlySet<string>,
    env: CellEnv,
    tabStop: boolean,
  ): void => {
    const id = row.task.id;
    const isSelected = selected.has(id);
    setAttr(el, 'data-task-id', id);
    setAttr(el, 'data-focus-key', `row:${id}`);
    setAttr(el, 'tabindex', tabStop ? 0 : -1);
    setAttr(el, 'aria-rowindex', row.visibleIndex + 2);
    setAttr(el, 'aria-level', row.level + 1);
    setAttr(el, 'aria-selected', String(isSelected));
    setAttr(el, 'aria-expanded', row.hasChildren ? String(!row.isCollapsed) : null);
    toggleClass(el, 'gantt-tl-row--selected', isSelected);
    toggleClass(el, 'gantt-tl-row--pinned', pinnedTop !== null);
    setStyleProp(el, 'top', pinnedTop === null ? null : `${pinnedTop}px`);
    setStyleProp(el, 'grid-template-columns', grid);
    setStyleProp(el, 'height', `${rowHeight}px`);
    setStyleProp(el, 'background-color', rowPaint({ row }, isSelected));

    const prev = rowState.get(el);
    if (prev?.row !== row || !sameEnv(prev.env, env)) {
      reconcile(
        el,
        env.cols,
        uniqueKeys((c: VanillaColumnDef) => c.key),
        createCell,
        (cell, col) => updateCell(cell, col, row, env),
      );
    }
    rowState.set(el, { row, env });
  };

  // ── Footer (lazy data source) ────────────────────────────
  // It holds no live region: the element announces failures in its own `.gantt-sr-alert`. Every
  // state keeps an element with `data-focus-key="load-more"`, so focus survives Retry / Load more.
  const paintFooter = (state: GanttLoadMoreState, labels: GanttLabels, rowHeight: number): void => {
    const kind: FooterKind = state.isLoading ? 'loading' : state.error ? 'error' : state.hasMore ? 'more' : 'done';
    setStyleProp(footer, 'height', `${rowHeight}px`);
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
      const sort = I.sort();
      const ds = I.dataSource();
      const loadState = I.loadState();
      const env: CellEnv = { cols, ctx: G.columnCtx(), labels, indent: cfg.indentSize };
      const focusedId = I.focusedRowId();
      if (focusedId !== null) lastFocusedId = focusedId;
      // The scroll offset is current here: the window (read above) changes whenever a row crosses the top
      const firstInView = Math.ceil(I.scrollTop.peek() / cfg.rowHeight);
      const stop = tabStopRow(mounted, [focusedId, lastFocusedId], firstInView);

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
        (el, col) => updateHead(el, col, sort),
      );

      setStyleProp(top, 'height', `${vw.paddingTop}px`);
      setStyleProp(bottom, 'height', `${vw.paddingBottom}px`);
      reconcile(
        body,
        mounted,
        uniqueKeys((m: MountedRow) => m.row.task.id),
        () => pool.acquire(),
        (el, m) => updateRow(el, m, grid, cfg.rowHeight, selected, env, m === stop),
        bottom,
        pool.release,
      );

      showNode(root, footer, !!ds && !!loadState);
      if (ds && loadState) paintFooter(loadState, labels, cfg.rowHeight);
    },
    disconnect() {
      resize.abort();
    },
  };
}
