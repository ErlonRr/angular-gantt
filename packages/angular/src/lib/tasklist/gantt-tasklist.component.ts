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
//  dots and the icon of a styled task are `Paint`s bound as CSS
//  properties.
//
//  Row backgrounds are core `rowPaint` with the row's resolved style
//  (`layout.rowStyle`: selection, else `rowColor`, else the zebra); the
//  name cell's icon takes the style's `color` (the stylesheet gives the
//  others the muted text). The row under a mouse or pen pointer
//  (`layout.hoveredRowId`, in either pane, D4 of Gantry 2 phase 10) gets
//  `gantt-tl-row--hover`: the `--gantt-row-hover-bg` tint as a background
//  image over that background, like the timeline's `rect.gantt-row-hover`.
//  This list hears it by delegation (one `pointerover` / `pointerleave` on
//  the rows group, bound after the first render; a touch never hovers, nor
//  does anything while a bar is dragged).
//
//  Rows: the mounted rows of the chart's virtual window plus the pinned
//  ones (the focused row kept mounted while it scrolls away), each pinned
//  row taken out of the flow at its row offset (`.gantt-tl-row--pinned`),
//  like the Web Component's `tlRows`. Rows are tracked by task id, so a row
//  keeps its node (and keyboard focus) across scrolls, selections and
//  collapses.
//
//  Static ARIA (the Web Component's): header cells and cells carry
//  `aria-colindex` (1-based), rows `aria-posinset` / `aria-setsize` among
//  their visible siblings (core `reindexVisible`) besides `aria-level`,
//  `aria-rowindex`, `aria-selected` and `aria-expanded`.
//
//  Keyboard (row-first treegrid, D6 of Gantry 2 phase 9): the whole grid
//  is one tab stop. Header cells, rows and cells are focusable with the
//  Web Component's `data-focus-key` (`head:<column>`, `row:<id>`,
//  `cell:<id>:<column>`) and `tabindex=-1`, except one with `tabindex=0`
//  (core `gridTabStop`): the header cell or the cell focused last in the
//  list (a cell only while its row is the tab-stop row), else the tab-stop
//  row (`tabStopId`: the focused row — in either pane — else the one
//  focused last while it is mounted, else the first row in view; core
//  `tabStopIndex`), else, without rows, the first header cell, so the
//  scrollable list always keeps a keyboard stop. While the chart's state
//  box covers the rows (`covered`) they are `inert` and the header row
//  (above the box) holds the tab stop. Collapse toggles (`collapse:<id>`)
//  are `tabindex=-1` (the row expands with →). The keys themselves are the
//  chart's keyboard directive (`a11y/grid-keys.ts`); this list only
//  records where its tab stop goes (`focusin`).
//
//  Cell editor (Phase 11, D14–D16, contract §3d, the Web Component's
//  markup): while a cell is edited (`layout.cellEdit`,
//  `editing/cell-edit.ts`) its row is pinned and raised and the cell shows
//  the editor instead of its content (built again when the editor closes):
//
//    div.gantt-tl-row.gantt-tl-row--editing > div.gantt-tl-cell.gantt-tl-cell--editing
//      input.gantt-tl-editor[type][aria-label][aria-invalid?][aria-describedby?]
//        | select.gantt-tl-editor (kind 'select')
//        | the custom editor's node (`ganttCellEditor` template or function; + class gantt-tl-editor)
//      div.gantt-tl-editor-error#gantry-<n>-editor-error   last element, attached only while invalid
//
//  The editor (`[ganttCellEditorMount]`) is built once per edit, after the
//  render that shows its cell: its text then belongs to it (typing changes
//  no binding here), and the row re-rendering keeps the node and its
//  focus. The key or double-click that opens an editor renders it at once
//  (`ApplicationRef.tick()` from the event handler, as the Web Component's
//  synchronous flush): its field has focus before the next key, so fast
//  typing loses nothing. It is named `labels.ariaCellEditor(column, task)` and focused
//  through its `editor:<id>:<column>` key (a custom node: the node, else
//  its first focusable child). While `editing.cells` is on every cell
//  carries `aria-readonly` (core `cellEditable`); with it off, no
//  attribute. One `keydown` and one `focusout` listener on the list (bound
//  after the first render) are the editor's: F2 / Enter / typing on an
//  editable cell and the editor's Enter / Tab / Escape before the chart's
//  keymap (`a11y/grid-keys.ts` `handleCellKey`), and focus leaving the
//  editor (commit, else cancel). A double-click on an editable cell opens
//  it too (`rowDblClick` still emits); clicks inside the editor are its
//  own.
//
//  Column resize is the Web Component's gesture (`interaction/column-resize.ts`):
//  the handle captures the pointer and listens for one gesture, never on
//  `window`; destroying the list mid-drag drops the listeners and keeps the
//  width reached so far.
// ─────────────────────────────────────────────────────────────

import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
  TemplateRef,
  ViewContainerRef,
  afterEveryRender,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  type EmbeddedViewRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { type GanttFlatRow, type ColumnDef, type CellEditorTemplateContext } from '../types';
import {
  buildColumnContext,
  cellEditable,
  clampColumnWidth,
  columnsGridTemplate,
  computeCellVisual,
  gridTabStop,
  rowPaint,
  sameGridSpot,
  virtualIndexes,
  type CellVisual,
  type ColumnContext,
  type GridFocusSpot,
  type StyleResolver,
  type VirtualWindow,
} from '@gantryjs/core';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttCellEditService, editorFocusKey, type CellEditSession } from '../editing/cell-edit';
import { findFocusKey, focusIntoView, handleCellKey, isInert, type GanttCellKeyContext } from '../a11y/grid-keys';

/** Task lists built so far: the editor error's id is unique per list (`gantry-<n>-editor-error`, as the Web Component's) */
let nextTaskListId = 0;

/** What a custom editor's focus goes to: the node itself, else its first focusable child. */
const FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex], [contenteditable]';

/** The open editor as the task list paints it (its text is the editor's own: typing changes nothing here). */
interface TaskListEdit {
  /** The edit (a new object per `start`) */
  readonly open: CellEditSession;
  /** The message under the cell, `null` while the text is valid */
  readonly error: string | null;
}

const sameEdit = (a: TaskListEdit | null, b: TaskListEdit | null): boolean =>
  a === b || (!!a && !!b && a.open === b.open && a.error === b.error);

/** An event inside the open editor (its clicks and keys are the editor's). */
const inEditor = (target: EventTarget | null): boolean =>
  !!(target as Partial<Element> | null)?.closest?.('.gantt-tl-cell--editing');

/** A mounted cell editor (`GanttCellEditorMountDirective`). */
interface EditorMount {
  /** The edit it belongs to */
  readonly edit: CellEditSession;
  /** The cell's child: `input` / `select.gantt-tl-editor`, or the custom editor's node (class added) */
  readonly node: HTMLElement;
  /** What takes focus and carries the name, `aria-invalid` and `aria-describedby` (the node or its first focusable child) */
  readonly field: HTMLElement;
  /** Removes what the mount added (its node, its listeners, a template's view) */
  readonly release: () => void;
}

/**
 * The editor of the cell being edited (`<ng-container [ganttCellEditorMount]>` inside it, contract
 * §3d): after the render that shows the cell, a built-in `input` / `select.gantt-tl-editor` (its
 * text set once, the `input` events → `GanttCellEditService.input`), the column's function editor's
 * node, or its `<ng-template ganttCellEditor>` (the view's first element), inserted before the
 * container, named and keyed `editor:<id>:<column>`. `aria-invalid` / `aria-describedby` follow
 * the error. A new edit builds a new editor; the cell going back to its content removes it.
 */
@Directive({ selector: '[ganttCellEditorMount]' })
export class GanttCellEditorMountDirective {
  /** The edit (one object per `start`) */
  readonly edit = input.required<CellEditSession>({ alias: 'ganttCellEditorMount' });
  /** The message under the cell, `null` while valid */
  readonly error = input<string | null>(null);
  /** Id of the error node (`aria-describedby`) */
  readonly errorId = input.required<string>();

  private readonly cells = inject(GanttCellEditService);
  private readonly i18n = inject(GanttI18nService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly renderer = inject(Renderer2);
  private mount: EditorMount | null = null;

  constructor() {
    afterRenderEffect({
      write: () => {
        const edit = this.edit();
        const error = this.error();
        const errorId = this.errorId();
        untracked(() => this.paint(edit, error, errorId));
      },
    });
    inject(DestroyRef).onDestroy(() => this.unmount());
  }

  private paint(edit: CellEditSession, error: string | null, errorId: string): void {
    if (this.mount?.edit !== edit) {
      this.unmount();
      this.mount = this.build(edit);
    }
    const m = this.mount;
    if (!m) return;
    this.attr(m.field, 'aria-invalid', error ? 'true' : null);
    this.attr(m.field, 'aria-describedby', error ? errorId : null);
    if (m.node !== m.field) this.attr(m.node, 'aria-invalid', error ? 'true' : null);
  }

  private attr(el: HTMLElement, name: string, value: string | null): void {
    if (value === null) this.renderer.removeAttribute(el, name);
    else this.renderer.setAttribute(el, name, value);
  }

  /** Builds the editor of `edit` (the session as resolved now) and inserts it before the container. */
  private build(edit: CellEditSession): EditorMount | null {
    const s = this.cells.session();
    const anchor = this.vcr.element.nativeElement as Node;
    const cell = anchor.parentNode;
    if (s?.context !== edit.context || !cell) return null;
    const r = this.renderer;
    const own = s.column.editor;
    const custom = s.editor.kind === 'custom';
    const listeners = new AbortController();
    let view: EmbeddedViewRef<CellEditorTemplateContext> | null = null;
    /** A node this mount inserts (and removes): a built-in editor or a function editor's node */
    let inserted: HTMLElement | null = null;
    let node: HTMLElement;
    if (custom && own instanceof TemplateRef) {
      // `<ng-template ganttCellEditor let-edit>`: its first element is the editor's node
      view = this.vcr.createEmbeddedView(own, {
        $implicit: s.context,
        edit: s.context,
      });
      view.detectChanges();
      const first = view.rootNodes.find((n: Node): n is HTMLElement => n.nodeType === 1);
      if (!first) {
        view.destroy();
        return null;
      }
      node = first;
    } else if (custom && typeof own === 'function') {
      node = own(s.context);
      inserted = node;
    } else {
      node = this.builtin(s, listeners.signal);
      inserted = node;
    }
    if (inserted) r.insertBefore(cell, inserted, anchor);
    let field = node;
    if (view || (custom && typeof own === 'function')) {
      // A custom editor: the class added; focus goes to the node, else its first focusable child
      r.addClass(node, 'gantt-tl-editor');
      field = node.matches(FOCUSABLE) ? node : (node.querySelector<HTMLElement>(FOCUSABLE) ?? node);
      // Nothing focusable inside: the node itself takes focus (the keys reach the chart through it)
      if (field === node && !node.matches(FOCUSABLE)) r.setAttribute(node, 'tabindex', '-1');
    }
    if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) {
      r.setAttribute(field, 'aria-label', untracked(this.i18n.labels).ariaCellEditor(s.column.label, s.row.task.name));
    }
    r.setAttribute(field, 'data-focus-key', editorFocusKey(s.taskId, s.columnKey));
    return {
      edit,
      node,
      field,
      release: () => {
        listeners.abort();
        if (inserted) inserted.remove();
        if (view && !view.destroyed) view.destroy();
      },
    };
  }

  /** A built-in editor (§3d): `input.gantt-tl-editor[type][min][max][step]` or a `select` over its options. */
  private builtin(s: CellEditSession, signal: AbortSignal): HTMLElement {
    const r = this.renderer;
    const { input: spec } = s.editor;
    const value = this.cells.text() ?? s.editor.value;
    let el: HTMLInputElement | HTMLSelectElement;
    if (spec.type === 'select') {
      const select = r.createElement('select') as HTMLSelectElement;
      r.setAttribute(select, 'class', 'gantt-tl-editor');
      for (const o of spec.options ?? []) {
        const option = r.createElement('option') as HTMLOptionElement;
        r.setAttribute(option, 'value', o.value);
        r.appendChild(option, r.createText(o.label));
        r.appendChild(select, option);
      }
      select.value = value;
      el = select;
    } else {
      const input = r.createElement('input') as HTMLInputElement;
      r.setAttribute(input, 'class', 'gantt-tl-editor');
      r.setAttribute(input, 'type', spec.type);
      for (const name of ['min', 'max', 'step'] as const) {
        const v = spec[name];
        if (v !== undefined) r.setAttribute(input, name, String(v));
      }
      r.setAttribute(input, 'autocomplete', 'off');
      input.value = value;
      // F2 / Enter / double-click select the text; a typed character stays with the caret after it
      if (!s.seeded && (spec.type === 'text' || spec.type === 'number')) {
        input.addEventListener('focus', () => input.select(), { once: true, signal });
      }
      el = input;
    }
    // The editor's text (a custom editor calls `setValue`)
    el.addEventListener('input', () => this.cells.input(el.value), { signal });
    return el;
  }

  private unmount(): void {
    this.mount?.release();
    this.mount = null;
  }
}

@Component({
  selector: 'gantt-tasklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, GanttCellEditorMountDirective],
  host: {
    class: 'gantt-tasklist',
    role: 'treegrid',
    '[attr.aria-multiselectable]': 'multiselectable()',
    '[attr.aria-rowcount]': 'rowCount() + 1',
    '[attr.aria-colcount]': 'visibleColumns().length',
    '[attr.aria-label]': 'i18n.labels().ariaTaskList',
    '[style.user-select]': 'resizingCol() ? "none" : null',
    '(focusin)': 'onFocusIn($event)',
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
      <!-- Every header cell is in the grid navigation (the header row is above row 1); Enter / Space
           sort through the chart's keyboard directive -->
      @for (col of visibleColumns(); track col.key; let c = $index) {
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
        <div
          class="gantt-tl-col-header"
          role="columnheader"
          [attr.aria-colindex]="c + 1"
          [style.justify-content]="justify(col.align)"
          [attr.aria-sort]="col.sortable ? ariaSort(col.key) : null"
          [attr.tabindex]="col.key === headStop() ? 0 : -1"
          [attr.data-focus-key]="'head:' + col.key"
          (click)="onHeaderClick(col)"
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
    <div #rowsEl class="gantt-tl-rows" role="rowgroup" [attr.inert]="covered() ? '' : null">
      <!-- Spacer top (virtual scroll) -->
      <div aria-hidden="true" [style.height.px]="paddingTop()"></div>

      <!-- The window's rows and the pinned ones (out of the flow, at their row offset). Their keys are
           the chart's keyboard directive (one listener on the chart) -->
      @let hoveredId = layout.hoveredRowId();
      @let styleOf = layout.rowStyle();
      @let edit = editView();
      @let editable = editableOf();
      @for (m of rows(); track m.row.task.id) {
        @let row = m.row;
        @let rowId = row.task.id;
        @let rowEditing = edit !== null && edit.open.taskId === rowId;
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
        <div
          class="gantt-tl-row"
          role="row"
          [class.gantt-tl-row--selected]="isSelected(row)"
          [class.gantt-tl-row--group]="row.hasChildren"
          [class.gantt-tl-row--pinned]="m.pinnedTop !== null"
          [class.gantt-tl-row--hover]="rowId === hoveredId"
          [class.gantt-tl-row--editing]="rowEditing"
          [attr.data-task-id]="row.task.id"
          [attr.data-focus-key]="'row:' + row.task.id"
          [attr.tabindex]="rowId === rowStop() ? 0 : -1"
          [attr.aria-rowindex]="row.visibleIndex + 2"
          [attr.aria-level]="row.level + 1"
          [attr.aria-posinset]="row.posInSet ?? null"
          [attr.aria-setsize]="row.setSize ?? null"
          [attr.aria-selected]="isSelected(row)"
          [attr.aria-expanded]="row.hasChildren ? !row.isCollapsed : null"
          [style.top.px]="m.pinnedTop"
          [style.grid-template-columns]="gridTemplate()"
          [style.height.px]="rowHeight()"
          [style.background-color]="rowBg(row, styleOf)"
          (click)="onRowClick($event, row)"
          (dblclick)="onRowDblClick($event, row)"
        >
          @for (col of visibleColumns(); track col.key; let c = $index) {
            @let editing = rowEditing && col.key === edit?.open.columnKey;
            @let cell = editing ? null : cellVisual(col, row);
            <div
              class="gantt-tl-cell"
              role="gridcell"
              [class.gantt-tl-cell--editing]="editing"
              [attr.aria-colindex]="c + 1"
              [attr.tabindex]="rowId === tabStopId() && col.key === cellStop() ? 0 : -1"
              [attr.data-focus-key]="'cell:' + rowId + ':' + col.key"
              [attr.data-status]="cell?.status ?? null"
              [attr.title]="cell?.title ?? null"
              [attr.aria-readonly]="editable ? !editable(col, row) : null"
              [style.justify-content]="justify(col.align)"
            >
              @if (editing && edit) {
                <!-- The cell editor (built after this render), then its message while the text is invalid -->
                <ng-container [ganttCellEditorMount]="edit.open" [error]="edit.error" [errorId]="errorId" />
                @if (edit.error) {
                  <div class="gantt-tl-editor-error" [attr.id]="errorId">{{ edit.error }}</div>
                }
              } @else if (col.cellTemplate) {
                <!-- Custom cell via <ng-template ganttColumn> -->
                <ng-container *ngTemplateOutlet="col.cellTemplate; context: { $implicit: row, row: row, ctx: ctx() }" />
              } @else if (col.key === 'name') {
                <!-- Name cell: indent + collapse toggle + text -->
                <span class="gantt-tl-name" [style.padding-left.px]="row.level * indentSize()">
                  @if (row.hasChildren) {
                    <button
                      type="button"
                      class="gantt-collapse-btn"
                      tabindex="-1"
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
                  <!-- The row style's colour, else the stylesheet's muted text -->
                  <span class="gantt-tl-icon" aria-hidden="true" [style.color]="styleOf(row).color ?? null">{{
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
      /* The hovered row (in either pane): the tint over its background colour */
      .gantt-tl-row--hover {
        background-image: linear-gradient(var(--gantt-row-hover-bg), var(--gantt-row-hover-bg));
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
      /* Cell editor (the Web Component's rules): the raised row, the editing cell, the field and its
         error. The invalid outline uses longhands: every outline shorthand here is a focus ring */
      .gantt-tl-row--editing {
        z-index: 3;
        overflow: visible;
      }
      .gantt-tl-row--editing:not(.gantt-tl-row--pinned) {
        position: relative;
      }
      .gantt-tl-cell--editing {
        position: relative;
        overflow: visible;
        padding: 0 4px;
        cursor: auto;
      }
      /* ::ng-deep: a custom editor is the consumer's node (template or function), outside this
         component's style scope; the rules reach it through the class the chart adds */
      :host ::ng-deep .gantt-tl-editor {
        box-sizing: border-box;
        flex: 1 1 auto;
        align-self: stretch;
        width: 100%;
        min-width: 0;
        margin: 3px 0;
        padding: 0 6px;
        border: 1px solid var(--gantt-border);
        border-radius: 4px;
        background-color: var(--gantt-bg);
        color: var(--gantt-text);
        font-family: var(--gantt-font);
        font-size: var(--gantt-font-size);
        cursor: text;
      }
      :host ::ng-deep .gantt-tl-editor:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: -1px;
      }
      :host ::ng-deep .gantt-tl-editor[aria-invalid='true'] {
        border-color: var(--gantt-status-overdue);
        outline-width: 2px;
        outline-style: solid;
        outline-color: var(--gantt-status-overdue);
        outline-offset: -1px;
      }
      .gantt-tl-editor-error {
        position: absolute;
        inset-block-start: 100%;
        inset-inline-start: 0;
        z-index: 1;
        box-sizing: border-box;
        min-width: 100%;
        max-width: 320px;
        width: max-content;
        padding: 4px 8px;
        border: 1px solid var(--gantt-status-overdue);
        border-radius: 0 0 4px 4px;
        background-color: var(--gantt-bg);
        color: var(--gantt-status-overdue);
        font-family: var(--gantt-font);
        font-size: 12px;
        line-height: 1.4;
        white-space: normal;
        cursor: default;
      }
      /* Keyboard focus only (--gantt-focus-ring): inset rings (cells and the panel clip anything outside them) */
      .gantt-tl-row:focus-visible,
      .gantt-tl-cell:focus-visible,
      .gantt-tl-col-header:focus-visible,
      .gantt-collapse-btn:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: -2px;
      }

      /* Forced colours (D25): the hover tint hidden (row backgrounds stay plain); the selected row
         Highlight / HighlightText over its inline background, opting out of forcing (the Canvas text
         backplate would hide HighlightText), so its subtree's colours are set here (its focus rings
         HighlightText); status dots CanvasText. The cell editor (after those, so it wins in the selected
         row too): Field / FieldText, its ring Highlight, an invalid value a 2 px dashed CanvasText
         outline, the message CanvasText on Canvas */
      @media (forced-colors: active) {
        .gantt-tl-row--hover {
          background-image: none;
        }
        .gantt-tl-row--selected {
          forced-color-adjust: none;
          background-color: Highlight !important;
          box-shadow: none;
        }
        .gantt-tl-row--selected,
        .gantt-tl-row--selected * {
          color: HighlightText !important;
          border-color: CanvasText !important;
        }
        .gantt-tl-status-dot {
          background-color: CanvasText !important;
        }
        .gantt-tl-row--selected .gantt-tl-status-dot {
          background-color: HighlightText !important;
        }
        .gantt-tl-row--selected:focus-visible,
        .gantt-tl-row--selected .gantt-tl-cell:focus-visible,
        .gantt-tl-row--selected .gantt-collapse-btn:focus-visible {
          outline-color: HighlightText;
        }
        .gantt-col-resize:hover {
          background-color: Highlight;
        }
        :host ::ng-deep .gantt-tl-editor:focus-visible {
          outline-color: Highlight !important;
        }
        :host ::ng-deep .gantt-tl-editor {
          background-color: Field !important;
          color: FieldText !important;
          border-color: FieldText !important;
        }
        :host ::ng-deep .gantt-tl-editor[aria-invalid='true'] {
          outline: 2px dashed CanvasText !important;
        }
        .gantt-tl-editor-error {
          background-color: Canvas !important;
          color: CanvasText !important;
          border-color: CanvasText !important;
        }
      }
    `,
  ],
})
export class GanttTaskListComponent {
  constructor() {
    const destroyRef = inject(DestroyRef);
    // A resize still running when the list goes: drop its listeners, keep the width reached
    destroyRef.onDestroy(() => this.colResize.abort());
    // Browser only (never on the server): the hovered row's and the cell editor's listeners,
    // released with the list
    afterNextRender(() => {
      destroyRef.onDestroy(this.connectHover());
      destroyRef.onDestroy(this.connectEditing());
    });
    // The control a cell edit asked to focus once this render mounted it (the editor, or its cell)
    afterEveryRender(() => this.focusRequested());
  }

  /** The chart's layout graph: the hovered row and the rows' resolved styles */
  protected readonly layout = inject(GanttLayoutService);
  /** A bar is dragged: no row hovers meanwhile */
  private readonly drag = inject(GanttDragService);
  /** Cell editing: what F2 / Enter / typing / double-click open, the editor's state */
  private readonly cells = inject(GanttCellEditService);
  /** Renders the editor a key just opened at once (`renderNow`) */
  private readonly appRef = inject(ApplicationRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly rowsEl = viewChild.required<ElementRef<HTMLElement>>('rowsEl');

  /** Id of the cell editor's message (`aria-describedby`), unique per list */
  protected readonly errorId = `gantry-${++nextTaskListId}-editor-error`;

  /** The open editor without its text (typing re-renders nothing), `null` when none is */
  protected readonly editView = computed<TaskListEdit | null>(
    () => {
      const state = this.layout.cellEdit();
      const open = this.cells.opened();
      return state && open && state.taskId === open.taskId && state.columnKey === open.columnKey
        ? { open, error: state.error }
        : null;
    },
    { equal: sameEdit },
  );

  /**
   * Which cells can be edited (`aria-readonly`: core `cellEditable` with the row's edit rules),
   * `null` while `editing.cells` is off (no attribute). Kept while the edit rules are the same.
   */
  protected readonly editableOf = computed<((col: ColumnDef, row: GanttFlatRow) => boolean) | null>(() => {
    const cfg = this.layout.cfg();
    if (!cfg.editing.cells) return null;
    const rules = this.layout.editRules();
    return (col, row) => cellEditable(col, row, rules(row), cfg);
  });

  // ── Inputs ────────────────────────────────────────────────
  /** Rows to mount, in DOM order: the virtual window plus the pinned rows (`mountedRows`) */
  readonly rows = input.required<readonly MountedRow[]>();
  /** Task id of the tab-stop row (core `tabStopIndex` over the mounted rows); `null` while no row is mounted */
  readonly tabStopId = input<string | null>(null);
  /** The chart's state box covers the rows (not ready): they are inert, the header row keeps the tab stop */
  readonly covered = input<boolean>(false);
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
  readonly rowClick = output<{ row: GanttFlatRow; event: MouseEvent }>();
  readonly rowDblClick = output<GanttFlatRow>();
  /** Live column resize (while dragging the header edge) */
  readonly columnWidthChange = output<{ key: string; width: number }>();
  /** Column resize finished */
  readonly columnResizeEnd = output<void>();
  readonly sortColumn = output<string>();

  // ── Internal state ────────────────────────────────────────
  /** Key of the column being resized (no text selection meanwhile) */
  protected readonly resizingCol = signal<string | null>(null);

  /** Where focus was last inside the list: the header cell or cell that keeps the tab stop */
  private readonly focusSpot = signal<GridFocusSpot | null>(null, { equal: sameGridSpot });

  /** The list's one tab stop (core `gridTabStop`); covered rows can't hold it */
  private readonly tabStop = computed(
    () =>
      gridTabStop(
        this.focusSpot(),
        this.covered() ? null : this.tabStopId(),
        this.visibleColumns().map(c => c.key),
      ),
    { equal: sameGridSpot },
  );

  /** Key of the header cell that is the tab stop (focused last, its column still shown; the first without rows), else `null` */
  protected readonly headStop = computed(() => {
    const stop = this.tabStop();
    return stop?.kind === 'head' ? stop.key : null;
  });

  /** Column key of the tab-stop row's cell that is the tab stop (focused last in that row), else `null` */
  protected readonly cellStop = computed(() => {
    const stop = this.tabStop();
    return stop?.kind === 'cell' ? stop.key : null;
  });

  /** Task id of the row that is the tab stop: the tab-stop row unless a header cell or a cell is */
  protected readonly rowStop = computed(() => {
    const stop = this.tabStop();
    return stop?.kind === 'row' ? stop.id : null;
  });

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

  /** Same background as the timeline rows (`rowPaint` with the row's style: selection > `rowColor` > zebra) */
  protected rowBg(row: GanttFlatRow, styleOf: StyleResolver): string {
    return rowPaint({ row }, this.isSelected(row), styleOf(row));
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
    // A click inside the open editor is the editor's
    if (inEditor(event.target)) return;
    this.rowClick.emit({ row, event });
  }

  /** A double-click on an editable cell (not on a control inside it) also opens its editor; `rowDblClick` still emits. */
  protected onRowDblClick(event: MouseEvent, row: GanttFlatRow): void {
    const target = event.target as Element;
    if (inEditor(target)) return;
    const cell = target.closest('.gantt-tl-cell');
    const key = cell ? this.visibleColumns()[Number(cell.getAttribute('aria-colindex')) - 1]?.key : undefined;
    // Mounted and focused at once: a key typed right away reaches the field
    if (key !== undefined && !target.closest('button, a[href]') && this.cells.start(row.task.id, key)) {
      this.renderNow();
    }
    this.rowDblClick.emit(row);
  }

  /** Focus moved inside the list: a header cell, a row or one of its cells keeps the tab stop. */
  protected onFocusIn(event: FocusEvent): void {
    const target = event.target as Element;
    const cols = this.visibleColumns();
    const keyOf = (el: Element) => cols[Number(el.getAttribute('aria-colindex')) - 1]?.key;
    const head = target.closest('.gantt-tl-col-header');
    if (head) {
      const key = keyOf(head);
      if (key !== undefined) this.focusSpot.set({ kind: 'head', key });
      return;
    }
    const id = target.closest('.gantt-tl-row')?.getAttribute('data-task-id');
    if (id == null) return;
    const cell = target.closest('.gantt-tl-cell');
    const key = cell ? keyOf(cell) : undefined;
    this.focusSpot.set(key !== undefined ? { kind: 'cell', id, key } : { kind: 'row', id });
  }

  protected onHeaderClick(col: ColumnDef): void {
    // The click that follows a resize's release is the drag's, not a sort
    if (col.sortable && !this.colResize.active()) this.sortColumn.emit(col.key);
  }

  // ── Column resize ─────────────────────────────────────────
  protected onColResizeStart(event: PointerEvent, col: ColumnDef): void {
    this.colResize.start(event.currentTarget as HTMLElement, event, col);
  }

  // ── Cell editor ───────────────────────────────────────────
  /**
   * The cell editor's listeners on the list (after the first render): F2 / Enter / typing on an
   * editable cell and the editor's Enter / Tab / Escape, before the chart's keymap (one listener on
   * the chart, which this list is inside); focus leaving the editor's cell commits it (else cancels)
   * once focus has settled — a press elsewhere, Tab out of a custom editor, or the editor removed
   * with its row. Returns the release.
   */
  private connectEditing(): () => void {
    const list = this.host.nativeElement;
    const listeners = new AbortController();
    const { signal } = listeners;
    const release = this.cells.connect(list);
    const keys: GanttCellKeyContext = {
      layout: this.layout,
      cells: this.cells,
      columns: () => untracked(this.visibleColumns),
      renderNow: () => this.renderNow(),
    };
    list.addEventListener('keydown', e => handleCellKey(keys, e), { signal });
    list.addEventListener(
      'focusout',
      e => {
        const open = this.cells.active();
        const cell = (e.target as Partial<Element> | null)?.closest?.('.gantt-tl-cell--editing');
        if (!open || !cell) return;
        const next = e.relatedTarget as Node | null;
        if (next && cell.contains(next)) return;
        queueMicrotask(() => {
          const now = this.cells.active();
          if (now?.taskId !== open.taskId || now.columnKey !== open.columnKey) return;
          const root = list.getRootNode() as Partial<DocumentOrShadowRoot>;
          const active = root.activeElement;
          if (active && list.querySelector('.gantt-tl-cell--editing')?.contains(active)) return;
          this.cells.blur();
        });
      },
      { signal },
    );
    return () => {
      listeners.abort();
      release();
    };
  }

  /**
   * Renders now, from an event handler (never during a render): the editor a key or double-click
   * just opened is mounted and focused before the next event (the Web Component's `renderNow`).
   */
  private renderNow(): void {
    this.appRef.tick();
  }

  /** Focuses (and scrolls to) the control a cell edit asked for, now that it is mounted. */
  private focusRequested(): void {
    const key = this.cells.takeFocusRequest();
    if (key === null) return;
    const el = findFocusKey(this.host.nativeElement, key);
    if (el && !isInert(el)) focusIntoView(el);
  }

  // ── Row hover ─────────────────────────────────────────────
  /**
   * Delegated listeners on the rows group (after the first render): the row a mouse or pen enters
   * is the chart's hovered row (its tint shows in both panes); leaving the rows clears it. A touch
   * never hovers, and nothing does while a bar is dragged. Returns the release.
   */
  private connectHover(): () => void {
    const rows = this.rowsEl().nativeElement;
    const listeners = new AbortController();
    const { signal } = listeners;
    rows.addEventListener(
      'pointerover',
      e => {
        if (e.pointerType === 'touch' || this.drag.isPointerDrag()) return;
        const row = e.target instanceof Element ? e.target.closest('.gantt-tl-row') : null;
        this.layout.hoveredRowId.set(row?.parentElement === rows ? row.getAttribute('data-task-id') : null);
      },
      { passive: true, signal },
    );
    rows.addEventListener(
      'pointerleave',
      e => {
        if (e.pointerType !== 'touch') this.layout.hoveredRowId.set(null);
      },
      { passive: true, signal },
    );
    return () => listeners.abort();
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
