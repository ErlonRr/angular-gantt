// ─────────────────────────────────────────────────────────────
//  gantry · annotations/gantt-toolbar.component.ts
//
//  Toolbar above the chart: core `buildToolbar()` fitted to the chart's
//  width by core `layoutToolbar()` and painted as is (the same groups,
//  controls, classes, roles and names as the Web Component's
//  `layers/toolbar.ts`), configurable through `options.toolbar`:
//
//    div.gantt-toolbar[role=toolbar][aria-label]
//      div.gantt-tb-group.gantt-tb-panel-group   button.gantt-tb-btn.gantt-tb-panel[aria-pressed]   (`panelToggle`)
//      div.gantt-tb-group.gantt-tb-rows-group  button.gantt-tb-btn.gantt-tb-rows[aria-pressed][aria-label][title]
//                                               > svg.gantt-tb-icon   (`toolbar.rowsToggle` while the chart has `resources`)
//      div.gantt-tb-group.gantt-tb-history     button.gantt-tb-btn.gantt-tb-undo|redo[aria-label][title][aria-disabled?]
//                                               > svg.gantt-tb-icon   (`toolbar.undo` while the chart keeps history)
//      div.gantt-tb-group                     button.gantt-tb-btn ×3 (zoom out, zoom in, fit)
//                                               > svg.gantt-tb-icon[aria-hidden] > path…
//      div.gantt-tb-group.gantt-tb-pills[role=radiogroup][aria-label]
//                                             button.gantt-tb-pill[role=radio][aria-checked] (text)
//      div.gantt-tb-group                     button.gantt-tb-btn.gantt-tb-today
//                                               > svg.gantt-tb-icon + span.gantt-tb-label
//      div.gantt-tb-slot.gantt-tb-group       the consumer's `[ganttToolbar]` content (Angular only)
//      div.gantt-tb-group.gantt-tb-pills.gantt-tb-views[role=radiogroup][aria-label]
//                                             button.gantt-tb-pill[role=radio][aria-checked][aria-label][title]
//                                               > svg.gantt-tb-icon
//      div.gantt-tb-group.gantt-tb-export-group button.gantt-tb-btn.gantt-tb-export[aria-label][title]
//                                               [aria-haspopup=menu][aria-expanded] > svg.gantt-tb-icon
//                                               (`toolbar.export`; `aria-controls` while open)
//      div.gantt-tb-group.gantt-tb-more-group button.gantt-tb-btn.gantt-tb-more[aria-haspopup=menu][aria-expanded]
//                                               (while some groups don't fit; `aria-controls` while open)
//      div.gantt-tb-menu[role=menu][id][aria-label]   the More or the Export menu (while open), right
//                                                     after the group of the button that opened it
//        div.gantt-tb-menu-group[role=group][aria-label]
//          button.gantt-tb-menu-item[role=menuitemradio|menuitem][aria-checked][tabindex=-1]
//            > svg.gantt-tb-icon? + span.gantt-tb-label
//      div.gantt-legend.gantt-legend--toolbar (`legend.position: 'toolbar'`, while placed here)
//
//  Every built-in button carries `data-focus-key` (`panel`, `undo`, `redo`,
//  `zoom-out`, `zoom-in`, `fit`, `zoom:<level>`, `today`, `view:<view>`,
//  `export`, `more`; menu items `menu:<key>`): groups are keyed by `ToolbarGroup.key` and buttons
//  by it, so a control keeps its node, and keyboard focus, across zooms,
//  view switches and option changes. The panel toggle, the export group,
//  the More button and the menu are attached only while shown (D26): at a
//  width where everything fits, without `panelToggle` and `toolbar.export`,
//  the toolbar is the Phase 9 toolbar.
//
//  History (Phase 11, D17): with `toolbar.undo` (default on) and while the
//  chart keeps history (`editing.history`: editing on, not controlled)
//  core adds the `history` group, Undo and Redo, after the panel group. It
//  is built from `layout.historyState` (cut off on `canUndo` / `canRedo`),
//  so `aria-disabled="true"` follows them (absent while available). A
//  disabled control stays focusable and in the roving set (the tab stop
//  skips it while nothing was focused yet: core `toolbarTabStop`), and its
//  click, Enter or Space does nothing. Otherwise they run the chart
//  editor's `undo()` / `redo()` (what the chart's methods run; the pipeline
//  announces the result) and focus stays on the button. The group never
//  moves into the More menu. With editing off it is never built (the
//  history state is not even read): the toolbar is unchanged.
//
//  Overflow (D3): the width the groups get is the chart's (`layout.mainWidth`,
//  measured by GantryComponent), less the `[ganttToolbar]` slot's border box
//  (its 11 px separator included) and the 10 px gap after it, and less the
//  legend's width and the gap before it while it sits in the toolbar (a
//  legend too wide to share the line even with the shortest toolbar wraps
//  onto its own line and takes nothing). Both are measured by this
//  component's own ResizeObserver, started once the chart has a width
//  (`toolbar.overflow: 'menu'` only). The layout is a computed with a
//  structural cut-off, so a resize re-renders the toolbar only when the
//  controls change. `toolbar.overflow: 'wrap'` never builds the menu (the
//  groups wrap, as before).
//
//  Keyboard (WAI-ARIA toolbar, D7): the built-in controls, More included,
//  are one roving set with one tab stop (`tabindex=0` on core
//  `toolbarTabStop`: the control focused last while it is shown, else the
//  first); ←/→ move and wrap, Home/End go to the ends (core
//  `toolbarFocusMove`; the arrows swap in RTL). Moving focus never presses
//  a control: a radio is checked by Space / Enter / click (the button's
//  native activation). The `[ganttToolbar]` content, the menu and the
//  legend stay outside the roving set.
//
//  The More menu (WAI-ARIA menu button, core `reduceMenu` /
//  `toolbarMenuKey`): click, Enter or Space on More toggles it (opening on
//  the checked item, else the first), ↓ opens it on that item and ↑ on the
//  last; inside, ↑/↓ wrap, Home/End go to the ends, Enter / Space / click
//  run the item's action and close it back to More, Esc closes it back to
//  More (prevented: it never reaches the chart's own Esc, which clears the
//  selection), Tab closes it and moves on, a press outside the menu and
//  More closes it (a DOCUMENT `pointerdown` listener in the capture phase,
//  only while open), and so does any change of the chart's width (its open
//  state is reset by `layout.mainWidth`; focus is left alone). While one of
//  its items holds focus, More is the toolbar's tab stop. A focused More or
//  menu item that a render removes hands focus to the toolbar's tab stop.
//
//  Export (Phase 12, D16): with `toolbar.export` (default off) and at
//  least one of `export.formats`, core adds the export group last (after
//  the views): one icon menu button, Export, whose menu lists the formats
//  (SVG image, PNG image, CSV table, Print…). It is a second menu button
//  with the same keys, focus rules and closing rules as More (`reduceMenu`,
//  `toolbarMenuKey`; it opens on its first item, as nothing in it is
//  checked), painted by the same menu block (one id, the `aria-controls` of
//  the button that opened it), named `labels.exportMenu`. That block sits
//  after the last group, which is always the opener's: core moves the
//  export group into More first, so Export and More never show together.
//  One menu at a time: each has its own state (`menuState`, `exportState`),
//  opening one closes the other, and a press outside, a width change and
//  the toolbar going away close both. The export group is the first to move
//  into More, where its formats become a section named `labels.exportMenu`
//  (never a nested menu); an open Export menu whose group has moved (or
//  gone) closes after the render, focus left alone. Choosing a format, from
//  either menu, closes the menu back to its button first, then runs the
//  chart's `GanttExportService.run(format, 'toolbar')` (`download()`, or
//  `print()`; it never rejects: a failure is announced in the alert region).
//
//  Print (D17): under `@media print` the toolbar is not shown (its host is
//  `display: none`, the Web Component's `.gantry-toolbar-container`).
//
//  Each control emits its action; GantryComponent runs it (zoomIn,
//  zoomOut, fitToScreen, scrollToToday, setViewMode, setView, togglePanel).
//  Undo and Redo run the chart's editor (`GanttEditorService`) directly.
// ─────────────────────────────────────────────────────────────

import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
  type WritableSignal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  buildToolbar,
  estimateToolbarWidth,
  layoutToolbar,
  reduceMenu,
  resolveKey,
  TOOLBAR_MENU_CLOSED,
  toolbarFocusMove,
  toolbarItems,
  toolbarMenuChecked,
  toolbarMenuItems,
  toolbarMenuKey,
  toolbarTabStop,
  toggleRowsMode,
  type Command,
  type GanttExportFormat,
  type GanttHistoryState,
  type GanttRowsMode,
  type GanttView,
  type GanttZoomLevel,
  type MoveCommand,
  type ResolvedToolbar,
  type ToolbarAction,
  type ToolbarGroup,
  type ToolbarItem,
  type ToolbarLayout,
  type ToolbarMenuEvent,
  type ToolbarMenuItem,
  type ToolbarMenuSection,
  type ToolbarMenuState,
} from '@gantryjs/core';

import { GanttEditorService } from '../editing/gantt-editor.service';
import { GanttExportService } from '../export/gantt-export.service';
import { GanttIconComponent } from '../icons/gantt-icon.component';
import { GanttLegendComponent } from '../legend/gantt-legend.component';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttI18nService } from '../services/gantt-i18n.service';

/** `<ng-template ganttToolbarGroup let-group>`: types the group template's context. */
@Directive({ selector: 'ng-template[ganttToolbarGroup]' })
export class GanttToolbarGroupTemplate {
  static ngTemplateContextGuard(_dir: GanttToolbarGroupTemplate, _ctx: unknown): _ctx is { $implicit: ToolbarGroup } {
    return true;
  }
}

/**
 * The control focused last in each chart (keyed by its layout service): the roving tab stop while
 * it is shown. Outlives the toolbar, which is removed while hidden, as the Web Component's region.
 */
const LAST_FOCUS = new WeakMap<GanttLayoutService, WritableSignal<string | null>>();

function lastFocusOf(layout: GanttLayoutService): WritableSignal<string | null> {
  let last = LAST_FOCUS.get(layout);
  if (!last) LAST_FOCUS.set(layout, (last = signal<string | null>(null)));
  return last;
}

const isMove = (command: Command | null): command is MoveCommand => command?.startsWith('move.') === true;

/** The toolbar's column gap (`.gantt-toolbar { gap: 6px 10px }`): after the slot, before the legend. */
const GROUP_GAP = 10;

/** Toolbars made so far: the menu's `id` (`gantry-<n>-tb-menu`) is unique in the page. */
let nextToolbarId = 0;

/**
 * Which menu: More's (`ToolbarLayout.menu`) or Export's (`ToolbarLayout.exportMenu`). Also the
 * `data-focus-key` of the button that opens it.
 */
type MenuKind = 'more' | 'export';

/** The menu the toolbar shows: which one, its name and its sections. */
interface OpenMenu {
  readonly kind: MenuKind;
  /** `aria-label`: `labels.more` / `labels.exportMenu` */
  readonly label: string;
  readonly sections: readonly ToolbarMenuSection[];
}

/** The menu a menu button's action opens, or `null`. */
const menuOf = (action: ToolbarAction): MenuKind | null =>
  action.type === 'menu' ? 'more' : action.type === 'exportMenu' ? 'export' : null;

/** The groups after the `[ganttToolbar]` slot, in core order: the views, Export, More */
const TRAILING: ReadonlySet<string> = new Set(['views', 'export', 'more']);

/**
 * Plain-data equality (primitives, arrays, plain objects): the fitted toolbar's cut-off, as the
 * Web Component's `structuralEqual`.
 */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra);
  return keys.length === Object.keys(rb).length && keys.every(k => Object.hasOwn(rb, k) && sameData(ra[k], rb[k]));
}

@Component({
  selector: 'gantt-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, GanttIconComponent, GanttLegendComponent, GanttToolbarGroupTemplate],
  // The keys and the focus of the controls bubble here (the toolbar itself is not focusable)
  host: { '(keydown)': 'onKeyDown($event)', '(focusin)': 'onFocusIn($event)', '(focusout)': 'onFocusOut($event)' },
  template: `
    <div class="gantt-toolbar" role="toolbar" [attr.aria-label]="labels().ariaToolbar">
      @for (group of leading(); track group.key) {
        <ng-container *ngTemplateOutlet="groupTpl; context: { $implicit: group }" />
      }
      <!-- [ganttToolbar] content, outside the roving set; gantt-tb-slot as its first class keeps the groups' paint keys -->
      <div #slot class="gantt-tb-slot gantt-tb-group"><ng-content /></div>
      @for (group of trailing(); track group.key) {
        <ng-container *ngTemplateOutlet="groupTpl; context: { $implicit: group }" />
      }
      <!-- The open menu, More's or Export's: right after the group of its button (the last one: Export
           and More never show together), attached while open (D26) -->
      @if (menu(); as current) {
        <div #menuEl class="gantt-tb-menu" role="menu" [attr.id]="menuId" [attr.aria-label]="current.label">
          @for (section of current.sections; track section.key) {
            <div [attr.class]="section.className" role="group" [attr.aria-label]="section.ariaLabel">
              @for (item of section.items; track item.focusKey) {
                <button
                  #menuItem
                  type="button"
                  tabindex="-1"
                  [attr.class]="item.className"
                  [attr.data-focus-key]="item.focusKey"
                  [attr.role]="item.role"
                  [attr.aria-checked]="item.checked"
                  (click)="choose(item)"
                >
                  @if (item.icon; as icon) {
                    <svg [ganttIcon]="icon"></svg>
                  }
                  <span class="gantt-tb-label">{{ item.text }}</span>
                </button>
              }
            </div>
          }
        </div>
      }
      @if (layout.legendPlacement() === 'toolbar') {
        <div #legend class="gantt-legend gantt-legend--toolbar" ganttLegend></div>
      }
    </div>

    <ng-template #groupTpl ganttToolbarGroup let-group>
      <div [attr.class]="group.className" [attr.role]="group.role" [attr.aria-label]="group.ariaLabel">
        @for (item of group.items; track item.focusKey) {
          <button
            #control
            type="button"
            [attr.class]="item.className"
            [attr.data-focus-key]="item.focusKey"
            [attr.role]="item.role"
            [attr.aria-checked]="item.checked"
            [attr.aria-pressed]="item.pressed"
            [attr.aria-haspopup]="item.haspopup"
            [attr.aria-expanded]="item.expanded"
            [attr.aria-controls]="item.expanded === true ? menuId : null"
            [attr.aria-label]="item.ariaLabel"
            [attr.title]="item.title"
            [attr.aria-disabled]="item.disabled"
            [attr.tabindex]="item.focusKey === tabStop() ? 0 : -1"
            (click)="activate(item)"
          >
            @if (item.icon; as icon) {
              <svg [ganttIcon]="icon"></svg>
            }
            @if (item.text !== null) {
              @if (item.icon) {
                <span class="gantt-tb-label">{{ item.text }}</span>
              } @else {
                <ng-container>{{ item.text }}</ng-container>
              }
            }
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* The Web Component's TOOLBAR_CSS (styles/toolbar.css.ts), rule for rule; its .gantt-tb-icon rule
         is the icon component's own :host rule */
      .gantt-toolbar {
        position: relative;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
        padding: 6px 10px;
        background: var(--gantt-header-bg);
        border-bottom: 1px solid var(--gantt-border);
      }
      .gantt-tb-group {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .gantt-tb-group + .gantt-tb-group {
        padding-left: 10px;
        border-left: 1px solid var(--gantt-border);
      }
      /* The [ganttToolbar] group takes no room while nothing is projected (Angular only) */
      .gantt-tb-slot:empty {
        display: none;
      }
      .gantt-tb-views {
        margin-left: auto;
        border-left: none !important;
      }
      /* More: at the far end, right after the views while they show */
      .gantt-tb-more-group {
        margin-left: auto;
      }
      .gantt-tb-group + .gantt-tb-more-group {
        border-left: none;
      }
      .gantt-tb-views + .gantt-tb-more-group {
        margin-left: 0;
        border-left: 1px solid var(--gantt-border);
      }
      .gantt-tb-more-group ~ .gantt-legend--toolbar {
        margin-left: 0;
      }
      /* Export: at the far end too, right after the views while they show (it moves into More first) */
      .gantt-tb-export-group {
        margin-left: auto;
      }
      .gantt-tb-group + .gantt-tb-export-group {
        border-left: none;
      }
      .gantt-tb-views + .gantt-tb-export-group {
        margin-left: 0;
        border-left: 1px solid var(--gantt-border);
      }
      .gantt-tb-export-group ~ .gantt-legend--toolbar {
        margin-left: 0;
      }
      /* Every control at least the density's control size square (the chart's private
         --gantry-control-size: 28 / 32 / 36 px, 32 px by default, WCAG 2.5.8), 16 px icons */
      .gantt-tb-btn,
      .gantt-tb-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-sizing: border-box;
        min-width: var(--gantry-control-size, 32px);
        min-height: var(--gantry-control-size, 32px);
        margin: 0;
        padding: 0 7px;
        font: inherit;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        border-radius: 6px;
        border: 1px solid var(--gantt-border);
        background: var(--gantt-panel-bg);
        color: var(--gantt-text-sec);
      }
      .gantt-tb-pill {
        border-color: transparent;
        background: transparent;
      }
      .gantt-tb-btn:hover,
      .gantt-tb-pill:hover {
        color: var(--gantt-text);
        border-color: var(--gantt-border);
      }
      /* Undo / Redo with nothing to undo / redo: muted, no hover change, the default cursor (still
         focusable, so they keep their focus ring) */
      .gantt-tb-btn[aria-disabled='true'],
      .gantt-tb-btn[aria-disabled='true']:hover {
        color: var(--gantt-text-muted);
        border-color: var(--gantt-border);
        cursor: default;
      }
      .gantt-tb-btn:focus-visible,
      .gantt-tb-pill:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: 1px;
      }
      .gantt-tb-pill[aria-checked='true'] {
        background: var(--gantt-bar);
        border-color: var(--gantt-bar);
        color: var(--gantt-bar-text-on-bar);
      }
      .gantt-tb-btn[aria-pressed='true'] {
        background: color-mix(in srgb, var(--gantt-bar) 12%, var(--gantt-panel-bg));
        border-color: var(--gantt-bar);
        color: var(--gantt-bar);
      }
      .gantt-tb-today {
        color: var(--gantt-today);
        border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent);
      }
      .gantt-tb-label {
        display: block;
      }

      /* More and Export menus (WAI-ARIA menu buttons): under the toolbar at its end (the toolbar is its
         containing block), above the panes' sticky headers, splitter and state box */
      .gantt-tb-menu {
        position: absolute;
        top: 100%;
        inset-inline-end: 8px;
        z-index: 14;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        min-width: 160px;
        max-height: 70vh;
        overflow-y: auto;
        margin-top: 4px;
        padding: 4px;
        border-radius: 8px;
        border: 1px solid var(--gantt-border);
        background: var(--gantt-panel-bg);
        color: var(--gantt-text);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      }
      .gantt-tb-menu-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .gantt-tb-menu-group + .gantt-tb-menu-group {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid var(--gantt-border);
      }
      .gantt-tb-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        width: 100%;
        min-height: var(--gantry-control-size, 32px);
        margin: 0;
        padding: 0 10px;
        font: inherit;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        text-align: start;
        cursor: pointer;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--gantt-text);
      }
      .gantt-tb-menu-item:hover {
        background: var(--gantt-header-bg);
      }
      .gantt-tb-menu-item:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: -2px;
      }
      .gantt-tb-menu-item[aria-checked='true'] {
        background: var(--gantt-bar);
        border-color: var(--gantt-bar);
        color: var(--gantt-bar-text-on-bar);
      }

      /* The legend as the toolbar's last child: at the far end, after the view switch when there is one */
      .gantt-legend--toolbar {
        margin-left: auto;
      }
      .gantt-tb-views ~ .gantt-legend--toolbar {
        margin-left: 0;
      }
      .gantt-tb-group:not(.gantt-tb-slot:empty) ~ .gantt-legend--toolbar {
        padding-left: 10px;
        border-left: 1px solid var(--gantt-border);
      }

      /* Print (D17, the Web Component's styles/print.css.ts): the page's own print (Ctrl+P) shows no
         toolbar, its menus included (the Web Component's .gantry-toolbar-container) */
      @media print {
        :host {
          display: none;
        }
      }

      /* Forced colours (D25): the checked radio and menu item Highlight / HighlightText, opting out of
         forcing (the Canvas text backplate would hide HighlightText); the pressed panel toggle and the
         open menu button (More, Export) Highlight; a disabled Undo / Redo GrayText (important: over
         the disabled :hover rule); the More and Export menus Canvas / CanvasText. The focus ring is the
         chart's --gantt-focus-ring, Highlight in this mode */
      @media (forced-colors: active) {
        .gantt-tb-pill[aria-checked='true'],
        .gantt-tb-menu-item[aria-checked='true'] {
          forced-color-adjust: none;
          background-color: Highlight;
          border-color: Highlight;
          color: HighlightText;
        }
        .gantt-tb-btn[aria-pressed='true'] {
          color: Highlight;
          border-color: Highlight;
        }
        .gantt-tb-more[aria-expanded='true'],
        .gantt-tb-export[aria-expanded='true'] {
          color: Highlight;
          border-color: Highlight;
        }
        .gantt-tb-btn[aria-disabled='true'] {
          color: GrayText !important;
          border-color: GrayText !important;
        }
        .gantt-tb-menu {
          background-color: Canvas;
          color: CanvasText;
          border-color: CanvasText;
        }
      }
    `,
  ],
})
export class GanttToolbarComponent {
  readonly toolbar = input<ResolvedToolbar>({
    zoom: true,
    viewModes: false,
    today: true,
    viewToggle: false,
    fit: true,
    panelToggle: false,
    overflow: 'menu',
    undo: true,
    export: false,
    rowsToggle: false,
  });
  readonly zoomLevels = input<readonly GanttZoomLevel[]>([]);
  /** Name of the zoom level shown (checks its radio) */
  readonly currentView = input<string>('Month');
  readonly view = input<GanttView>('split');

  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  /** The Fit button (`toolbar.fit`): GantryComponent runs `fitToScreen()` */
  readonly fit = output<void>();
  readonly viewModeChange = output<string>();
  readonly scrollToToday = output<void>();
  readonly viewChange = output<GanttView>();
  /** The task list toggle (`toolbar.panelToggle`): GantryComponent runs `togglePanel()` */
  readonly togglePanel = output<void>();
  /** The rows toggle (`toolbar.rowsToggle`): the rows to show now, one per task or one per resource */
  readonly rowsChange = output<GanttRowsMode>();

  protected readonly labels = inject(GanttI18nService).labels;
  protected readonly layout = inject(GanttLayoutService);
  /** The chart's change pipeline: Undo / Redo */
  private readonly editor = inject(GanttEditorService);
  /** The chart's export run: the Export menu's formats (`toolbar.export`) */
  private readonly exporter = inject(GanttExportService);
  private readonly doc = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** `id` of the menu, More's or Export's (`aria-controls` of the button that opened it while it is open) */
  protected readonly menuId = `gantry-${++nextToolbarId}-tb-menu`;

  /** The built-in controls (the `[ganttToolbar]` content and the menu items are not among them) */
  private readonly controls = viewChildren<ElementRef<HTMLButtonElement>>('control');
  /** The open menu's items */
  private readonly menuItemRefs = viewChildren<ElementRef<HTMLButtonElement>>('menuItem');
  private readonly menuRef = viewChild<ElementRef<HTMLElement>>('menuEl');
  private readonly slotRef = viewChild.required<ElementRef<HTMLElement>>('slot');
  private readonly legendRef = viewChild<unknown, ElementRef<HTMLElement>>('legend', { read: ElementRef });
  /** `data-focus-key` of the control focused last: the tab stop while it is shown (More while a menu item is) */
  private readonly lastFocus = lastFocusOf(this.layout);

  /** Border-box width of the `[ganttToolbar]` slot (0 while empty or not measured; this component's observer) */
  private readonly slotW = signal(0);
  /** Border-box width of the legend while it sits in the toolbar, else 0 (this component's observer) */
  private readonly legendW = signal(0);

  /** The More menu's state (core `reduceMenu`): closed again by any change of the chart's width */
  private readonly menuState = linkedSignal<number, ToolbarMenuState>({
    source: this.layout.mainWidth,
    computation: () => TOOLBAR_MENU_CLOSED,
  });
  private readonly open = computed(() => this.menuState().open);
  /** The Export menu's state: the same rules; never open with More's (opening one closes the other) */
  private readonly exportState = linkedSignal<number, ToolbarMenuState>({
    source: this.layout.mainWidth,
    computation: () => TOOLBAR_MENU_CLOSED,
  });
  private readonly exportOpen = computed(() => this.exportState().open);

  /** The density's control size (`ResolvedGanttConfig.controlSize`) */
  private readonly controlSize = computed(() => this.layout.cfg().controlSize);

  /**
   * The Export menu's formats (`export.formats`) while the toolbar has one (`toolbar.export`), else
   * `null` (no export group; the export options are not read). Compared by value: another option
   * change leaves the toolbar alone.
   */
  private readonly exportInput = computed<{ formats: readonly GanttExportFormat[] } | null>(
    () => (this.toolbar().export ? { formats: this.layout.cfg().export.formats } : null),
    { equal: sameData },
  );

  /**
   * The undo / redo state while the chart keeps history (`editing.history`), else `null` (no
   * history group; the state is not read). Cut off on what the buttons show: another step changes
   * the counts and labels, not the toolbar.
   */
  private readonly history = computed<GanttHistoryState | null>(
    () => (this.layout.cfg().editing.history ? this.layout.historyState() : null),
    { equal: (a, b) => a === b || (!!a && !!b && a.canUndo === b.canUndo && a.canRedo === b.canRedo) },
  );

  /** The rows shown (the resolved `rows`) */
  private readonly rows = computed(() => this.layout.cfg().rows);

  /** Core `buildToolbar()`: the groups in display order, each with its controls */
  protected readonly groups = computed<ToolbarGroup[]>(() =>
    buildToolbar({
      toolbar: this.toolbar(),
      zoomLevels: this.zoomLevels(),
      labels: this.labels(),
      viewMode: this.currentView(),
      view: this.view(),
      // Undo / Redo while the chart keeps history
      history: this.history(),
      // The Export menu button and its formats (`toolbar.export`)
      export: this.exportInput(),
      // The rows toggle: pressed in the resource view, shown only while the chart has resources
      rows: this.rows(),
      hasResources: this.layout.hasResources(),
    }),
  );

  /**
   * Core `layoutToolbar()` for the chart's width less the slot and the legend in the toolbar: the
   * groups shown (the More group last when some don't fit), the More menu's sections and the Export
   * menu's. Structurally compared: a resize changes it only when the controls change.
   */
  protected readonly fitted = computed<ToolbarLayout>(
    () => {
      const input = {
        groups: this.groups(),
        controlSize: this.controlSize(),
        overflow: this.toolbar().overflow,
        labels: this.labels(),
        menuOpen: this.open(),
        exportMenuOpen: this.exportOpen(),
      };
      const main = this.layout.mainWidth();
      const slot = this.slotW() > 0 ? this.slotW() + GROUP_GAP : 0;
      const legend = this.legendW() > 0 ? this.legendW() + GROUP_GAP : 0;
      // What the groups and the legend share (0: not measured, every group shows)
      const line = main > 0 ? Math.max(1, main - slot) : 0;
      const layout = layoutToolbar({ ...input, width: line - legend });
      // A legend too wide to share the line even with the shortest toolbar wraps onto its own line
      if (legend > 0 && line > 0 && estimateToolbarWidth(layout.groups, input) > line - legend) {
        return layoutToolbar({ ...input, width: line });
      }
      return layout;
    },
    { equal: sameData },
  );

  /** The groups before the `[ganttToolbar]` slot */
  protected readonly leading = computed(() => this.fitted().groups.filter(g => !TRAILING.has(g.key)));
  /** The view switch, the Export button and the More button, after the slot */
  protected readonly trailing = computed(() => this.fitted().groups.filter(g => TRAILING.has(g.key)));
  /**
   * The open menu (More's or Export's, one at a time) while its button shows, else `null` (not
   * attached): its name and its sections
   */
  protected readonly menu = computed<OpenMenu | null>(
    () => {
      const layout = this.fitted();
      if (this.open() && layout.menu) return { kind: 'more', label: this.labels().more, sections: layout.menu };
      if (this.exportOpen() && layout.exportMenu)
        return { kind: 'export', label: this.labels().exportMenu, sections: layout.exportMenu };
      return null;
    },
    {
      equal: (a, b) => a === b || (!!a && !!b && a.kind === b.kind && a.label === b.label && a.sections === b.sections),
    },
  );
  /** The More menu's items in display (and arrow-key) order: `reduceMenu`'s count and indexes */
  private readonly menuItems = computed(() => toolbarMenuItems(this.fitted().menu));
  /** The Export menu's items, in the same order */
  private readonly exportItems = computed(() => toolbarMenuItems(this.fitted().exportMenu));
  /** Every control in roving order */
  private readonly items = computed(() => toolbarItems(this.fitted().groups));
  /** `data-focus-key` of the one control with `tabindex=0` */
  protected readonly tabStop = computed(() => toolbarTabStop(this.items(), this.lastFocus()));

  /**
   * The menu button (More, Export) or menu item that received focus last (handed to the tab stop
   * when a render removes it)
   */
  private focused: HTMLElement | null = null;
  /** The outside-press listener on the document, while a menu is open */
  private outside: ((event: Event) => void) | null = null;
  /** Measures the slot (and the legend in the toolbar) once the chart has a width */
  private observer: ResizeObserver | null = null;
  private observedLegend: HTMLElement | null = null;

  constructor() {
    // The slot's and the legend's widths, measured in the browser once the chart is (the layout
    // needs no measurement before it, or with `overflow: 'wrap'`)
    afterRenderEffect(() => {
      const on = this.layout.mainWidth() > 0 && this.toolbar().overflow === 'menu';
      const legend = this.legendRef()?.nativeElement ?? null;
      untracked(() => this.watch(on, legend));
    });
    // The outside press closes the open menu: listened to only while one is open
    afterRenderEffect(() => {
      const open = this.open() || this.exportOpen();
      untracked(() => this.listenOutside(open));
    });
    // An open Export menu whose button no longer shows (its group moved into More, or went) closes
    // once rendered without it, focus left alone (a focused item it took away goes to the tab stop)
    afterRenderEffect(() => {
      const stale = this.exportOpen() && this.fitted().exportMenu === null;
      if (stale) untracked(() => this.exportState.set(TOOLBAR_MENU_CLOSED));
    });
    // A focused menu button (More, Export) or menu item that this render removed (the menu closed by
    // a resize or a press, everything fits again, Export moved into More) hands focus to the
    // toolbar's tab stop, before the chart's focus restore would give it to the timeline
    afterRenderEffect({
      earlyRead: () => {
        this.fitted();
        this.menu();
        untracked(() => this.handOff());
      },
    });
    inject(DestroyRef).onDestroy(() => {
      this.listenOutside(false);
      this.observer?.disconnect();
      this.observer = null;
    });
  }

  /**
   * A built-in control was activated (click, or Enter / Space through the button's native click).
   * An `aria-disabled` one (Undo / Redo with nothing to do) is focusable but inert.
   */
  protected activate(item: ToolbarItem): void {
    if (item.disabled === true) return;
    const kind = menuOf(item.action);
    if (kind !== null) {
      // More or Export: opens on the checked item, else the first (Export: always)
      this.dispatch(kind, { type: 'open', via: 'click', checked: toolbarMenuChecked(this.itemsOf(kind)) });
    } else {
      this.run(item.action);
    }
  }

  /**
   * A menu item was activated: its action, then the menu closes back to its button. A format
   * (Export menu, or its section in More) closes it first: the download or the print dialog starts
   * from the button (and the dialog gives focus back to it).
   */
  protected choose(item: ToolbarMenuItem): void {
    const kind = this.openKind();
    if (kind === null) return;
    if (item.action.type === 'export') {
      this.dispatch(kind, { type: 'select' });
      this.run(item.action);
    } else {
      this.run(item.action);
      this.dispatch(kind, { type: 'select' });
    }
  }

  protected run(action: ToolbarAction): void {
    switch (action.type) {
      case 'zoomOut':
        return this.zoomOut.emit();
      case 'zoomIn':
        return this.zoomIn.emit();
      case 'fit':
        return this.fit.emit();
      case 'today':
        return this.scrollToToday.emit();
      case 'zoomLevel':
        return this.viewModeChange.emit(action.level);
      case 'view':
        return this.viewChange.emit(action.view);
      case 'togglePanel':
        return this.togglePanel.emit();
      case 'rows':
        return this.rowsChange.emit(toggleRowsMode(this.rows()));
      case 'menu':
      case 'exportMenu':
        // The More and Export buttons: their menus (see `activate`)
        return;
      case 'undo':
        // The chart's undo() / redo(): through the pipeline, which announces the result (a disabled
        // button never gets here)
        this.editor.undo();
        return;
      case 'redo':
        this.editor.redo();
        return;
      case 'export':
        // A format of the Export menu (or its section in More): `download()` / `print()` from the
        // toolbar. It never rejects: a failure is announced in the alert region
        void this.exporter.run(action.format, 'toolbar');
        return;
    }
  }

  /**
   * The menu's keys first (each handled is prevented, so the chart's shortcuts, Esc's
   * `clearSelection` included, skip it; Tab is not: it moves focus on), then ←/→ (wrapping) and
   * Home/End along the controls; other keys are left alone.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (this.menuItemOf(event.target)) {
      const kind = this.openKind();
      const menuEvent = toolbarMenuKey(event, 'menu');
      if (menuEvent && kind !== null) this.handleMenuKey(kind, event, menuEvent);
      return;
    }
    const key = this.controlKey(event.target);
    if (key === null) return;
    if (key === 'more' || key === 'export') {
      let menuEvent = toolbarMenuKey(event, 'button');
      // Opens on the checked item (a zoom level, a view), else the first (Export: always)
      if (menuEvent?.type === 'open') menuEvent = { ...menuEvent, checked: toolbarMenuChecked(this.itemsOf(key)) };
      else if (!menuEvent && this.openKind() === key) {
        // The menu button itself holding focus with its menu open: Esc and Tab close it too
        const close = toolbarMenuKey(event, 'menu');
        if (close?.type === 'close') menuEvent = close;
      }
      if (menuEvent) {
        this.handleMenuKey(key, event, menuEvent);
        return;
      }
    }
    const rtl = this.doc.defaultView?.getComputedStyle(event.currentTarget as Element).direction === 'rtl';
    const command = resolveKey(event, 'toolbar', { rtl });
    if (!isMove(command)) return;
    const next = toolbarFocusMove(this.items(), key, command);
    const target = next === null ? undefined : this.control(next);
    if (!target) return;
    // Handled here: the chart's shortcuts (and the grid / timeline keys) skip a prevented key
    event.preventDefault();
    target.focus();
  }

  protected onFocusIn(event: FocusEvent): void {
    const item = this.menuItemOf(event.target);
    if (item) {
      const kind = this.openKind();
      if (kind === null) return;
      // The menu's items are not tab stops: the button that opened it stands for them in the roving set
      this.focused = item;
      this.lastFocus.set(kind);
      const key = item.getAttribute('data-focus-key');
      this.dispatch(kind, { type: 'focus', index: this.itemsOf(kind).findIndex(i => i.focusKey === key) });
      return;
    }
    const key = this.controlKey(event.target);
    if (key === null) return;
    this.lastFocus.set(key);
    this.focused = key === 'more' || key === 'export' ? (event.target as Element).closest('button') : null;
  }

  /** Focus moved to another control outside the toolbar: nothing to hand back. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) this.focused = null;
  }

  private handleMenuKey(kind: MenuKind, event: KeyboardEvent, menuEvent: ToolbarMenuEvent): void {
    if (menuEvent.type !== 'close' || menuEvent.reason !== 'tab') event.preventDefault();
    this.dispatch(kind, menuEvent);
  }

  /** The state of `kind`'s menu. */
  private stateOf(kind: MenuKind): WritableSignal<ToolbarMenuState> {
    return kind === 'more' ? this.menuState : this.exportState;
  }

  /** The items of `kind`'s menu, in display order. */
  private itemsOf(kind: MenuKind): readonly ToolbarMenuItem[] {
    return kind === 'more' ? this.menuItems() : this.exportItems();
  }

  /** The open menu (one at a time), or `null`. */
  private openKind(): MenuKind | null {
    return this.open() ? 'more' : this.exportOpen() ? 'export' : null;
  }

  /**
   * Runs `event` for the menu of `kind` through core `reduceMenu` and moves focus where it says.
   * One menu at a time: opening one closes the other.
   */
  private dispatch(kind: MenuKind, event: ToolbarMenuEvent): void {
    const own = this.stateOf(kind);
    const items = this.itemsOf(kind);
    const { state, focus } = reduceMenu(own(), event, items.length);
    own.set(state);
    if (state.open) {
      const other = this.stateOf(kind === 'more' ? 'export' : 'more');
      if (other().open) other.set(TOOLBAR_MENU_CLOSED);
    }
    if (focus === 'item') {
      const key = items[state.active]?.focusKey;
      if (key !== undefined) this.focusMenuItem(key);
    } else if (focus === 'button') {
      this.control(kind)?.focus();
    }
  }

  /** Focuses the menu item `key`: now when it is rendered (a move in the open menu), else after the render that mounts it. */
  private focusMenuItem(key: string): void {
    const node = this.menuItemEl(key);
    if (node) node.focus();
    else afterNextRender(() => this.menuItemEl(key)?.focus(), { injector: this.injector });
  }

  /** After a render: a focused menu button or menu item it removed hands focus to the toolbar's tab stop. */
  private handOff(): void {
    const el = this.focused;
    if (!el || el.isConnected) return;
    this.focused = null;
    // Focus went elsewhere already (a press on another control): leave it there
    const active = this.doc.activeElement;
    if (active !== null && active !== this.doc.body) return;
    const stop = this.tabStop();
    if (stop !== null) this.control(stop)?.focus({ preventScroll: true });
  }

  private listenOutside(on: boolean): void {
    if (on === (this.outside !== null)) return;
    if (on) {
      this.outside = event => {
        const kind = this.openKind();
        if (kind === null) return;
        const path = event.composedPath();
        const menu = this.menuRef()?.nativeElement;
        const button = this.control(kind);
        if ((menu && path.includes(menu)) || (button && path.includes(button))) return;
        this.dispatch(kind, { type: 'close', reason: 'outside' });
      };
      this.doc.addEventListener('pointerdown', this.outside, { capture: true });
    } else {
      this.doc.removeEventListener('pointerdown', this.outside!, { capture: true });
      this.outside = null;
    }
  }

  /** Observes the slot (and `legend`, the legend in the toolbar) while `on`; else stops and forgets their widths. */
  private watch(on: boolean, legend: HTMLElement | null): void {
    if (!on) {
      this.observer?.disconnect();
      this.observer = null;
      this.observedLegend = null;
      this.slotW.set(0);
      this.legendW.set(0);
      return;
    }
    if (!this.observer) {
      const Observer = this.doc.defaultView?.ResizeObserver;
      if (!Observer) return;
      // A measurement, outside the render: what the layout reads next
      this.observer = new Observer(() => this.measure());
      this.observer.observe(this.slotRef().nativeElement);
    }
    if (legend === this.observedLegend) return;
    if (this.observedLegend) this.observer.unobserve(this.observedLegend);
    this.observedLegend = legend;
    if (legend) this.observer.observe(legend);
    else this.legendW.set(0);
  }

  private measure(): void {
    this.slotW.set(this.slotRef().nativeElement.offsetWidth);
    const legend = this.observedLegend;
    this.legendW.set(legend?.isConnected ? legend.offsetWidth : 0);
  }

  /** `data-focus-key` of the built-in control `target` is in, else `null` (slot content, menu, legend). */
  private controlKey(target: EventTarget | null): string | null {
    const button = (target as Element | null)?.closest?.('button') ?? null;
    if (!button || !this.controls().some(c => c.nativeElement === button)) return null;
    return button.getAttribute('data-focus-key');
  }

  /** The menu item `target` is in, else `null`. */
  private menuItemOf(target: EventTarget | null): HTMLButtonElement | null {
    const button = (target as Element | null)?.closest?.('button') ?? null;
    return button && this.menuItemRefs().some(c => c.nativeElement === button) ? button : null;
  }

  private control(focusKey: string): HTMLButtonElement | undefined {
    return this.controls().find(c => c.nativeElement.getAttribute('data-focus-key') === focusKey)?.nativeElement;
  }

  private menuItemEl(focusKey: string): HTMLButtonElement | undefined {
    return this.menuItemRefs().find(c => c.nativeElement.getAttribute('data-focus-key') === focusKey)?.nativeElement;
  }
}
