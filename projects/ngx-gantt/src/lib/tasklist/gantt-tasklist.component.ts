// ─────────────────────────────────────────────────────────────
//  ngx-gantt · tasklist/gantt-tasklist.component.ts
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
  ElementRef,
  inject,
  viewChild,
  HostListener,
} from '@angular/core';

import { GanttFlatRow, ColumnDef, GanttTheme } from '../types';

@Component({
  selector: 'gantt-tasklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class':              'gantt-tasklist',
    '[style.display]':    '"flex"',
    '[style.flex-direction]': '"column"',
    '[style.overflow]':   '"hidden"',
    '[style.position]':   '"relative"',
    '[style.user-select]': 'isResizing() ? "none" : "auto"',
    '[style.background-color]': 'theme().panelBg',
    '[style.border-right]': '"1px solid " + theme().panelBorder',
  },
  template: `
    <!-- ── Custom header slot ─────────────────────────────── -->
    <div class="gantt-tl-header-slot">
      <ng-content select="[tlHeader]" />
    </div>

    <!-- ── Column header row ──────────────────────────────── -->
    <div
      class="gantt-tl-col-headers"
      [style.display]="'grid'"
      [style.grid-template-columns]="gridTemplate()"
      [style.height.px]="colHeaderHeight()"
      [style.background-color]="theme().headerBackground"
      [style.border-bottom]="'1px solid ' + theme().borderColor"
      [style.flex-shrink]="'0'"
      [style.position]="'sticky'"
      [style.top]="'0'"
      [style.z-index]="'5'"
    >
      @for (col of visibleColumns(); track col.key) {
        <div
          class="gantt-tl-col-header"
          [style.padding]="'0 8px'"
          [style.display]="'flex'"
          [style.align-items]="'center'"
          [style.overflow]="'hidden'"
          [style.border-right]="'1px solid ' + theme().borderColor"
          [style.font-size]="theme().fontSize"
          [style.font-family]="theme().fontFamily"
          [style.font-weight]="'600'"
          [style.color]="theme().textPrimary"
          [style.cursor]="col.sortable ? 'pointer' : 'default'"
          (click)="col.sortable && sortColumn.emit(col.key)"
        >
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{ col.label }}
          </span>
          <!-- Column resize handle -->
          <div
            class="gantt-col-resize-handle"
            [style.width]="'4px'"
            [style.flex-shrink]="'0'"
            [style.margin-left]="'auto'"
            [style.cursor]="'col-resize'"
            [style.height]="'100%'"
            [style.opacity]="'0'"
            (pointerdown)="onColResizeStart($event, col)"
            style="touch-action: none;"
          ></div>
        </div>
      }
    </div>

    <!-- ── Task rows ──────────────────────────────────────── -->
    <div
      #rowsContainer
      class="gantt-tl-rows"
      [style.flex]="'1'"
      [style.overflow-y]="'hidden'"
      [style.overflow-x]="'hidden'"
      [style.position]="'relative'"
    >
      <!-- Spacer top (virtual scroll) -->
      <div [style.height.px]="paddingTop()"></div>

      @for (row of visibleRows(); track row.task.id) {
        <div
          class="gantt-tl-row"
          [class.gantt-tl-row--selected]="isSelected(row)"
          [class.gantt-tl-row--group]="row.hasChildren"
          [style.display]="'grid'"
          [style.grid-template-columns]="gridTemplate()"
          [style.height.px]="rowHeight()"
          [style.background-color]="rowBg(row)"
          [style.border-bottom]="'1px solid ' + theme().borderColor"
          (click)="onRowClick($event, row)"
          (dblclick)="rowDblClick.emit(row)"
        >
          @for (col of visibleColumns(); track col.key) {
            <div
              class="gantt-tl-cell"
              [style.display]="'flex'"
              [style.align-items]="'center'"
              [style.overflow]="'hidden'"
              [style.padding]="'0 4px'"
              [style.border-right]="'1px solid ' + theme().borderColor"
              [style.font-size]="theme().fontSize"
              [style.font-family]="theme().fontFamily"
              [style.color]="theme().textPrimary"
            >
              @if (col.key === 'name') {
                <!-- Name cell: indent + collapse toggle + text -->
                <span
                  [style.display]="'flex'"
                  [style.align-items]="'center'"
                  [style.gap]="'4px'"
                  [style.padding-left.px]="row.level * indentSize()"
                  [style.overflow]="'hidden'"
                  [style.width]="'100%'"
                >
                  <!-- Collapse toggle -->
                  @if (row.hasChildren) {
                    <button
                      type="button"
                      class="gantt-collapse-btn"
                      [style.flex-shrink]="'0'"
                      [style.border]="'none'"
                      [style.background]="'transparent'"
                      [style.color]="theme().textSecondary"
                      [attr.aria-expanded]="!row.isCollapsed"
                      [attr.aria-label]="collapseAriaLabel(row)"
                      (click)="onCollapseClick($event, row)"
                      animate.enter="collapse-btn-enter"
                    >
                      {{ row.isCollapsed ? '▶' : '▼' }}
                    </button>
                  } @else {
                    <!-- Leaf indent spacer (width matches collapse control column) -->
                    <span [style.width.px]="COLLAPSE_TARGET_PX" [style.flex-shrink]="'0'"></span>
                  }

                  <!-- Task type icon -->
                  <span
                    [style.flex-shrink]="'0'"
                    [style.font-size]="'10px'"
                    [style.color]="theme().textMuted"
                  >{{ taskIcon(row) }}</span>

                  <!-- Task name -->
                  <span
                    [style.overflow]="'hidden'"
                    [style.text-overflow]="'ellipsis'"
                    [style.white-space]="'nowrap'"
                    [style.font-weight]="row.hasChildren ? '600' : '400'"
                    [style.color]="row.hasChildren ? theme().textPrimary : theme().textSecondary"
                  >{{ row.task.name }}</span>
                </span>
              } @else {
                <!-- Regular cell via ColumnDef.render() -->
                <span
                  [style.overflow]="'hidden'"
                  [style.text-overflow]="'ellipsis'"
                  [style.white-space]="'nowrap'"
                  [style.width]="'100%'"
                  [style.color]="theme().textSecondary"
                >{{ renderCell(col, row) }}</span>
              }
            </div>
          }
        </div>
      }

      <!-- Spacer bottom (virtual scroll) -->
      <div [style.height.px]="paddingBottom()"></div>
    </div>

    <!-- ── Custom footer slot ─────────────────────────────── -->
    <div class="gantt-tl-footer-slot">
      <ng-content select="[tlFooter]" />
    </div>

    <!-- ── Panel resize handle (right edge) ───────────────── -->
    <div
      class="gantt-panel-resize-handle"
      [style.position]="'absolute'"
      [style.top]="'0'"
      [style.right]="'0'"
      [style.width]="'5px'"
      [style.height]="'100%'"
      [style.cursor]="'col-resize'"
      [style.background]="isResizing() ? theme().todayColor : 'transparent'"
      [style.z-index]="'20'"
      [style.touch-action]="'none'"
      (pointerdown)="onPanelResizeStart($event)"
    ></div>
  `,
  styles: [`
    :host { box-sizing: border-box; }

    .gantt-tl-row {
      cursor: default;
      transition: background-color 0.1s;
    }
    .gantt-tl-row:hover {
      filter: brightness(0.96);
    }
    .gantt-tl-row--selected {
      outline: 1px solid var(--gantt-selection-border, #3B82F6);
      outline-offset: -1px;
    }
    .gantt-col-resize-handle:hover {
      opacity: 1 !important;
      background: var(--gantt-border, #e2e8f0);
    }
    /*
     * WCAG 2.2 — 2.5.8 Target Size (Minimum): pointer target ≥ 24×24 CSS px (Level AA).
     */
    .gantt-collapse-btn {
      box-sizing: border-box;
      min-width: 24px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      touch-action: manipulation;
    }
    .gantt-collapse-btn:hover {
      opacity: 0.75;
    }
    .gantt-collapse-btn:focus-visible {
      outline: 2px solid var(--gantt-selection-border, #3B82F6);
      outline-offset: 2px;
    }
    .gantt-panel-resize-handle:hover {
      background: var(--gantt-today, #F59E0B) !important;
      opacity: 0.5;
    }

    @keyframes collapse-btn-enter {
      from { opacity: 0; transform: scale(0.6); }
      to   { opacity: 1; transform: scale(1); }
    }
  `],
})
export class GanttTaskListComponent {
  /** Matches .gantt-collapse-btn min width — leaf spacer alignment */
  protected readonly COLLAPSE_TARGET_PX = 24;

  // ── Inputs ────────────────────────────────────────────────
  readonly visibleRows    = input.required<GanttFlatRow[]>();
  readonly columns        = input.required<ColumnDef[]>();
  readonly rowHeight      = input<number>(32);
  readonly selectedIds    = input<Set<string>>(new Set());
  readonly theme          = input.required<GanttTheme>();
  readonly colHeaderHeight = input<number>(32);
  readonly indentSize     = input<number>(16);
  readonly paddingTop     = input<number>(0);
  readonly paddingBottom  = input<number>(0);

  // ── Outputs ───────────────────────────────────────────────
  readonly collapseToggle    = output<string>();          // taskId
  readonly rowClick          = output<{ row: GanttFlatRow; event: MouseEvent }>();
  readonly rowDblClick       = output<GanttFlatRow>();
  readonly panelWidthChange  = output<number>();
  readonly columnWidthChange = output<{ key: string; width: number }>();
  readonly sortColumn        = output<string>();

  // ── Internal state ────────────────────────────────────────
  protected readonly isResizing = signal(false);
  private _resizeStartX = 0;
  private _resizeStartWidth = 0;
  private _resizingColKey: string | null = null;

  private readonly el = inject(ElementRef<HTMLElement>);

  // ── Derived ───────────────────────────────────────────────
  protected readonly visibleColumns = computed(() =>
    this.columns().filter(c => c.visible !== false)
  );

  protected readonly gridTemplate = computed(() =>
    this.visibleColumns()
      .map(c => `${c.width}px`)
      .join(' ')
  );

  // ── Row utilities ─────────────────────────────────────────
  protected isSelected(row: GanttFlatRow): boolean {
    return this.selectedIds().has(row.task.id);
  }

  protected rowBg(row: GanttFlatRow): string {
    if (this.isSelected(row)) return this.theme().selectionBg;
    return row.task.rowColor ?? this.theme().rowBg;
  }

  protected taskIcon(row: GanttFlatRow): string {
    if (row.hasChildren) return '📁';
    if (row.barType === 'milestone') return '◆';
    return '▬';
  }

  protected renderCell(col: ColumnDef, row: GanttFlatRow): string {
    return col.render ? col.render(row) : '';
  }

  // ── Collapse toggle ───────────────────────────────────────
  protected collapseAriaLabel(row: GanttFlatRow): string {
    const action = row.isCollapsed ? 'Expand' : 'Collapse';
    return `${action} ${row.task.name}`;
  }

  protected onCollapseClick(event: MouseEvent, row: GanttFlatRow): void {
    event.stopPropagation();
    this.collapseToggle.emit(row.task.id);
  }

  // ── Row click (selection) ─────────────────────────────────
  protected onRowClick(event: MouseEvent, row: GanttFlatRow): void {
    this.rowClick.emit({ row, event });
  }

  // ── Panel resize ──────────────────────────────────────────
  protected onPanelResizeStart(event: PointerEvent): void {
    event.preventDefault();
    this.isResizing.set(true);
    this._resizeStartX     = event.clientX;
    this._resizeStartWidth = this.el.nativeElement.getBoundingClientRect().width;

    const host = this.el.nativeElement;
    host.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent) => {
      const delta    = e.clientX - this._resizeStartX;
      const newWidth = Math.max(this._resizeStartWidth + delta, 120);
      this.panelWidthChange.emit(newWidth);
    };
    const onUp = () => {
      this.isResizing.set(false);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup',   onUp);
    };

    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerup',   onUp);
  }

  // ── Column resize ─────────────────────────────────────────
  protected onColResizeStart(event: PointerEvent, col: ColumnDef): void {
    event.preventDefault();
    event.stopPropagation();

    this._resizingColKey  = col.key;
    this._resizeStartX    = event.clientX;
    this._resizeStartWidth = col.width;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent) => {
      const delta    = e.clientX - this._resizeStartX;
      const newWidth = Math.max(
        this._resizeStartWidth + delta,
        col.minWidth ?? 40,
      );
      this.columnWidthChange.emit({ key: col.key, newWidth } as any);
    };
    const onUp = () => {
      this._resizingColKey = null;
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup',   onUp);
    };

    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerup',   onUp);
  }
}
