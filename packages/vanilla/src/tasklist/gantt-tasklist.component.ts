/**
 * @file gantt-tasklist.component.ts
 * Vanilla JS TaskList table grid component with tree expand/collapse,
 * sortable custom columns, virtual rows and an optional load-more footer.
 */

import { GanttFlatRow, GanttTheme, GanttLabels } from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { EventEmitter } from '../core/event-emitter';
import type { SortState } from '../layout/gantt-layout.service';
import type { VanillaColumnDef } from '../types';

export interface GanttLoadMoreState {
  isLoading: boolean;
  hasMore: boolean;
  loadedCount: number;
}

export interface GanttTaskListProps {
  visibleRows: GanttFlatRow[];
  /** Total number of visible rows (for aria-rowcount) */
  rowCount: number;
  columns: VanillaColumnDef[];
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
}

export class GanttTaskListComponent extends BaseComponent<GanttTaskListProps> {
  readonly collapseToggle$ = new EventEmitter<string>();
  readonly rowClick$ = new EventEmitter<{ row: GanttFlatRow; event: MouseEvent }>();
  readonly rowDblClick$ = new EventEmitter<GanttFlatRow>();
  readonly sortColumn$ = new EventEmitter<string>();
  readonly loadMore$ = new EventEmitter<void>();

  constructor(container: HTMLElement, props: GanttTaskListProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const {
      visibleRows, rowCount, columns, rowHeight, selectedIds, theme, labels,
      colHeaderHeight, indentSize, paddingTop, paddingBottom, sort, loadMore,
    } = this.props;

    const visibleColumns = columns.filter(c => c.visible !== false);
    const gridTemplate = visibleColumns.map(c => `${c.width}px`).join(' ');

    this.element.innerHTML = '';
    this.element.className = 'gantt-tasklist';
    this.element.setAttribute('role', 'treegrid');
    this.element.setAttribute('aria-rowcount', String(rowCount + 1));
    this.element.setAttribute('aria-multiselectable', 'true');
    this.element.style.cssText = 'display:flex;flex-direction:column;position:relative;';

    // ── Column headers ───────────────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-tl-col-headers';
    headerRow.setAttribute('role', 'row');
    headerRow.setAttribute('aria-rowindex', '1');
    headerRow.style.cssText = `
      display: grid;
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
        padding: 0 8px;
        display: flex;
        align-items: center;
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
      colEl.appendChild(labelSpan);

      if (col.sortable) {
        const active = sort?.key === col.key ? sort.dir : null;
        colEl.setAttribute('aria-sort', active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none');
        colEl.tabIndex = 0;
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.style.cssText = `font-size:9px;color:${active ? theme.textPrimary : theme.textMuted};`;
        arrow.textContent = active === 'desc' ? '▼' : active === 'asc' ? '▲' : '⇅';
        colEl.appendChild(arrow);
        colEl.addEventListener('click', () => this.sortColumn$.emit(col.key));
        colEl.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.sortColumn$.emit(col.key);
          }
        });
      }

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

      rowEl.addEventListener('click', e => this.rowClick$.emit({ row, event: e }));
      rowEl.addEventListener('dblclick', () => this.rowDblClick$.emit(row));

      for (const col of visibleColumns) {
        const cellEl = document.createElement('div');
        cellEl.className = 'gantt-tl-cell';
        cellEl.setAttribute('role', 'gridcell');
        cellEl.style.cssText = `
          display: flex;
          align-items: center;
          overflow: hidden;
          padding: 0 4px;
          border-right: 1px solid ${theme.borderColor};
          color: ${theme.textPrimary};
        `;

        if (col.cellTemplate) {
          const content = col.cellTemplate(row);
          if (typeof content === 'string') cellEl.textContent = content;
          else cellEl.appendChild(content);
        } else if (col.key === 'name') {
          cellEl.appendChild(this.nameCell(row, theme, labels, indentSize));
        } else {
          const textSpan = document.createElement('span');
          textSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;';
          const raw = col.render ? col.render(row) : (row.task as unknown as Record<string, unknown>)[col.key];
          textSpan.textContent = raw == null ? '' : String(raw);
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

  private nameCell(row: GanttFlatRow, theme: GanttTheme, labels: GanttLabels, indentSize: number): HTMLElement {
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
      btn.setAttribute('aria-expanded', String(!row.isCollapsed));
      btn.setAttribute('aria-label', row.isCollapsed ? labels.ariaExpand(row.task.name) : labels.ariaCollapse(row.task.name));
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
    icon.textContent = row.hasChildren ? '▤' : (row.barType === 'milestone' ? '◆' : '▬');
    wrapper.appendChild(icon);

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: ${row.hasChildren ? '600' : '400'};
      color: ${row.hasChildren ? theme.textPrimary : theme.textSecondary};
    `;
    nameSpan.textContent = row.task.name;
    wrapper.appendChild(nameSpan);
    return wrapper;
  }

  private loadMoreFooter(state: GanttLoadMoreState, theme: GanttTheme, labels: GanttLabels, rowHeight: number): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'gantt-tl-load-more';
    footer.setAttribute('aria-live', 'polite');
    footer.style.cssText = `
      display:flex;align-items:center;justify-content:center;
      height:${rowHeight}px;font-size:12px;color:${theme.textSecondary};
    `;
    if (state.isLoading) {
      footer.textContent = labels.loading;
    } else if (state.hasMore) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = labels.loadMore;
      btn.style.cssText = `
        padding:3px 10px;font-size:12px;border-radius:4px;cursor:pointer;
        border:1px solid ${theme.borderColor};background:${theme.panelBg};color:${theme.textSecondary};
      `;
      btn.addEventListener('click', () => this.loadMore$.emit());
      footer.appendChild(btn);
    } else {
      footer.textContent = labels.allLoaded(state.loadedCount);
    }
    return footer;
  }
}

function spacer(height: number): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.height = `${height}px`;
  return el;
}
