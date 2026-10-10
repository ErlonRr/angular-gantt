/**
 * @file gantt-tasklist.component.ts
 * Vanilla JS TaskList table grid component with tree expand/collapse,
 * sortable custom columns, virtual rows and an optional load-more footer.
 */

import {
  type GanttFlatRow,
  type GanttTheme,
  type GanttLabels,
  computeCellVisual,
  type ColumnContext,
} from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { EventEmitter } from '../core/event-emitter';
import type { SortState } from '../layout/gantt-layout.service';
import type { VanillaColumnDef } from '../types';

export interface GanttLoadMoreState {
  isLoading: boolean;
  hasMore: boolean;
  loadedCount: number;
  /** The last page failed: show the error and a Retry button */
  error?: boolean | undefined;
}

export interface GanttTaskListProps {
  visibleRows: GanttFlatRow[];
  /** Total number of visible rows (for aria-rowcount) */
  rowCount: number;
  /** Columns of the current view, already resolved (`GanttColumnService.columnsFor`) */
  columns: VanillaColumnDef[];
  /** "Now", date reading and task index for status / predecessor cells */
  cellContext: ColumnContext;
  rowHeight: number;
  selectedIds: Set<string>;
  theme: GanttTheme;
  labels: GanttLabels;
  colHeaderHeight: number;
  indentSize: number;
  paddingTop: number;
  paddingBottom: number;
  sort: SortState | null;
  loadMore: GanttLoadMoreState | null;
  /** Full table view (styling only — the columns are already resolved) */
  tableView: boolean;
}

export class GanttTaskListComponent extends BaseComponent<GanttTaskListProps> {
  readonly collapseToggle$ = new EventEmitter<string>();
  readonly rowClick$ = new EventEmitter<{ row: GanttFlatRow; event: MouseEvent | KeyboardEvent }>();
  readonly rowDblClick$ = new EventEmitter<GanttFlatRow>();
  readonly sortColumn$ = new EventEmitter<string>();
  readonly loadMore$ = new EventEmitter<void>();
  readonly retry$ = new EventEmitter<void>();
  /** Live column resize (fires while dragging) */
  readonly columnWidthChange$ = new EventEmitter<{ key: string; width: number }>();
  /** Column resize finished */
  readonly columnResizeEnd$ = new EventEmitter<void>();

  /** Set while a column edge is dragged, so the trailing click doesn't sort */
  private resizing = false;

  constructor(container: HTMLElement, props: GanttTaskListProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const {
      visibleRows,
      rowCount,
      columns,
      rowHeight,
      selectedIds,
      theme,
      labels,
      colHeaderHeight,
      indentSize,
      paddingTop,
      paddingBottom,
      sort,
      loadMore,
      cellContext,
    } = this.props;

    const visibleColumns = columns;
    // One column grows to fill a panel wider than the columns: the `flex` one, else the last
    const flexIdx = visibleColumns.some(c => c.flex)
      ? visibleColumns.findIndex(c => c.flex)
      : visibleColumns.length - 1;
    const gridTemplate = visibleColumns
      .map((c, i) => (i === flexIdx ? `minmax(${c.width}px, 1fr)` : `${c.width}px`))
      .join(' ');

    this.element.innerHTML = '';
    this.element.className = 'gantt-tasklist';
    this.element.setAttribute('role', 'treegrid');
    this.element.setAttribute('aria-rowcount', String(rowCount + 1));
    this.element.setAttribute('aria-colcount', String(visibleColumns.length));
    this.element.setAttribute('aria-label', labels.ariaTaskList);
    this.element.setAttribute('aria-multiselectable', 'true');
    this.element.style.cssText =
      'display:flex;flex-direction:column;position:relative;width:max-content;min-width:100%;';

    // ── Column headers ───────────────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-tl-col-headers';
    headerRow.setAttribute('role', 'row');
    headerRow.setAttribute('aria-rowindex', '1');
    headerRow.style.cssText = `
      display: grid;
      box-sizing: border-box;
      grid-template-columns: ${gridTemplate};
      height: ${colHeaderHeight}px;
      background-color: ${theme.headerBackground};
      border-bottom: 1px solid ${theme.borderColor};
      flex-shrink: 0;
      position: sticky;
      top: 0;
      z-index: 5;
    `;

    for (const col of visibleColumns) {
      const colEl = document.createElement('div');
      colEl.className = 'gantt-tl-col-header';
      colEl.setAttribute('role', 'columnheader');
      colEl.style.cssText = `
        position: relative;
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: ${justify(col.align)};
        gap: 4px;
        overflow: hidden;
        border-right: 1px solid ${theme.borderColor};
        font-weight: 600;
        color: ${theme.textPrimary};
        cursor: ${col.sortable ? 'pointer' : 'default'};
        user-select: none;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      labelSpan.textContent = col.label;
      labelSpan.title = col.label;
      colEl.appendChild(labelSpan);

      if (col.sortable) {
        const active = sort?.key === col.key ? sort.dir : null;
        colEl.setAttribute('aria-sort', active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none');
        colEl.tabIndex = 0;
        colEl.dataset['focusKey'] = `sort:${col.key}`;
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.style.cssText = `font-size:9px;color:${active ? theme.textPrimary : theme.textMuted};`;
        arrow.textContent = active === 'desc' ? '▼' : active === 'asc' ? '▲' : '⇅';
        colEl.appendChild(arrow);
        colEl.addEventListener('click', () => {
          if (!this.resizing) this.sortColumn$.emit(col.key);
        });
        colEl.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.sortColumn$.emit(col.key);
          }
        });
      }

      if (col.resizable !== false) colEl.appendChild(this.resizeHandle(col));
      headerRow.appendChild(colEl);
    }
    this.element.appendChild(headerRow);

    // ── Rows (virtual window between two spacers) ────────────
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'gantt-tl-rows';
    rowsContainer.setAttribute('role', 'rowgroup');
    rowsContainer.style.cssText = 'flex: 1; position: relative;';
    rowsContainer.appendChild(spacer(paddingTop));

    for (const row of visibleRows) {
      const isSelected = selectedIds.has(row.task.id);
      const rowEl = document.createElement('div');
      rowEl.className = `gantt-tl-row${isSelected ? ' gantt-tl-row--selected' : ''}`;
      rowEl.dataset['taskId'] = row.task.id;
      rowEl.setAttribute('role', 'row');
      rowEl.setAttribute('aria-rowindex', String(row.visibleIndex + 2));
      rowEl.setAttribute('aria-level', String(row.level + 1));
      rowEl.setAttribute('aria-selected', String(isSelected));
      if (row.hasChildren) rowEl.setAttribute('aria-expanded', String(!row.isCollapsed));
      rowEl.style.cssText = `
        display: grid;
        grid-template-columns: ${gridTemplate};
        height: ${rowHeight}px;
        box-sizing: border-box;
        background-color: ${isSelected ? theme.selectionBg : (row.task.rowColor ?? (row.visibleIndex % 2 === 0 ? theme.rowBg : theme.rowBgAlt))};
        border-bottom: 1px solid ${theme.borderColor};
        cursor: pointer;
      `;

      rowEl.tabIndex = -1;
      rowEl.dataset['focusKey'] = `row:${row.task.id}`;
      rowEl.addEventListener('click', e => this.rowClick$.emit({ row, event: e }));
      // Enter / Space on a focused row select it like a click (modifiers included)
      rowEl.addEventListener('keydown', e => {
        if (e.target !== rowEl || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        this.rowClick$.emit({ row, event: e });
      });
      rowEl.addEventListener('dblclick', () => this.rowDblClick$.emit(row));

      for (const col of visibleColumns) {
        const cellEl = document.createElement('div');
        cellEl.className = 'gantt-tl-cell';
        cellEl.setAttribute('role', 'gridcell');
        cellEl.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: ${justify(col.align)};
          overflow: hidden;
          padding: 0 8px;
          border-right: 1px solid ${theme.borderColor};
          color: ${theme.textPrimary};
        `;

        if (col.cellTemplate) {
          const content = col.cellTemplate(row, cellContext);
          if (typeof content === 'string') cellEl.textContent = content;
          else cellEl.appendChild(content);
        } else if (col.key === 'name') {
          // A consumer `render` on the name column changes the text, keeping indent and toggle
          const text = !col.builtin && col.render ? col.render(row, cellContext) : row.task.name;
          cellEl.appendChild(this.nameCell(row, theme, labels, indentSize, text));
        } else {
          const cell = computeCellVisual(col, row, cellContext, theme);
          if (cell.status) {
            cellEl.dataset['status'] = cell.status;
            const dot = document.createElement('span');
            dot.className = 'gantt-tl-status-dot';
            dot.setAttribute('aria-hidden', 'true');
            dot.style.cssText = `flex-shrink:0;width:8px;height:8px;border-radius:50%;margin-inline-end:6px;background:${cell.dotColor};`;
            cellEl.appendChild(dot);
          }
          const textSpan = document.createElement('span');
          textSpan.className = 'gantt-tl-ellipsis';
          textSpan.style.cssText = `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:${col.align ?? 'start'};`;
          textSpan.textContent = cell.text;
          if (cell.title) cellEl.title = cell.title;
          cellEl.appendChild(textSpan);
        }

        rowEl.appendChild(cellEl);
      }

      rowsContainer.appendChild(rowEl);
    }

    rowsContainer.appendChild(spacer(paddingBottom));
    this.element.appendChild(rowsContainer);

    // ── Load-more footer (lazy data source) ──────────────────
    if (loadMore) this.element.appendChild(this.loadMoreFooter(loadMore, theme, labels, rowHeight));
  }

  /** Drag handle on the column's right border. */
  private resizeHandle(col: VanillaColumnDef): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'gantt-col-resize';
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('click', e => e.stopPropagation());
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = col.width;
      this.resizing = true;
      // Listen on window: the list re-renders while resizing, replacing this handle
      const move = (ev: PointerEvent) => {
        const width = Math.round(
          Math.min(col.maxWidth ?? 800, Math.max(col.minWidth ?? 40, startWidth + ev.clientX - startX)),
        );
        this.columnWidthChange$.emit({ key: col.key, width });
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        this.columnResizeEnd$.emit();
        // let the click that follows pointerup see `resizing`
        setTimeout(() => {
          this.resizing = false;
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
    return handle;
  }

  private nameCell(
    row: GanttFlatRow,
    theme: GanttTheme,
    labels: GanttLabels,
    indentSize: number,
    text: string,
  ): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding-left: ${row.level * indentSize}px;
      overflow: hidden;
      width: 100%;
    `;

    if (row.hasChildren) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gantt-collapse-btn';
      btn.dataset['focusKey'] = `collapse:${row.task.id}`;
      btn.setAttribute('aria-expanded', String(!row.isCollapsed));
      btn.setAttribute(
        'aria-label',
        row.isCollapsed ? labels.ariaExpand(row.task.name) : labels.ariaCollapse(row.task.name),
      );
      btn.style.cssText = `
        flex-shrink: 0;
        border: none;
        background: transparent;
        color: ${theme.textSecondary};
        cursor: pointer;
        font-size: 10px;
        width: 20px;
        padding: 0;
      `;
      btn.textContent = row.isCollapsed ? '▶' : '▼';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.collapseToggle$.emit(row.task.id);
      });
      wrapper.appendChild(btn);
    } else {
      const pad = document.createElement('span');
      pad.style.cssText = 'width: 20px; flex-shrink: 0;';
      wrapper.appendChild(pad);
    }

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = `flex-shrink: 0; font-size: 10px; color: ${row.task.barColor ?? theme.textMuted};`;
    icon.textContent = row.hasChildren ? '▤' : row.barType === 'milestone' ? '◆' : '▬';
    wrapper.appendChild(icon);

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: ${row.hasChildren ? '600' : '400'};
      color: ${row.hasChildren ? theme.textPrimary : theme.textSecondary};
    `;
    nameSpan.textContent = text;
    wrapper.appendChild(nameSpan);
    return wrapper;
  }

  /**
   * Footer under the rows. It is rebuilt with the list, so it holds no live region (the
   * element announces failures in its own `.gantt-sr-alert`); every state keeps an element
   * with `data-focus-key="load-more"` so keyboard focus survives Retry / Load more.
   */
  private loadMoreFooter(
    state: GanttLoadMoreState,
    theme: GanttTheme,
    labels: GanttLabels,
    rowHeight: number,
  ): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'gantt-tl-load-more';
    footer.style.cssText = `
      display:flex;align-items:center;justify-content:center;gap:8px;
      height:${rowHeight}px;font-size:12px;color:${theme.textSecondary};
    `;
    const button = (text: string, onClick: (() => void) | null) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gantt-load-more-btn';
      btn.dataset['focusKey'] = 'load-more';
      btn.textContent = text;
      btn.style.cssText = `
        padding:3px 10px;font-size:12px;border-radius:4px;cursor:${onClick ? 'pointer' : 'default'};
        border:1px solid ${theme.borderColor};background:${theme.panelBg};color:${theme.textSecondary};
      `;
      if (onClick) btn.addEventListener('click', onClick);
      else btn.setAttribute('aria-disabled', 'true');
      return btn;
    };
    if (state.isLoading) {
      footer.setAttribute('aria-busy', 'true');
      footer.appendChild(button(labels.loading, null));
    } else if (state.error) {
      const box = document.createElement('div');
      box.className = 'gantt-load-error';
      box.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const msg = document.createElement('span');
      msg.textContent = labels.loadError;
      box.append(
        msg,
        button(labels.retry, () => this.retry$.emit()),
      );
      footer.appendChild(box);
    } else if (state.hasMore) {
      footer.appendChild(button(labels.loadMore, () => this.loadMore$.emit()));
    } else {
      footer.tabIndex = -1;
      footer.dataset['focusKey'] = 'load-more';
      footer.textContent = labels.allLoaded(state.loadedCount);
    }
    return footer;
  }
}

function justify(align: VanillaColumnDef['align']): string {
  return align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
}

function spacer(height: number): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.height = `${height}px`;
  return el;
}
