/**
 * @file gantt-tasklist.component.ts
 * Vanilla JS TaskList table grid component with tree expand/collapse, custom columns, and virtual rows.
 */

import { GanttFlatRow, ColumnDef, GanttTheme } from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { EventEmitter } from '../core/event-emitter';

export interface GanttTaskListProps {
  visibleRows: GanttFlatRow[];
  columns: ColumnDef[];
  rowHeight: number;
  selectedIds: Set<string>;
  theme: GanttTheme;
  colHeaderHeight: number;
  indentSize: number;
  paddingTop: number;
  paddingBottom: number;
}

export class GanttTaskListComponent extends BaseComponent<GanttTaskListProps> {
  readonly collapseToggle$ = new EventEmitter<string>();
  readonly rowClick$ = new EventEmitter<{ row: GanttFlatRow; event: MouseEvent }>();
  readonly rowDblClick$ = new EventEmitter<GanttFlatRow>();
  readonly panelWidthChange$ = new EventEmitter<number>();
  readonly columnWidthChange$ = new EventEmitter<{ key: string; width: number }>();

  constructor(container: HTMLElement, props: GanttTaskListProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const {
      visibleRows, columns, rowHeight, selectedIds, theme,
      colHeaderHeight, indentSize, paddingTop, paddingBottom
    } = this.props;

    const visibleColumns = columns.filter(c => c.visible !== false);
    const gridTemplate = visibleColumns.map(c => `${c.width}px`).join(' ');

    this.element.innerHTML = '';
    this.element.className = 'gantt-tasklist';
    this.element.style.cssText = `
      display: flex;
      flex-direction: column;
      overflow: visible;
      position: relative;
    `;

    // Column Headers Row
    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-tl-col-headers';
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

    visibleColumns.forEach(col => {
      const colEl = document.createElement('div');
      colEl.className = 'gantt-tl-col-header';
      colEl.style.cssText = `
        padding: 0 8px;
        display: flex;
        align-items: center;
        overflow: hidden;
        border-right: 1px solid ${theme.borderColor};
        font-size: ${theme.fontSize};
        font-family: ${theme.fontFamily};
        font-weight: 600;
        color: ${theme.textPrimary};
      `;

      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      labelSpan.textContent = col.label;
      colEl.appendChild(labelSpan);

      headerRow.appendChild(colEl);
    });

    this.element.appendChild(headerRow);

    // Rows Container
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'gantt-tl-rows';
    rowsContainer.style.cssText = 'flex: 1; position: relative;';

    // Top Spacer
    const topSpacer = document.createElement('div');
    topSpacer.style.height = `${paddingTop}px`;
    rowsContainer.appendChild(topSpacer);

    // Virtual Rows
    visibleRows.forEach(row => {
      const isSelected = selectedIds.has(row.task.id);
      const rowEl = document.createElement('div');
      rowEl.className = `gantt-tl-row ${isSelected ? 'gantt-tl-row--selected' : ''}`;
      rowEl.style.cssText = `
        display: grid;
        grid-template-columns: ${gridTemplate};
        height: ${rowHeight}px;
        background-color: ${isSelected ? theme.selectionBg : (row.task.rowColor ?? theme.rowBg)};
        border-bottom: 1px solid ${theme.borderColor};
        cursor: pointer;
      `;

      rowEl.addEventListener('click', (e) => this.rowClick$.emit({ row, event: e }));
      rowEl.addEventListener('dblclick', () => this.rowDblClick$.emit(row));

      visibleColumns.forEach(col => {
        const cellEl = document.createElement('div');
        cellEl.className = 'gantt-tl-cell';
        cellEl.style.cssText = `
          display: flex;
          align-items: center;
          overflow: hidden;
          padding: 0 4px;
          border-right: 1px solid ${theme.borderColor};
          font-size: ${theme.fontSize};
          font-family: ${theme.fontFamily};
          color: ${theme.textPrimary};
        `;

        if (col.key === 'name') {
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
            btn.style.cssText = `
              flex-shrink: 0;
              border: none;
              background: transparent;
              color: ${theme.textSecondary};
              cursor: pointer;
              font-size: 12px;
              width: 20px;
            `;
            btn.textContent = row.isCollapsed ? '▶' : '▼';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.collapseToggle$.emit(row.task.id);
            });
            wrapper.appendChild(btn);
          } else {
            const spacer = document.createElement('span');
            spacer.style.cssText = 'width: 20px; flex-shrink: 0;';
            wrapper.appendChild(spacer);
          }

          const icon = document.createElement('span');
          icon.style.cssText = `flex-shrink: 0; font-size: 10px; color: ${theme.textMuted};`;
          icon.textContent = row.hasChildren ? '📁' : (row.barType === 'milestone' ? '◆' : '▬');
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

          cellEl.appendChild(wrapper);
        } else {
          const textSpan = document.createElement('span');
          textSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;';
          textSpan.textContent = col.render ? col.render(row) : (row.task as any)[col.key] ?? '';
          cellEl.appendChild(textSpan);
        }

        rowEl.appendChild(cellEl);
      });

      rowsContainer.appendChild(rowEl);
    });

    // Bottom Spacer
    const bottomSpacer = document.createElement('div');
    bottomSpacer.style.height = `${paddingBottom}px`;
    rowsContainer.appendChild(bottomSpacer);

    this.element.appendChild(rowsContainer);
  }
}
