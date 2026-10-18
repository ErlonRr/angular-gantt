// ─────────────────────────────────────────────────────────────
//  gantry · selection/gantt-keyboard.directive.ts
//
//  The chart's keyboard (contract §3d of Gantry 2 phase 9), a host
//  directive of GantryComponent — the Web Component's
//  `interaction/keyboard.ts`. One `keydown` listener on the host resolves
//  every key through the core keymap (`resolveKey`, `config.keyboard`),
//  in the area that holds focus:
//
//   - a bar (`g.gantt-bars-layer > [data-task-id]`) → `'timeline'`
//     (`a11y/timeline-keys.ts`), and move mode while it is on
//     (`drag/keyboard-edit.ts`: modal, it takes every key first);
//   - the task list → `'grid'` (`a11y/grid-keys.ts`);
//   - anywhere else (the toolbar, which roves with its own listener; the
//     splitter's toggle; the timeline viewport while no bar is mounted,
//     whose arrow keys scroll natively) → `'any'`.
//
//  What the area leaves goes to the global shortcuts: Esc (D24: cancels
//  move mode or a pointer drag, else clears the selection — an open
//  tooltip closes first, in the capture phase), Ctrl/⌘+A, and + − T F
//  (`keyboard.characterShortcuts`). Keys nothing uses (and Alt
//  combinations, L, Delete, Ctrl+Z/Y until Phase 11) keep their default
//  action; so do text inputs in custom cells and the splitter.
//
//  Move mode also ends when focus leaves its bar (blur), on a pointer
//  press anywhere in the chart (capture phase, before a drag can start)
//  and when the chart is destroyed (quietly).
//
//  GantryComponent binds what the keys do to the chart (`bind`: outputs,
//  public actions, columns, visuals), starts the pointer listener after
//  the first render (`connect`) and, after every render, focuses the
//  control a key asked for when it was not mounted yet
//  (`takeFocusRequest`).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectorRef, DestroyRef, Directive, inject } from '@angular/core';
import { resolveKey, type KeyArea } from '@gantryjs/core';

import { GanttSelectionService } from './gantt-selection.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttAnnouncer } from '../a11y/announcer';
import { barHostOf } from '../bars/bar-focus.service';
import { handleGridKey, type GanttKeyContext, type GanttKeyboardHost } from '../a11y/grid-keys';
import { handleTimelineKey } from '../a11y/timeline-keys';
import { createKeyboardEdit, type KeyboardEdit } from '../drag/keyboard-edit';

/**
 * Typing in a consumer's cell control, or the splitter handle's keys (the separator resizes with
 * the arrows): the chart leaves them alone. The collapse toggle beside it is a plain button, as in
 * the Web Component (`interaction/keyboard.ts`).
 */
const isOwnKeys = (el: Element): boolean =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
  (el as HTMLElement).isContentEditable === true ||
  el.classList.contains('gantry-splitter-handle');

@Directive({
  selector: '[ganttKeyboard]',
  host: {
    '(keydown)': 'onKeyDown($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class GanttKeyboardDirective {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** What the keys read and write; set by `bind` */
  private ctx: GanttKeyContext | null = null;
  private edit: KeyboardEdit | null = null;
  /** `data-focus-key` of the control to focus after the next render (a keyboard move to an unmounted control) */
  private focusRequest: string | null = null;

  private readonly services = {
    layout: inject(GanttLayoutService),
    selection: inject(GanttSelectionService),
    scroll: inject(GanttScrollService),
    drag: inject(GanttDragService),
    i18n: inject(GanttI18nService),
    announcer: inject(GanttAnnouncer),
  };

  constructor() {
    // Move mode ends with the chart, quietly
    this.destroyRef.onDestroy(() => this.edit?.cancel(true));
  }

  /** What the keys do to the chart (GantryComponent, once, in its constructor). */
  bind(chart: GanttKeyboardHost): void {
    const ctx: GanttKeyContext = {
      ...this.services,
      chart,
      requestFocus: key => {
        this.focusRequest = key;
        // The render that mounts it (a pinned row usually schedules one already)
        this.cdr.markForCheck();
      },
    };
    this.ctx = ctx;
    this.edit = createKeyboardEdit(ctx);
  }

  /**
   * After the first render, in the browser (released with the chart): a pointer press anywhere in
   * the chart cancels move mode, before the press can start a drag (capture phase).
   */
  connect(): void {
    const host = this.ctx?.chart.element;
    if (!host) return;
    const onPress = (): void => this.edit?.cancel();
    host.addEventListener('pointerdown', onPress, { capture: true });
    this.destroyRef.onDestroy(() => host.removeEventListener('pointerdown', onPress, { capture: true }));
  }

  /** The control a key asked to focus once it is mounted (`data-focus-key`), cleared; `null`: none. */
  takeFocusRequest(): string | null {
    const key = this.focusRequest;
    this.focusRequest = null;
    return key;
  }

  onKeyDown(event: KeyboardEvent): void {
    const ctx = this.ctx;
    const edit = this.edit;
    if (!ctx || !edit || event.defaultPrevented) return;
    const origin = event.composedPath()[0];
    const el = origin instanceof Element ? origin : null;
    if (el && isOwnKeys(el)) return;

    // Move mode is modal: its keys, Esc and Tab end it
    if (edit.active()) {
      edit.key(event);
      return;
    }

    const host = ctx.chart.element;
    const bar = barHostOf(el, host);
    const area: KeyArea = bar ? 'timeline' : el?.closest('gantt-tasklist') ? 'grid' : 'any';
    const cmd = resolveKey(event, area, { ...ctx.layout.cfg().keyboard, active: ctx.drag.isActive() });
    if (cmd === null) return;
    if (bar && handleTimelineKey(ctx, event, bar, cmd, edit)) {
      event.preventDefault();
      return;
    }
    if (area === 'grid' && el && handleGridKey(ctx, event, el, cmd)) {
      event.preventDefault();
      return;
    }

    // Global shortcuts; anything else keeps its default action
    switch (cmd) {
      case 'cancel':
        ctx.drag.cancel();
        break;
      case 'clearSelection':
        ctx.selection.clear();
        break;
      case 'selectAll':
        ctx.chart.selectAll();
        break;
      case 'zoomIn':
        ctx.chart.zoomIn();
        break;
      case 'zoomOut':
        ctx.chart.zoomOut();
        break;
      case 'today':
        ctx.chart.scrollToToday();
        break;
      case 'fit':
        ctx.chart.fitToScreen();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** Leaving the bar in move mode (blur) cancels it. */
  protected onFocusOut(event: FocusEvent): void {
    const edit = this.edit;
    if (edit?.active() && barHostOf(event.target)?.getAttribute('data-task-id') === edit.taskId()) edit.cancel();
  }
}
