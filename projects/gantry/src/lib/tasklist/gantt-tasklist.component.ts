// ─────────────────────────────────────────────────────────────
//  gantry · tasklist/gantt-tasklist.component.ts
//
//  Left panel of the Gantt chart.
//
//  Layout (three ng-content named slots):
//
//  ┌─────────────────────────────────┐
//  │  <ng-content select="[tlHeader]">│  ← consumer custom header
//  ├─────────────────────────────────┤
//  │  Column headers row             │  ← built-in, from ColumnDef[]
//  ├─────────────────────────────────┤
//  │  Row 0 │ ▼  Project Alpha       │  ← task rows (virtual scrolled)
//  │  Row 1 │    ├─ Task 1.1         │
//  │  Row 2 │    └─ Task 1.2         │
//  │  ...                            │
//  ├─────────────────────────────────┤
//  │  <ng-content select="[tlFooter]">│  ← consumer custom footer
//  └─────────────────────────────────┘
//
//  The resize handle on the right border lets consumers drag
//  to adjust the panel width. The new width is emitted via
//  `panelWidthChange` output.
//
//  Scroll is handled externally by GanttScrollService (step 11).
//  This component only renders rows — it does NOT own scroll state.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { GanttFlatRow, ColumnDef, GanttTheme } from '../types';
import { buildColumnContext, computeCellVisual, type CellVisual, type ColumnContext } from '@gantry/core';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'gantt-tasklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    'class':              'gantt-tasklist',
    'role':               'treegrid',
    'aria-multiselectable': 'true',
    '[attr.aria-rowcount]': 'rowCount() + 1',
    '[attr.aria-colcount]': 'visibleColumns().length',
    '[attr.aria-label]':    'i18n.labels().ariaTaskList',
    '[style.display]':    '"flex"',
    '[style.flex-direction]': '"column"',
    // overflow:visible so the sticky column header anchors to the outer
    // scrollport (the panel in GantryComponent), not to this host.
    '[style.overflow]':   '"visible"',
    '[style.position]':   '"relative"',
    // As wide as the columns (the panel scrolls horizontally), at least the panel
    '[style.width]':      '"max-content"',
    '[style.min-width]':  '"100%"',
    '[style.user-select]': 'resizingCol() ? "none" : null',
  },
  template: `
    <!-- ── Custom header slot ─────────────────────────────── -->
    <div class="gantt-tl-header-slot">
      <ng-content select="[tlHeader]" />
    </div>

    <!-- ── Column header row ──────────────────────────────── -->
    <div
      class="gantt-tl-col-headers"
      role="row"
      aria-rowindex="1"
      [style.grid-template-columns]="gridTemplate()"
      [style.height.px]="colHeaderHeight()"
      [style.background-color]="theme().headerBackground"
      [style.border-bottom]="'1px solid ' + theme().borderColor"
    >
      @for (col of visibleColumns(); track col.key) {
        <div
          class="gantt-tl-col-header"
          role="columnheader"
          [style.justify-content]="justify(col.align)"
          [style.border-right]="'1px solid ' + theme().borderColor"
          [style.color]="theme().textPrimary"
          [style.cursor]="col.sortable ? 'pointer' : 'default'"
          [attr.aria-sort]="col.sortable ? ariaSort(col.key) : null"
          [attr.tabindex]="col.sortable ? 0 : null"
          (click)="onHeaderClick(col)"
          (keydown.enter)="col.sortable && sortColumn.emit(col.key)"
          (keydown.space)="$event.preventDefault(); col.sortable && sortColumn.emit(col.key)"
        >
          <span class="gantt-tl-ellipsis" [attr.title]="col.label">{{ col.label }}</span>
          @if (col.sortable) {
            <span
              aria-hidden="true"
              [style.font-size.px]="9"
              [style.color]="sort()?.key === col.key ? theme().textPrimary : theme().textMuted"
            >{{ sortIcon(col.key) }}</span>
          }
          @if (col.resizable !== false) {
            <div class="gantt-col-resize" aria-hidden="true"
              (click)="$event.stopPropagation()"
              (pointerdown)="onColResizeStart($event, col)"></div>
          }
        </div>
      }
    </div>

    <!-- ── Task rows ──────────────────────────────────────── -->
    <div class="gantt-tl-rows" role="rowgroup">
      <!-- Spacer top (virtual scroll) -->
      <div aria-hidden="true" [style.height.px]="paddingTop()"></div>

      @for (row of visibleRows(); track row.task.id) {
        <div
          class="gantt-tl-row"
          role="row"
          [class.gantt-tl-row--selected]="isSelected(row)"
          [class.gantt-tl-row--group]="row.hasChildren"
          [attr.data-task-id]="row.task.id"
          [attr.aria-rowindex]="row.visibleIndex + 2"
          [attr.aria-level]="row.level + 1"
          [attr.aria-selected]="isSelected(row)"
          [attr.aria-expanded]="row.hasChildren ? !row.isCollapsed : null"
          [style.grid-template-columns]="gridTemplate()"
          [style.height.px]="rowHeight()"
          [style.background-color]="rowBg(row)"
          [style.border-bottom]="'1px solid ' + theme().borderColor"
          (click)="onRowClick($event, row)"
          (dblclick)="rowDblClick.emit(row)"
        >
          @for (col of visibleColumns(); track col.key) {
            @let cell = cellVisual(col, row);
            <div
              class="gantt-tl-cell"
              role="gridcell"
              [attr.data-status]="cell?.status ?? null"
              [attr.title]="cell?.title ?? null"
              [style.justify-content]="justify(col.align)"
              [style.border-right]="'1px solid ' + theme().borderColor"
              [style.color]="theme().textPrimary"
            >
              @if (col.cellTemplate) {
                <!-- Custom cell via <ng-template ganttColumn> -->
                <ng-container
                  *ngTemplateOutlet="col.cellTemplate; context: { $implicit: row, row: row, ctx: ctx() }"
                />
              } @else if (col.key === 'name') {
                <!-- Name cell: indent + collapse toggle + text -->
                <span class="gantt-tl-name" [style.padding-left.px]="row.level * indentSize()">
                  @if (row.hasChildren) {
                    <button
                      type="button"
                      class="gantt-collapse-btn"
                      [style.color]="theme().textSecondary"
                      [attr.aria-expanded]="!row.isCollapsed"
                      [attr.aria-label]="collapseAriaLabel(row)"
                      (click)="onCollapseClick($event, row)"
                    >{{ row.isCollapsed ? '▶' : '▼' }}</button>
                  } @else {
                    <!-- Leaf indent spacer (width matches the collapse control) -->
                    <span [style.width.px]="COLLAPSE_TARGET_PX" [style.flex-shrink]="'0'"></span>
                  }
                  <span aria-hidden="true" [style.flex-shrink]="'0'" [style.font-size]="'10px'"
                    [style.color]="row.task.barColor ?? theme().textMuted">{{ taskIcon(row) }}</span>
                  <span class="gantt-tl-ellipsis"
                    [style.font-weight]="row.hasChildren ? '600' : '400'"
                    [style.color]="row.hasChildren ? theme().textPrimary : theme().textSecondary"
                  >{{ nameText(col, row) }}</span>
                </span>
              } @else {
                <!-- Regular cell: ColumnDef.render(), else the task field -->
                @if (cell?.status) {
                  <span class="gantt-tl-status-dot" aria-hidden="true" [style.background]="cell?.dotColor"></span>
                }
                <span class="gantt-tl-ellipsis" [style.text-align]="col.align ?? 'start'"
                  [style.color]="theme().textSecondary">{{ cell?.text }}</span>
              }
            </div>
          }
        </div>
      }

      <!-- Spacer bottom (virtual scroll) -->
      <div aria-hidden="true" [style.height.px]="paddingBottom()"></div>
    </div>

    <!-- ── Custom footer slot ─────────────────────────────── -->
    <div class="gantt-tl-footer-slot">
      <ng-content select="[tlFooter]" />
    </div>
  `,
  styles: [`
    :host { box-sizing: border-box; }
    .gantt-tl-status-dot {
      flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: 6px;
    }

    .gantt-tl-col-headers {
      display: grid;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      z-index: 5;
      box-sizing: border-box;
    }
    .gantt-tl-col-header {
      position: relative;
      padding: 0 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;
      font-weight: 600;
      user-select: none;
    }
    .gantt-tl-rows { flex: 1; position: relative; }
    .gantt-tl-row {
      display: grid;
      box-sizing: border-box;
      cursor: default;
      transition: background-color 0.1s;
    }
    .gantt-tl-row:hover { filter: brightness(0.96); }
    .gantt-tl-row--selected { box-shadow: inset 3px 0 0 var(--gantt-sel-border, #2563EB); }
    .gantt-tl-cell {
      display: flex;
      align-items: center;
      overflow: hidden;
      padding: 0 8px;
      box-sizing: border-box;
    }
    .gantt-tl-name { display: flex; align-items: center; gap: 4px; overflow: hidden; width: 100%; }
    .gantt-tl-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gantt-col-resize {
      position: absolute; top: 0; right: -3px; width: 6px; height: 100%;
      cursor: col-resize; z-index: 2; touch-action: none;
    }
    .gantt-col-resize:hover { background: var(--gantt-sel-border, #2563EB); opacity: .6; }
    /* WCAG 2.2 — 2.5.8 Target Size (Minimum): pointer target ≥ 24×24 CSS px (Level AA). */
    .gantt-collapse-btn {
      box-sizing: border-box;
      min-width: 24px;
      min-height: 24px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      font-size: 10px;
      line-height: 1;
      cursor: pointer;
      touch-action: manipulation;
    }
    .gantt-collapse-btn:hover { opacity: 0.75; }
    .gantt-collapse-btn:focus-visible {
      outline: 2px solid var(--gantt-sel-border, #2563EB);
      outline-offset: 2px;
    }
  `],
})
export class GanttTaskListComponent {
  /** Matches .gantt-collapse-btn min width — leaf spacer alignment */
  protected readonly COLLAPSE_TARGET_PX = 24;

  // ── Inputs ────────────────────────────────────────────────
  readonly visibleRows    = input.required<GanttFlatRow[]>();
  readonly columns        = input.required<ColumnDef[]>();
  readonly rowCount       = input<number>(0);
  readonly rowHeight      = input<number>(32);
  readonly selectedIds    = input<Set<string>>(new Set());
  readonly theme          = input.required<GanttTheme>();
  readonly colHeaderHeight = input<number>(32);
  readonly indentSize     = input<number>(16);
  readonly paddingTop     = input<number>(0);
  readonly paddingBottom  = input<number>(0);
  readonly sort           = input<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  /** Full table view (styling only — `columns` are already resolved for the view) */
  readonly tableView      = input<boolean>(false);
  /** "Now", date reading and task index for status / predecessor cells */
  readonly cellContext    = input<ColumnContext | null>(null);

  // ── Outputs ───────────────────────────────────────────────
  readonly collapseToggle    = output<string>();          // taskId
  readonly rowClick          = output<{ row: GanttFlatRow; event: MouseEvent }>();
  readonly rowDblClick       = output<GanttFlatRow>();
  /** @deprecated The panel is resized with the splitter in GantryComponent */
  readonly panelWidthChange  = output<number>();
  /** Live column resize (while dragging the header edge) */
  readonly columnWidthChange = output<{ key: string; width: number }>();
  /** Column resize finished */
  readonly columnResizeEnd   = output<void>();
  readonly sortColumn        = output<string>();

  // ── Internal state ────────────────────────────────────────
  /** Key of the column being resized (the trailing click must not sort) */
  protected readonly resizingCol = signal<string | null>(null);

  protected readonly i18n = inject(GanttI18nService);

  protected ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    const s = this.sort();
    return s?.key !== key ? 'none' : s.dir === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: string): string {
    const s = this.sort();
    return s?.key !== key ? '⇅' : s.dir === 'asc' ? '▲' : '▼';
  }

  protected justify(align: ColumnDef['align']): string {
    return align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
  }

  // ── Derived ───────────────────────────────────────────────
  /** The columns of the current view (resolved by GantryComponent via `GanttColumnService.columnsFor`) */
  protected readonly visibleColumns = computed(() => this.columns());

  protected readonly ctx = computed<ColumnContext>(() =>
    this.cellContext() ?? buildColumnContext({ tasks: [], now: new Date() }));

  /** One column grows to fill a panel wider than the columns: the `flex` one, else the last */
  protected readonly gridTemplate = computed(() => {
    const cols = this.visibleColumns();
    const flexIdx = cols.some(c => c.flex) ? cols.findIndex(c => c.flex) : cols.length - 1;
    return cols.map((c, i) => (i === flexIdx ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(' ');
  });

  // ── Row utilities ─────────────────────────────────────────
  protected isSelected(row: GanttFlatRow): boolean {
    return this.selectedIds().has(row.task.id);
  }

  /** Same zebra striping as the timeline rows */
  protected rowBg(row: GanttFlatRow): string {
    const theme = this.theme();
    if (this.isSelected(row)) return theme.selectionBg;
    return row.task.rowColor ?? (row.visibleIndex % 2 === 0 ? theme.rowBg : theme.rowBgAlt);
  }

  protected taskIcon(row: GanttFlatRow): string {
    if (row.hasChildren) return '▤';
    if (row.barType === 'milestone') return '◆';
    return '▬';
  }

  /** Name cell text: a consumer `render` on the name column changes it (indent and toggle stay) */
  protected nameText(col: ColumnDef, row: GanttFlatRow): string {
    return !col.builtin && col.render ? col.render(row, this.ctx()) : row.task.name;
  }

  /** Text (and status dot / title) of a regular cell — null for the name and template cells */
  protected cellVisual(col: ColumnDef, row: GanttFlatRow): CellVisual | null {
    if (col.cellTemplate || col.key === 'name') return null;
    return computeCellVisual(col, row, this.ctx(), this.theme());
  }

  // ── Collapse toggle ───────────────────────────────────────
  protected collapseAriaLabel(row: GanttFlatRow): string {
    const lbl = this.i18n.labels();
    return row.isCollapsed ? lbl.ariaExpand(row.task.name) : lbl.ariaCollapse(row.task.name);
  }

  protected onCollapseClick(event: MouseEvent, row: GanttFlatRow): void {
    event.stopPropagation();
    this.collapseToggle.emit(row.task.id);
  }

  // ── Row click (selection) ─────────────────────────────────
  protected onRowClick(event: MouseEvent, row: GanttFlatRow): void {
    this.rowClick.emit({ row, event });
  }

  protected onHeaderClick(col: ColumnDef): void {
    if (col.sortable && !this.resizingCol()) this.sortColumn.emit(col.key);
  }

  // ── Column resize ─────────────────────────────────────────
  protected onColResizeStart(event: PointerEvent, col: ColumnDef): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = col.width;
    this.resizingCol.set(col.key);

    // Listen on window: the header re-renders while resizing
    const onMove = (e: PointerEvent) => {
      const width = Math.round(Math.min(col.maxWidth ?? 800, Math.max(col.minWidth ?? 40, startWidth + e.clientX - startX)));
      this.columnWidthChange.emit({ key: col.key, width });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.columnResizeEnd.emit();
      // Let the click that follows pointerup see `resizingCol`
      setTimeout(() => this.resizingCol.set(null));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
}
