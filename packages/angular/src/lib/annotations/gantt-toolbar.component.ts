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
//      div.gantt-tb-group.gantt-tb-more-group button.gantt-tb-btn.gantt-tb-more[aria-haspopup=menu][aria-expanded]
//                                               (while some groups don't fit; `aria-controls` while open)
//      div.gantt-tb-menu[role=menu][id][aria-label]                                     (while open)
//        div.gantt-tb-menu-group[role=group][aria-label]
//          button.gantt-tb-menu-item[role=menuitemradio|menuitem][aria-checked][tabindex=-1]
//            > svg.gantt-tb-icon? + span.gantt-tb-label
//      div.gantt-legend.gantt-legend--toolbar (`legend.position: 'toolbar'`, while placed here)
//
//  Every built-in button carries `data-focus-key` (`panel`, `undo`, `redo`,
//  `zoom-out`, `zoom-in`, `fit`, `zoom:<level>`, `today`, `view:<view>`,
//  `more`; menu items `menu:<key>`): groups are keyed by `ToolbarGroup.key` and buttons
//  by it, so a control keeps its node, and keyboard focus, across zooms,
//  view switches and option changes. The panel toggle, the More button and
//  the menu are attached only while shown (D26): at a width where
//  everything fits, without `panelToggle`, the toolbar is the Phase 9
//  toolbar.
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
  type Command,
  type GanttHistoryState,
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
  type ToolbarMenuState,
} from '@gantryjs/core';

import { GanttEditorService } from '../editing/gantt-editor.service';
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

/** Toolbars made so far: the More menu's `id` (`gantry-<n>-tb-menu`) is unique in the page. */
let nextToolbarId = 0;

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
      <!-- The More menu: right after the More group, attached while open (D26) -->
      @if (menu(); as sections) {
        <div #menuEl class="gantt-tb-menu" role="menu" [attr.id]="menuId" [attr.aria-label]="labels().more">
          @for (section of sections; track section.key) {
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

      /* More menu (WAI-ARIA menu button): under the toolbar at its end (the toolbar is its containing
         block), above the panes' sticky headers, splitter and state box */
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

      /* Forced colours (D25): the checked radio and menu item Highlight / HighlightText, opting out of
         forcing (the Canvas text backplate would hide HighlightText); the pressed panel toggle
         Highlight; a disabled Undo / Redo GrayText (important: over the disabled :hover rule); the
         More menu Canvas / CanvasText. The focus ring is the chart's --gantt-focus-ring, Highlight in
         this mode */
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

  protected readonly labels = inject(GanttI18nService).labels;
  protected readonly layout = inject(GanttLayoutService);
  /** The chart's change pipeline: Undo / Redo */
  private readonly editor = inject(GanttEditorService);
  private readonly doc = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** `id` of the More menu (`aria-controls` of More while it is open) */
  protected readonly menuId = `gantry-${++nextToolbarId}-tb-menu`;

  /** The built-in controls (the `[ganttToolbar]` content and the menu items are not among them) */
  private readonly controls = viewChildren<ElementRef<HTMLButtonElement>>('control');
  /** The More menu's items, while it is open */
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

  /** The density's control size (`ResolvedGanttConfig.controlSize`) */
  private readonly controlSize = computed(() => this.layout.cfg().controlSize);

  /**
   * The undo / redo state while the chart keeps history (`editing.history`), else `null` (no
   * history group; the state is not read). Cut off on what the buttons show: another step changes
   * the counts and labels, not the toolbar.
   */
  private readonly history = computed<GanttHistoryState | null>(
    () => (this.layout.cfg().editing.history ? this.layout.historyState() : null),
    { equal: (a, b) => a === b || (!!a && !!b && a.canUndo === b.canUndo && a.canRedo === b.canRedo) },
  );

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
    }),
  );

  /**
   * Core `layoutToolbar()` for the chart's width less the slot and the legend in the toolbar: the
   * groups shown (the More group last when some don't fit) and the menu's sections. Structurally
   * compared: a resize changes it only when the controls change.
   */
  protected readonly fitted = computed<ToolbarLayout>(
    () => {
      const input = {
        groups: this.groups(),
        controlSize: this.controlSize(),
        overflow: this.toolbar().overflow,
        labels: this.labels(),
        menuOpen: this.open(),
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
  protected readonly leading = computed(() => this.fitted().groups.filter(g => g.key !== 'views' && g.key !== 'more'));
  /** The view switch and the More button, after the slot */
  protected readonly trailing = computed(() => this.fitted().groups.filter(g => g.key === 'views' || g.key === 'more'));
  /** The More menu's sections while it is open, else `null` (not attached) */
  protected readonly menu = computed(() => (this.open() ? this.fitted().menu : null));
  /** The menu's items in display (and arrow-key) order: `reduceMenu`'s count and indexes */
  private readonly menuItems = computed(() => toolbarMenuItems(this.fitted().menu));
  /** Every control in roving order */
  private readonly items = computed(() => toolbarItems(this.fitted().groups));
  /** `data-focus-key` of the one control with `tabindex=0` */
  protected readonly tabStop = computed(() => toolbarTabStop(this.items(), this.lastFocus()));

  /** The More button or menu item that received focus last (handed to the tab stop when a render removes it) */
  private focused: HTMLElement | null = null;
  /** The outside-press listener on the document, while the menu is open */
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
    // The outside press closes the menu: listened to only while it is open
    afterRenderEffect(() => {
      const open = this.open();
      untracked(() => this.listenOutside(open));
    });
    // A focused More button or menu item that this render removed (the menu closed by a resize or a
    // press, everything fits again) hands focus to the toolbar's tab stop, before the chart's focus
    // restore would give it to the timeline
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
    if (item.action.type === 'menu') {
      this.dispatch({ type: 'open', via: 'click', checked: toolbarMenuChecked(this.menuItems()) });
    } else {
      this.run(item.action);
    }
  }

  /** A menu item was activated: its action, then the menu closes back to More. */
  protected choose(item: ToolbarMenuItem): void {
    this.run(item.action);
    this.dispatch({ type: 'select' });
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
      case 'menu':
        // The More button: its menu (see `activate`)
        return;
      case 'undo':
        // The chart's undo() / redo(): through the pipeline, which announces the result (a disabled
        // button never gets here)
        this.editor.undo();
        return;
      case 'redo':
        this.editor.redo();
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
      const menuEvent = toolbarMenuKey(event, 'menu');
      if (menuEvent) this.handleMenuKey(event, menuEvent);
      return;
    }
    const key = this.controlKey(event.target);
    if (key === null) return;
    if (key === 'more') {
      let menuEvent = toolbarMenuKey(event, 'button');
      if (menuEvent?.type === 'open') menuEvent = { ...menuEvent, checked: toolbarMenuChecked(this.menuItems()) };
      else if (!menuEvent && this.open()) {
        // More itself holding focus with its menu open: Esc and Tab close it too
        const close = toolbarMenuKey(event, 'menu');
        if (close?.type === 'close') menuEvent = close;
      }
      if (menuEvent) {
        this.handleMenuKey(event, menuEvent);
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
      // The menu's items are not tab stops: More stands for them in the roving set
      this.focused = item;
      this.lastFocus.set('more');
      const key = item.getAttribute('data-focus-key');
      this.dispatch({ type: 'focus', index: this.menuItems().findIndex(i => i.focusKey === key) });
      return;
    }
    const key = this.controlKey(event.target);
    if (key === null) return;
    this.lastFocus.set(key);
    this.focused = key === 'more' ? (event.target as Element).closest('button') : null;
  }

  /** Focus moved to another control outside the toolbar: nothing to hand back. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) this.focused = null;
  }

  private handleMenuKey(event: KeyboardEvent, menuEvent: ToolbarMenuEvent): void {
    if (menuEvent.type !== 'close' || menuEvent.reason !== 'tab') event.preventDefault();
    this.dispatch(menuEvent);
  }

  /** Runs `event` through core `reduceMenu` and moves focus where it says. */
  private dispatch(event: ToolbarMenuEvent): void {
    const items = this.menuItems();
    const { state, focus } = reduceMenu(this.menuState(), event, items.length);
    this.menuState.set(state);
    if (focus === 'item') {
      const key = items[state.active]?.focusKey;
      if (key !== undefined) this.focusMenuItem(key);
    } else if (focus === 'button') {
      this.control('more')?.focus();
    }
  }

  /** Focuses the menu item `key`: now when it is rendered (a move in the open menu), else after the render that mounts it. */
  private focusMenuItem(key: string): void {
    const node = this.menuItemEl(key);
    if (node) node.focus();
    else afterNextRender(() => this.menuItemEl(key)?.focus(), { injector: this.injector });
  }

  /** After a render: a focused More or menu item it removed hands focus to the toolbar's tab stop. */
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
        const path = event.composedPath();
        const menu = this.menuRef()?.nativeElement;
        const more = this.control('more');
        if ((menu && path.includes(menu)) || (more && path.includes(more))) return;
        this.dispatch({ type: 'close', reason: 'outside' });
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
