// ─────────────────────────────────────────────────────────────
//  gantry · tasklist/gantt-tasklist.component.ts
//
//  Left panel of the Gantt chart (internal: only GantryComponent renders it,
//  so it has no content slots; `<gantry>`'s `[tlFooter]` content goes below it).
//
//  Layout:
//
//  ┌─────────────────────────────────┐
//  │  Column headers row             │  ← built-in, from ColumnDef[]
//  ├─────────────────────────────────┤
//  │  Row 0 │ ▼  Project Alpha       │  ← task rows (virtual scrolled)
//  │  Row 1 │    ├─ Task 1.1         │
//  │  Row 2 │    └─ Task 1.2         │
//  │  ...                            │
//  └─────────────────────────────────┘
//
//  Scroll is handled externally by GanttScrollService (step 11).
//  This component only renders rows — it does NOT own scroll state.
//
//  Markup and class names are the Web Component's (`layers/tasklist.ts`):
//
//    div.gantt-tl-col-header    span.gantt-tl-ellipsis (label) ·
//                               span.gantt-tl-sort-icon(--active) · div.gantt-col-resize
//    div.gantt-tl-cell (name)   span.gantt-tl-name > button.gantt-collapse-btn |
//                               span.gantt-tl-indent · span.gantt-tl-icon · span.gantt-tl-ellipsis
//    div.gantt-tl-cell (other)  span.gantt-tl-status-dot? · span.gantt-tl-ellipsis
//
//  Chrome and text colours are stylesheet rules on the `--gantt-*` tokens
//  (the same rules as `styles/tasklist.css.ts`); row backgrounds, status
//  dots and the icon of a task with `barColor` are `Paint`s bound as CSS
//  properties.
//
//  Rows: the mounted rows of the chart's virtual window plus the pinned
//  ones (the focused row kept mounted while it scrolls away), each pinned
//  row taken out of the flow at its row offset (`.gantt-tl-row--pinned`),
//  like the Web Component's `tlRows`. Rows are tracked by task id, so a row
//  keeps its node (and keyboard focus) across scrolls, selections and
//  collapses.
//
//  Keyboard: the list is one tab stop. One mounted row has `tabindex=0`
//  (`tabStopId`: the focused row, else the row focused last while it is
//  mounted, else the first row in view; see `tabStopRow`), the others
//  `-1`. Rows, collapse toggles and sortable headers carry the Web
//  Component's `data-focus-key` (`row:<id>`, `collapse:<id>`, `sort:<key>`)
//  for the chart's focus restore.
//
//  Column resize is the Web Component's gesture (`interaction/column-resize.ts`):
//  the handle captures the pointer and listens for one gesture, never on
//  `window`; destroying the list mid-drag drops the listeners and keeps the
//  width reached so far.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { type GanttFlatRow, type ColumnDef } from '../types';
import {
  buildColumnContext,
  clampColumnWidth,
  columnsGridTemplate,
  computeCellVisual,
  rowPaint,
  virtualIndexes,
  type CellVisual,
  type ColumnContext,
  type VirtualWindow,
} from '@gantryjs/core';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'gantt-tasklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    class: 'gantt-tasklist',
    role: 'treegrid',
    '[attr.aria-multiselectable]': 'multiselectable()',
    '[attr.aria-rowcount]': 'rowCount() + 1',
    '[attr.aria-colcount]': 'visibleColumns().length',
    '[attr.aria-label]': 'i18n.labels().ariaTaskList',
    '[style.user-select]': 'resizingCol() ? "none" : null',
  },
  template: `
    <!-- ── Column header row ──────────────────────────────── -->
    <div
      class="gantt-tl-col-headers"
      role="row"
      aria-rowindex="1"
      [style.grid-template-columns]="gridTemplate()"
      [style.height.px]="colHeaderHeight()"
    >
      @for (col of visibleColumns(); track col.key) {
        <div
          class="gantt-tl-col-header"
          role="columnheader"
          [style.justify-content]="justify(col.align)"
          [attr.aria-sort]="col.sortable ? ariaSort(col.key) : null"
          [attr.tabindex]="col.sortable ? 0 : null"
          [attr.data-focus-key]="col.sortable ? 'sort:' + col.key : null"
          (click)="onHeaderClick(col)"
          (keydown.enter)="col.sortable && sortColumn.emit(col.key)"
          (keydown.space)="$event.preventDefault(); col.sortable && sortColumn.emit(col.key)"
        >
          <span class="gantt-tl-ellipsis" [attr.title]="col.label">{{ col.label }}</span>
          @if (col.sortable) {
            <span
              class="gantt-tl-sort-icon"
              aria-hidden="true"
              [class.gantt-tl-sort-icon--active]="sort()?.key === col.key"
              >{{ sortIcon(col.key) }}</span
            >
          }
          @if (col.resizable !== false) {
            <div
              class="gantt-col-resize"
              aria-hidden="true"
              (click)="$event.stopPropagation()"
              (pointerdown)="onColResizeStart($event, col)"
            ></div>
          }
        </div>
      }
    </div>

    <!-- ── Task rows ──────────────────────────────────────── -->
    <div class="gantt-tl-rows" role="rowgroup">
      <!-- Spacer top (virtual scroll) -->
      <div aria-hidden="true" [style.height.px]="paddingTop()"></div>

      <!-- The window's rows and the pinned ones (out of the flow, at their row offset) -->
      @for (m of rows(); track m.row.task.id) {
        @let row = m.row;
        <div
          class="gantt-tl-row"
          role="row"
          [class.gantt-tl-row--selected]="isSelected(row)"
          [class.gantt-tl-row--group]="row.hasChildren"
          [class.gantt-tl-row--pinned]="m.pinnedTop !== null"
          [attr.data-task-id]="row.task.id"
          [attr.data-focus-key]="'row:' + row.task.id"
          [attr.tabindex]="row.task.id === tabStopId() ? 0 : -1"
          [attr.aria-rowindex]="row.visibleIndex + 2"
          [attr.aria-level]="row.level + 1"
          [attr.aria-selected]="isSelected(row)"
          [attr.aria-expanded]="row.hasChildren ? !row.isCollapsed : null"
          [style.top.px]="m.pinnedTop"
          [style.grid-template-columns]="gridTemplate()"
          [style.height.px]="rowHeight()"
          [style.background-color]="rowBg(row)"
          (click)="onRowClick($event, row)"
          (keydown)="onRowKey($event, row)"
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
            >
              @if (col.cellTemplate) {
                <!-- Custom cell via <ng-template ganttColumn> -->
                <ng-container *ngTemplateOutlet="col.cellTemplate; context: { $implicit: row, row: row, ctx: ctx() }" />
              } @else if (col.key === 'name') {
                <!-- Name cell: indent + collapse toggle + text -->
                <span class="gantt-tl-name" [style.padding-left.px]="row.level * indentSize()">
                  @if (row.hasChildren) {
                    <button
                      type="button"
                      class="gantt-collapse-btn"
                      [attr.data-focus-key]="'collapse:' + row.task.id"
                      [attr.aria-expanded]="!row.isCollapsed"
                      [attr.aria-label]="collapseAriaLabel(row)"
                      (click)="onCollapseClick($event, row)"
                    >
                      {{ row.isCollapsed ? '▶' : '▼' }}
                    </button>
                  } @else {
                    <!-- Leaf indent (as wide as the collapse control) -->
                    <span class="gantt-tl-indent"></span>
                  }
                  <!-- The task's own colour, else the stylesheet's muted text -->
                  <span class="gantt-tl-icon" aria-hidden="true" [style.color]="row.task.barColor ?? null">{{
                    taskIcon(row)
                  }}</span>
                  <span class="gantt-tl-ellipsis">{{ nameText(col, row) }}</span>
                </span>
              } @else {
                <!-- Regular cell: ColumnDef.render(), else the task field -->
                @if (cell?.status) {
                  <span class="gantt-tl-status-dot" aria-hidden="true" [style.background-color]="cell?.dotPaint"></span>
                }
                <span class="gantt-tl-ellipsis" [style.text-align]="col.align ?? 'start'">{{ cell?.text }}</span>
              }
            </div>
          }
        </div>
      }

      <!-- Spacer bottom (virtual scroll) -->
      <div aria-hidden="true" [style.height.px]="paddingBottom()"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        /* visible, so the sticky column header anchors to the outer scrollport
           (the panel in GantryComponent), not to this host */
        overflow: visible;
        position: relative;
        /* as wide as the columns (the panel scrolls horizontally), at least the panel */
        width: max-content;
        min-width: 100%;
        box-sizing: border-box;
      }
      .gantt-tl-col-headers {
        display: grid;
        flex-shrink: 0;
        position: sticky;
        top: 0;
        z-index: 5;
        box-sizing: border-box;
        background-color: var(--gantt-header-bg);
        border-bottom: 1px solid var(--gantt-border);
      }
      .gantt-tl-col-header {
        position: relative;
        padding: 0 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        overflow: hidden;
        font-weight: 600;
        cursor: default;
        user-select: none;
        border-right: 1px solid var(--gantt-border);
        color: var(--gantt-text);
      }
      .gantt-tl-col-header[aria-sort] {
        cursor: pointer;
      }
      .gantt-tl-rows {
        flex: 1;
        position: relative;
      }
      .gantt-tl-row {
        display: grid;
        box-sizing: border-box;
        cursor: default;
        transition: background-color 0.1s;
        border-bottom: 1px solid var(--gantt-border);
      }
      .gantt-tl-row:hover {
        filter: brightness(0.96);
      }
      .gantt-tl-row--selected {
        box-shadow: inset 3px 0 0 var(--gantt-sel-border, #2563eb);
      }
      /* The focused row kept mounted outside the virtual window, at its row offset (top) */
      .gantt-tl-row--pinned {
        position: absolute;
        left: 0;
        right: 0;
        z-index: 1;
      }
      .gantt-tl-cell {
        display: flex;
        align-items: center;
        overflow: hidden;
        padding: 0 8px;
        box-sizing: border-box;
        border-right: 1px solid var(--gantt-border);
        color: var(--gantt-text);
      }
      .gantt-tl-ellipsis {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Text colours: header labels and group names primary, cell texts and leaf names
         secondary, icons muted (an active sort icon primary) */
      .gantt-tl-cell .gantt-tl-ellipsis {
        color: var(--gantt-text-sec);
      }
      .gantt-tl-row--group .gantt-tl-name > .gantt-tl-ellipsis {
        color: var(--gantt-text);
        font-weight: 600;
      }
      .gantt-tl-sort-icon {
        font-size: 9px;
        color: var(--gantt-text-muted);
      }
      .gantt-tl-sort-icon--active {
        color: var(--gantt-text);
      }
      .gantt-tl-name {
        display: flex;
        align-items: center;
        gap: 4px;
        overflow: hidden;
        width: 100%;
      }
      /* Leaf indent: as wide as the collapse toggle */
      .gantt-tl-indent {
        flex-shrink: 0;
        width: 24px;
      }
      .gantt-tl-icon {
        flex-shrink: 0;
        font-size: 10px;
        color: var(--gantt-text-muted);
      }
      .gantt-tl-status-dot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-inline-end: 6px;
      }
      /* Inside its header cell (which clips): the whole 6 px handle can be grabbed */
      .gantt-col-resize {
        position: absolute;
        top: 0;
        right: 0;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        z-index: 2;
        touch-action: none;
      }
      .gantt-col-resize:hover {
        background: var(--gantt-sel-border, #2563eb);
        opacity: 0.6;
      }
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
        color: var(--gantt-text-sec);
      }
      .gantt-collapse-btn:hover {
        opacity: 0.75;
      }
      /* Keyboard focus only: inset rings (cells and the panel clip anything outside them) */
      .gantt-tl-row:focus-visible,
      .gantt-tl-col-header:focus-visible,
      .gantt-collapse-btn:focus-visible {
        outline: 2px solid var(--gantt-sel-border);
        outline-offset: -2px;
      }
    `,
  ],
})
export class GanttTaskListComponent {
  constructor() {
    // A resize still running when the list goes: drop its listeners, keep the width reached
    inject(DestroyRef).onDestroy(() => this.colResize.abort());
  }

  // ── Inputs ────────────────────────────────────────────────
  /** Rows to mount, in DOM order: the virtual window plus the pinned rows (`mountedRows`) */
  readonly rows = input.required<readonly MountedRow[]>();
  /** Task id of the row that takes the list's tab stop (`tabStopRow`); `null` while no row is mounted */
  readonly tabStopId = input<string | null>(null);
  /** `aria-multiselectable`: selection and multi-select are both on */
  readonly multiselectable = input<boolean>(true);
  readonly columns = input.required<ColumnDef[]>();
  readonly rowCount = input<number>(0);
  readonly rowHeight = input<number>(32);
  readonly selectedIds = input<ReadonlySet<string>>(new Set());
  readonly colHeaderHeight = input<number>(32);
  readonly indentSize = input<number>(16);
  readonly paddingTop = input<number>(0);
  readonly paddingBottom = input<number>(0);
  readonly sort = input<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  /** Full table view (styling only — `columns` are already resolved for the view) */
  readonly tableView = input<boolean>(false);
  /** "Now", date reading and task index for status / predecessor cells */
  readonly cellContext = input<ColumnContext | null>(null);

  // ── Outputs ───────────────────────────────────────────────
  readonly collapseToggle = output<string>(); // taskId
  readonly rowClick = output<{ row: GanttFlatRow; event: MouseEvent | KeyboardEvent }>();
  readonly rowDblClick = output<GanttFlatRow>();
  /** Live column resize (while dragging the header edge) */
  readonly columnWidthChange = output<{ key: string; width: number }>();
  /** Column resize finished */
  readonly columnResizeEnd = output<void>();
  readonly sortColumn = output<string>();

  // ── Internal state ────────────────────────────────────────
  /** Key of the column being resized (no text selection meanwhile) */
  protected readonly resizingCol = signal<string | null>(null);

  /** The column-resize gesture (pointer capture on the handle) */
  private readonly colResize = createColumnResize({
    onStart: key => this.resizingCol.set(key),
    onWidth: (key, width) => this.columnWidthChange.emit({ key, width }),
    onEnd: () => {
      this.resizingCol.set(null);
      this.columnResizeEnd.emit();
    },
    onAbort: () => this.resizingCol.set(null),
  });

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

  protected readonly ctx = computed<ColumnContext>(
    () => this.cellContext() ?? buildColumnContext({ tasks: [], now: new Date() }),
  );

  /** One column grows to fill a panel wider than the columns: the `flex` one, else the last */
  protected readonly gridTemplate = computed(() => columnsGridTemplate(this.visibleColumns()));

  // ── Row utilities ─────────────────────────────────────────
  protected isSelected(row: GanttFlatRow): boolean {
    return this.selectedIds().has(row.task.id);
  }

  /** Same background as the timeline rows (`rowPaint`: selection > `task.rowColor` > zebra) */
  protected rowBg(row: GanttFlatRow): string {
    return rowPaint({ row }, this.isSelected(row));
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
    return computeCellVisual(col, row, this.ctx());
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

  /** Enter / Space on a focused row select it like a click (Ctrl / Shift modifiers included) */
  protected onRowKey(event: KeyboardEvent, row: GanttFlatRow): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    this.rowClick.emit({ row, event });
  }

  protected onHeaderClick(col: ColumnDef): void {
    // The click that follows a resize's release is the drag's, not a sort
    if (col.sortable && !this.colResize.active()) this.sortColumn.emit(col.key);
  }

  // ── Column resize ─────────────────────────────────────────
  protected onColResizeStart(event: PointerEvent, col: ColumnDef): void {
    this.colResize.start(event.currentTarget as HTMLElement, event, col);
  }
}

// ── Mounted rows and the tab stop (ports of the Web Component's `graph/tasklist.ts` / `layers/tasklist.ts`) ──

/** A row the task list mounts. */
export interface MountedRow {
  readonly row: GanttFlatRow;
  /**
   * Offset (px) of a row pinned outside the virtual window (the focused row): taken out of the
   * flow, since the spacers already cover it. `null` for the rows of the window.
   */
  readonly pinnedTop: number | null;
}

/** The rows of `vw` (the pinned ones before the window, the window, the pinned ones after it) with their pin offsets. */
export function mountedRows(rows: readonly GanttFlatRow[], vw: VirtualWindow, rowHeight: number): MountedRow[] {
  const out: MountedRow[] = [];
  for (const i of virtualIndexes(vw, rows.length)) {
    const row = rows[i];
    if (row) out.push({ row, pinnedTop: i < vw.first || i > vw.last ? row.visibleIndex * rowHeight : null });
  }
  return out;
}

/** Same rows (by object) at the same pin offsets: a scroll inside the overscan keeps the list. */
export function sameMountedRows(a: readonly MountedRow[], b: readonly MountedRow[]): boolean {
  return a.length === b.length && a.every((m, i) => m.row === b[i]?.row && m.pinnedTop === b[i]?.pinnedTop);
}

/**
 * The row that takes the list's tab stop: the first of `preferred` (task ids) that is mounted,
 * else the first row of the window at or below `firstInView` (a visible index), else the first
 * row of the window, else the first mounted row.
 */
export function tabStopRow(
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

// ── Column-resize gesture (port of the Web Component's `interaction/column-resize.ts`) ──

/** What a resize reports. */
interface ColumnResizeHooks {
  /** A gesture started on the column `key` */
  readonly onStart: (key: string) => void;
  /** Live width while dragging (clamped to the column's min / max, rounded); only actual changes */
  readonly onWidth: (key: string, width: number) => void;
  /** The gesture ended: released, cancelled or capture lost */
  readonly onEnd: () => void;
  /** The gesture was aborted (the list is destroyed): nothing is reported, the width stays */
  readonly onAbort: () => void;
}

interface ColumnResize {
  /** Starts resizing `col` from a primary-button `pointerdown` on its `handle`. */
  start(
    handle: HTMLElement,
    event: PointerEvent,
    col: Pick<ColumnDef, 'key' | 'width' | 'minWidth' | 'maxWidth'>,
  ): void;
  /**
   * A resize is running, or has just ended and the click that follows its release is not
   * dispatched yet (that click must not sort the column).
   */
  active(): boolean;
  /** Ends the gesture in progress, if any, without reporting it, and forgets the click guard. */
  abort(): void;
}

/**
 * The handle captures the pointer (`setPointerCapture`), so every move and the release reach the
 * handle itself: the listeners live on the handle for the length of one gesture, never on
 * `window`. The handle is keyed with its column and survives the re-renders that the live width
 * changes cause.
 */
function createColumnResize(hooks: ColumnResizeHooks): ColumnResize {
  /** The gesture in progress: its handle and how to end it */
  let gesture: { readonly handle: HTMLElement; readonly end: (report: boolean) => void } | null = null;
  /** Set from a release until the next task: the trailing click is the drag's, not a sort */
  let settling = false;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const stopSettling = (): void => {
    clearTimeout(settle);
    settle = undefined;
    settling = false;
  };

  return {
    start(handle, event, col) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      gesture?.end(true);
      stopSettling();

      const { pointerId } = event;
      const startX = event.clientX;
      const startWidth = col.width;
      let last = startWidth;

      const move = (e: PointerEvent): void => {
        if (e.pointerId !== pointerId) return;
        const width = clampColumnWidth(startWidth + e.clientX - startX, col);
        if (width === last) return;
        last = width;
        hooks.onWidth(col.key, width);
      };
      const release = (e: PointerEvent): void => {
        if (e.pointerId === pointerId) end(true);
      };
      const end = (report: boolean): void => {
        if (gesture?.handle !== handle) return;
        gesture = null;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', release);
        handle.removeEventListener('pointercancel', release);
        handle.removeEventListener('lostpointercapture', release);
        try {
          if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        } catch {
          // the pointer is already gone
        }
        if (!report) {
          hooks.onAbort();
          return;
        }
        settling = true;
        settle = setTimeout(stopSettling);
        hooks.onEnd();
      };

      gesture = { handle, end };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', release);
      handle.addEventListener('pointercancel', release);
      handle.addEventListener('lostpointercapture', release);
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // no active pointer with this id (synthetic events): the handle still gets what it is sent
      }
      hooks.onStart(col.key);
    },
    active() {
      // A handle taken out of the document mid-drag never hears its release: not active any more
      return (gesture !== null && gesture.handle.isConnected) || settling;
    },
    abort() {
      gesture?.end(false);
      stopSettling();
    },
  };
}
