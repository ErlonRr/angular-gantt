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
//     whose arrow keys scroll natively) → `'any'`. The toolbar's listener
//     (on `<gantt-toolbar>`, inside this host) runs first: the keys of its
//     More menu (core `toolbarMenuKey`) and its roving keys are prevented
//     there, so they never reach this one (an Esc that closes the menu does
//     not clear the selection); Tab out of the menu is not prevented.
//
//  What the area leaves goes to the global shortcuts: Esc (D24: cancels
//  move mode, a pointer drag or a link session, else deselects the
//  selected link, else clears the selection — an open tooltip closes
//  first, in the capture phase), Ctrl/⌘+A, and + − T F
//  (`keyboard.characterShortcuts`).
//
//  Editing (Phase 11, plan §3e):
//   - Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo (the chart's
//     editor), only while the chart keeps a history (`editing.history`;
//     not in controlled mode); otherwise, in move mode (modal: its own
//     keys) and in text entry, the browser's own undo keeps the keys.
//   - With a link selected (`layout.selectedLinkKey`), Delete / Backspace
//     removes it wherever focus is in the chart (outside text entry), and
//     Esc deselects it only (`resolveKey`'s `active`).
//   - L on a bar starts link mode (`a11y/timeline-keys.ts`); the keyboard
//     session's target follows focus (`focusin` on a bar), and Tab out of
//     the bars or a pointer press cancels it (announced). A pointer press
//     in the chart outside the timeline canvas deselects the selected
//     link; on the canvas, the canvas does (but not for a press on that
//     link, which its click selects again: no flicker).
//
//  Keys nothing uses (and Alt combinations) keep their default action; so
//  does text entry — an input, a select or a text area (a custom cell's
//  control, a cell editor), editable content, and anything inside an open
//  cell editor (`.gantt-tl-cell--editing`, whose own keys
//  `editing/cell-edit.ts` handles: a custom editor made of buttons keeps
//  its keys) — and the splitter handle.
//
//  Move mode also ends when focus leaves its bar (blur), on a pointer
//  press anywhere in the chart (capture phase, before a drag can start)
//  and when the chart is destroyed (quietly); so does a link session.
//
//  GantryComponent binds what the keys do to the chart (`bind`: outputs,
//  public actions, columns, visuals; the link interactions get the bar
//  visuals from there too), starts the pointer listener after the first
//  render (`connect`) and, after every render, focuses the control a key
//  asked for when it was not mounted yet (`takeFocusRequest`).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectorRef, DestroyRef, Directive, inject, untracked } from '@angular/core';
import { resolveKey, type KeyArea } from '@gantryjs/core';

import { GanttSelectionService } from './gantt-selection.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttAnnouncer } from '../a11y/announcer';
import { GanttEditorService } from '../editing/gantt-editor.service';
import { GanttLinkService } from '../editing/link';
import { GanttCellEditService } from '../editing/cell-edit';
import { barHostOf } from '../bars/bar-focus.service';
import { handleGridKey, type GanttKeyboardHost } from '../a11y/grid-keys';
import { handleTimelineKey, type GanttTimelineKeyContext } from '../a11y/timeline-keys';
import { createKeyboardEdit, type KeyboardEdit } from '../drag/keyboard-edit';

/** Typing in a consumer's cell control or a cell editor: the chart leaves its keys alone. */
const isTextEntry = (el: Element): boolean =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
  (el as HTMLElement).isContentEditable === true ||
  el.closest('.gantt-tl-editor') !== null;

/**
 * Keys the chart leaves alone: text entry, anything inside an open cell editor (a custom editor made
 * of buttons keeps its keys: no + − T F, Ctrl+A or Ctrl+Z from the chart), and the splitter handle's
 * (the separator resizes with the arrows). The collapse toggle beside it is a plain button, as in
 * the Web Component (`interaction/keyboard.ts`).
 */
const isOwnKeys = (el: Element): boolean =>
  isTextEntry(el) || el.classList.contains('gantry-splitter-handle') || el.closest('.gantt-tl-cell--editing') !== null;

@Directive({
  selector: '[ganttKeyboard]',
  host: {
    '(keydown)': 'onKeyDown($event)',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class GanttKeyboardDirective {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** What the keys read and write; set by `bind` */
  private ctx: GanttTimelineKeyContext | null = null;
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
    editor: inject(GanttEditorService),
    link: inject(GanttLinkService),
  };
  /** The open cell editor (`active()`: Esc cancels it, not the selection) */
  private readonly cells = inject(GanttCellEditService);

  constructor() {
    // Move mode and a link session end with the chart, quietly
    this.destroyRef.onDestroy(() => {
      this.edit?.cancel(true);
      this.services.link.cancel(true);
    });
  }

  /** What the keys do to the chart (GantryComponent, once, in its constructor). */
  bind(chart: GanttKeyboardHost): void {
    // The link interactions read the chart's bar visuals (connectors, targets, hit tests)
    this.services.link.bind({ barVisual: geo => chart.barVisual(geo) });
    const ctx: GanttTimelineKeyContext = {
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
   * the chart cancels move mode and a keyboard link session (announced), before the press can start
   * a drag (capture phase); a press outside the timeline canvas deselects the selected link (the
   * canvas decides for its own presses).
   */
  connect(): void {
    const host = this.ctx?.chart.element;
    const link = this.services.link;
    if (!host) return;
    const onPress = (e: PointerEvent): void => {
      this.edit?.cancel();
      if (untracked(this.services.layout.link)?.mode === 'keyboard') link.cancel();
      const target = e.target as Partial<Element> | null;
      if (!target?.closest?.('gantt-canvas svg[role="listbox"]')) link.deselect();
    };
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
    // Text entry, the splitter, and anything inside an open cell editor
    if (el && isOwnKeys(el)) return;

    // Move mode is modal: its keys, Esc and Tab end it
    if (edit.active()) {
      edit.key(event);
      return;
    }

    const { layout, link } = ctx;
    const host = ctx.chart.element;
    const bar = barHostOf(el, host);
    const area: KeyArea = bar ? 'timeline' : el?.closest('gantt-tasklist') ? 'grid' : 'any';
    const selectedLink = untracked(layout.selectedLinkKey) !== null;
    // Escape cancels something instead of clearing the selection (core `resolveKey`'s `active`)
    const busy = ctx.drag.isActive() || link.active() || selectedLink || this.cells.active() !== null;
    const options = { ...untracked(layout.cfg).keyboard, active: busy };

    // A selected link: Delete / Backspace removes it, whichever area holds focus
    if (selectedLink && resolveKey(event, 'timeline', options) === 'delete') {
      link.deleteSelected();
      event.preventDefault();
      return;
    }

    const cmd = resolveKey(event, area, options);
    if (cmd === null) return;
    // Undo / redo while the chart keeps a history; otherwise the browser's own keeps the keys
    if (cmd === 'undo' || cmd === 'redo') {
      const editor = ctx.editor;
      if (!editor || untracked(layout.cfg).editing.history === false) return;
      if (cmd === 'undo') editor.undo();
      else editor.redo();
      event.preventDefault();
      return;
    }
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
        if (link.active()) link.cancel();
        else if (untracked(layout.selectedLinkKey) !== null) link.deselect();
        else ctx.drag.cancel();
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

  /** Keyboard link mode: the bar that takes focus is the target. */
  protected onFocusIn(event: FocusEvent): void {
    const link = this.services.link;
    if (untracked(this.services.layout.link)?.mode !== 'keyboard') return;
    const bar = barHostOf(event.target, this.ctx?.chart.element);
    if (bar) link.over(bar.getAttribute('data-task-id'));
  }

  /**
   * Leaving the bar in move mode (blur) cancels it. Keyboard link mode ends when focus leaves the bars
   * for another control (not when it is lost: another window).
   */
  protected onFocusOut(event: FocusEvent): void {
    const edit = this.edit;
    if (edit?.active() && barHostOf(event.target)?.getAttribute('data-task-id') === edit.taskId()) edit.cancel();
    const next = event.relatedTarget;
    if (
      untracked(this.services.layout.link)?.mode === 'keyboard' &&
      next &&
      !barHostOf(next, this.ctx?.chart.element)
    ) {
      this.services.link.cancel();
    }
  }
}
