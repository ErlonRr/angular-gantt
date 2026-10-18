// ─────────────────────────────────────────────────────────────
//  gantry · annotations/gantt-toolbar.component.ts
//
//  Toolbar above the chart: core `buildToolbar()` painted as is (the
//  same groups, controls, classes, roles and names as the Web Component's
//  `layers/toolbar.ts`), configurable through `options.toolbar`:
//
//    div.gantt-toolbar[role=toolbar][aria-label]
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
//      div.gantt-legend.gantt-legend--toolbar (`legend.position: 'toolbar'`, while placed here)
//
//  Every built-in button carries `data-focus-key` (`zoom-out`, `zoom-in`,
//  `fit`, `zoom:<level>`, `today`, `view:<view>`): groups are keyed by
//  `ToolbarGroup.key` and buttons by it, so a control keeps its node, and
//  keyboard focus, across zooms, view switches and option changes.
//
//  Keyboard (WAI-ARIA toolbar, D7): the built-in controls are one roving
//  set with one tab stop (`tabindex=0` on core `toolbarTabStop`: the
//  control focused last while it is shown, else the first); ←/→ move and
//  wrap, Home/End go to the ends (core `toolbarFocusMove`; the arrows swap
//  in RTL). Moving focus never presses a control: a radio is checked by
//  Space / Enter / click (the button's native activation). The
//  `[ganttToolbar]` content and the legend stay outside the roving set.
//
//  Each control emits its action; GantryComponent runs it (zoomIn,
//  zoomOut, fitToScreen, scrollToToday, setViewMode, setView).
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  DOCUMENT,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChildren,
  type WritableSignal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  buildToolbar,
  resolveKey,
  toolbarFocusMove,
  toolbarItems,
  toolbarTabStop,
  type Command,
  type GanttView,
  type GanttZoomLevel,
  type MoveCommand,
  type ResolvedToolbar,
  type ToolbarAction,
  type ToolbarGroup,
} from '@gantryjs/core';

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

@Component({
  selector: 'gantt-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, GanttIconComponent, GanttLegendComponent, GanttToolbarGroupTemplate],
  // The keys and the focus of the controls bubble here (the toolbar itself is not focusable)
  host: { '(keydown)': 'onKeyDown($event)', '(focusin)': 'onFocusIn($event)' },
  template: `
    <div class="gantt-toolbar" role="toolbar" [attr.aria-label]="labels().ariaToolbar">
      @for (group of leading(); track group.key) {
        <ng-container *ngTemplateOutlet="groupTpl; context: { $implicit: group }" />
      }
      <!-- [ganttToolbar] content, outside the roving set; gantt-tb-slot as its first class keeps the groups' paint keys -->
      <div class="gantt-tb-slot gantt-tb-group"><ng-content /></div>
      @if (views(); as group) {
        <ng-container *ngTemplateOutlet="groupTpl; context: { $implicit: group }" />
      }
      @if (layout.legendPlacement() === 'toolbar') {
        <div class="gantt-legend gantt-legend--toolbar" ganttLegend></div>
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
            [attr.aria-label]="item.ariaLabel"
            [attr.title]="item.title"
            [attr.tabindex]="item.focusKey === tabStop() ? 0 : -1"
            (click)="run(item.action)"
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
      .gantt-toolbar {
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
      /* The [ganttToolbar] group takes no room while nothing is projected */
      .gantt-tb-slot:empty {
        display: none;
      }
      .gantt-tb-views {
        margin-left: auto;
        border-left: none !important;
      }
      /* Every control at least 32 px square (WCAG 2.5.8), 16 px icons */
      .gantt-tb-btn,
      .gantt-tb-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-sizing: border-box;
        min-width: 32px;
        min-height: 32px;
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
      .gantt-tb-today {
        color: var(--gantt-today);
        border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent);
      }
      .gantt-tb-label {
        display: block;
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

      /* Forced colours (D25): the checked radio Highlight / HighlightText, opting out of forcing (the
         Canvas text backplate would hide HighlightText); the focus ring is the chart's
         --gantt-focus-ring, Highlight in this mode */
      @media (forced-colors: active) {
        .gantt-tb-pill[aria-checked='true'] {
          forced-color-adjust: none;
          background-color: Highlight;
          border-color: Highlight;
          color: HighlightText;
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

  protected readonly labels = inject(GanttI18nService).labels;
  protected readonly layout = inject(GanttLayoutService);
  private readonly doc = inject(DOCUMENT);

  /** The built-in controls (the `[ganttToolbar]` content is not among them) */
  private readonly controls = viewChildren<ElementRef<HTMLButtonElement>>('control');
  /** `data-focus-key` of the control focused last: the tab stop while it is shown */
  private readonly lastFocus = lastFocusOf(this.layout);

  /** Core `buildToolbar()`: the groups in display order, each with its controls */
  protected readonly groups = computed<ToolbarGroup[]>(() =>
    buildToolbar({
      toolbar: this.toolbar(),
      zoomLevels: this.zoomLevels(),
      labels: this.labels(),
      viewMode: this.currentView(),
      view: this.view(),
    }),
  );
  /** The groups before the `[ganttToolbar]` slot */
  protected readonly leading = computed(() => this.groups().filter(g => g.key !== 'views'));
  /** The view switch, after the slot */
  protected readonly views = computed(() => this.groups().find(g => g.key === 'views') ?? null);
  /** Every control in roving order */
  private readonly items = computed(() => toolbarItems(this.groups()));
  /** `data-focus-key` of the one control with `tabindex=0` */
  protected readonly tabStop = computed(() => toolbarTabStop(this.items(), this.lastFocus()));

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
    }
  }

  /** ←/→ (wrapping) and Home/End move the focus along the controls; other keys are left alone. */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const key = this.controlKey(event.target);
    if (key === null) return;
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
    const key = this.controlKey(event.target);
    if (key !== null) this.lastFocus.set(key);
  }

  /** `data-focus-key` of the built-in control `target` is in, else `null` (slot content, legend). */
  private controlKey(target: EventTarget | null): string | null {
    const button = (target as Element | null)?.closest?.('button') ?? null;
    if (!button || !this.controls().some(c => c.nativeElement === button)) return null;
    return button.getAttribute('data-focus-key');
  }

  private control(focusKey: string): HTMLButtonElement | undefined {
    return this.controls().find(c => c.nativeElement.getAttribute('data-focus-key') === focusKey)?.nativeElement;
  }
}
