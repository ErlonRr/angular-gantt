/**
 * @file keyboard.ts
 * The element's keyboard (contract §3d of Gantry 2 phase 9) and its focus tracking.
 *
 * `bindKeyboard`: one `keydown` listener on the shadow root (and one on the host for events sent
 * to the host itself) resolves every key through the core keymap, in the area that holds focus:
 * - a bar (`g.gantt-bars-layer > [data-task-id]`) → `'timeline'` (`timeline-keys.ts`), and move
 *   mode while it is on (`keyboard-edit.ts`: modal, it takes every key first);
 * - the task list → `'grid'` (`grid-keys.ts`);
 * - anywhere else (the toolbar, which roves with its own listener; the splitter's toggle; the
 *   timeline viewport while no bar is mounted, whose arrow keys scroll natively) → `'any'`. The
 *   toolbar's listener sits below the shadow root and runs first: the keys of its More menu (core
 *   `toolbarMenuKey`) and its roving keys are prevented there, so they never reach this one (an
 *   Esc that closes the menu does not clear the selection); Tab out of the menu is not prevented.
 * What the area leaves goes to the global shortcuts: Esc (D24: cancels move mode, a pointer drag
 * or a link session, else deselects the selected link, else clears the selection — the open
 * tooltip closes first, in the capture phase, `tooltip-triggers.ts`), Ctrl/⌘+A, and + − T F
 * (`characterShortcuts` from the resolved `keyboard` option).
 *
 * Editing (Phase 11, plan §3e):
 * - Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo (`ctx.edit`), only while the chart keeps a
 *   history (`editing.history`; not in controlled mode); otherwise, in move mode (modal: its own
 *   keys) and in text entry, the browser's own undo keeps the keys.
 * - With a link selected (`inputs.selectedLinkKey`), Delete / Backspace removes it wherever focus
 *   is in the chart (outside text entry), and Esc deselects it only (`resolveKey`'s `active`).
 * - L on a bar starts link mode (`timeline-keys.ts`); the keyboard session's target follows focus
 *   (`bindFocusTracking`), and Tab out of the bars or a pointer press cancels it (announced). A
 *   pointer press in the chart outside the timeline canvas deselects the selected link; on the
 *   canvas, `canvas-pointer.ts` does (but not for a press on that link, which its click selects
 *   again: no flicker).
 *
 * Keys nothing uses (and Alt combinations) keep their default action; so does text entry — an
 * input, a select or a text area (a custom cell's control, a cell editor), editable content, and
 * anything inside a cell editor (`.gantt-tl-editor`, whose own keys `cell-edit.ts` handles) — and
 * the splitter's separator.
 *
 * `bindFocusTracking`: the row that holds focus — a task-list row (or one of its cells) or a bar —
 * is recorded in the `focusedRowId` input, so the virtual window keeps it mounted (pinned) while
 * it scrolls away and both panes' tab stops follow it. The bar focused from the keyboard (the
 * last input was a key, not a pointer: tracked on the document, like `:focus-visible`) is
 * `focusVisibleBarId`, whose focus ring and grips the bar overlay shows.
 */

import { resolveKey, type KeyArea } from '@gantryjs/core';
import type { LayerContext } from '../layers/context';
import type { Skeleton } from '../layers/skeleton';
import { handleGridKey } from './grid-keys';
import { createKeyboardEdit } from './keyboard-edit';
import { handleTimelineKey } from './timeline-keys';

/** The bar (a child of `g.gantt-bars-layer`) `el` is or is inside, `null` elsewhere. */
export function barOf(dom: Pick<Skeleton, 'bars'>, el: EventTarget | null | undefined): Element | null {
  for (let n = el instanceof Element ? el : null; n; n = n.parentElement) {
    if (n.parentNode === dom.bars) return n;
  }
  return null;
}

/** Typing in a consumer's cell control or a cell editor: the chart leaves its keys alone. */
const isTextEntry = (el: Element): boolean =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
  (el as HTMLElement).isContentEditable ||
  el.closest('.gantt-tl-editor') !== null;

/** Binds the keys until `signal` aborts (the element disconnects; move mode is cancelled then). */
export function bindKeyboard(ctx: LayerContext, signal: AbortSignal): void {
  const { host, shadow, dom, drag, selection, link, inputs: I, graph: G } = ctx;
  const edit = createKeyboardEdit(ctx);
  signal.addEventListener('abort', () => edit.cancel(true), { once: true });

  /** Escape cancels something instead of clearing the selection (core `resolveKey`'s `active`). */
  const busy = (): boolean =>
    drag.state.peek().kind !== 'idle' ||
    link.active() ||
    I.selectedLinkKey.peek() !== null ||
    ctx.cells.active() !== null;
  /** The chart keeps an undo history (`editing.history`; never in controlled mode). */
  const keepsHistory = (): boolean => {
    try {
      return G.config.peek().editing.history !== false;
    } catch {
      return false;
    }
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const origin = event.composedPath()[0];
    const el = origin instanceof Element ? origin : null;
    // Text entry, the splitter, and anything inside an open cell editor (a custom editor made of
    // buttons keeps its keys: no + − T F, Ctrl+A or Ctrl+Z from the chart)
    if (el && (isTextEntry(el) || el === dom.splitterHandle || el.closest('.gantt-tl-cell--editing'))) return;

    // Move mode is modal: its keys, Esc and Tab end it
    if (edit.active()) {
      edit.key(event);
      return;
    }

    const bar = barOf(dom, el);
    const area: KeyArea = bar ? 'timeline' : el && dom.tasklistContainer.contains(el) ? 'grid' : 'any';
    const options = { ...G.config.peek().keyboard, active: busy() };

    // A selected link: Delete / Backspace removes it, whichever area holds focus
    if (I.selectedLinkKey.peek() !== null && resolveKey(event, 'timeline', options) === 'delete') {
      link.deleteSelected();
      event.preventDefault();
      return;
    }

    const cmd = resolveKey(event, area, options);
    if (cmd === null) return;
    // Undo / redo while the chart keeps a history; otherwise the browser's own keeps the keys
    if (cmd === 'undo' || cmd === 'redo') {
      if (!keepsHistory()) return;
      if (cmd === 'undo') ctx.edit.undo();
      else ctx.edit.redo();
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
        else if (I.selectedLinkKey.peek() !== null) link.deselect();
        else drag.cancel();
        break;
      case 'clearSelection':
        selection.clear();
        break;
      case 'selectAll':
        host.selectAll();
        break;
      case 'zoomIn':
        host.zoomIn();
        break;
      case 'zoomOut':
        host.zoomOut();
        break;
      case 'today':
        host.scrollToToday();
        break;
      case 'fit':
        host.fitToScreen();
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  shadow.addEventListener('keydown', e => onKey(e as KeyboardEvent), { signal });
  // Sent to the host itself (it delegates focus, so only a script does that)
  host.addEventListener('keydown', e => e.composedPath()[0] === host && onKey(e), { signal });

  // Leaving the bar in move mode (blur) cancels it; a pointer press too, before any drag starts.
  // Keyboard link mode ends when focus leaves the bars for another control (not when it is lost:
  // another window), or on a pointer press; a press outside the canvas deselects the selected link
  // (on the canvas, `canvas-pointer.ts` keeps it for a press on that link).
  shadow.addEventListener(
    'focusout',
    e => {
      if (edit.active() && barOf(dom, e.target)?.getAttribute('data-task-id') === edit.taskId()) edit.cancel();
      const next = (e as FocusEvent).relatedTarget;
      if (I.link.peek()?.mode === 'keyboard' && next && !barOf(dom, next)) link.cancel();
    },
    { signal },
  );
  shadow.addEventListener(
    'pointerdown',
    e => {
      edit.cancel();
      if (I.link.peek()?.mode === 'keyboard') link.cancel();
      if (!dom.canvasContainer.contains(e.target as Node | null)) link.deselect();
    },
    { capture: true, signal },
  );
}

/** Keys that alone don't make focus "visible" (pressing them with a pointer is common). */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']);

/**
 * Records the row that holds focus (`focusedRowId`: a task-list row or cell, or a bar; `null`
 * when focus moves elsewhere in the chart or leaves it) and the bar focused from the keyboard
 * (`focusVisibleBarId`).
 */
export function bindFocusTracking(ctx: LayerContext, signal: AbortSignal): void {
  const { shadow, host, dom, inputs: I, focus } = ctx;
  // The last input was a key (`focus.keyboard`; initially: focus moved by a script shows its ring,
  // like `:focus-visible`; `focusTask()` sets it too)
  focus.keyboard = true;
  const doc = shadow.ownerDocument;
  const idOf = (bar: Element | null) => bar?.getAttribute('data-task-id') ?? null;

  doc.addEventListener(
    'keydown',
    e => {
      if (MODIFIER_KEYS.has(e.key)) return;
      focus.keyboard = true;
      // A key pressed on a bar focused by the pointer shows its ring from now on
      const id = idOf(barOf(dom, shadow.activeElement));
      if (id !== null) I.focusVisibleBarId.set(id);
    },
    { capture: true, signal },
  );
  doc.addEventListener(
    'pointerdown',
    () => {
      focus.keyboard = false;
      I.focusVisibleBarId.set(null);
    },
    { capture: true, signal },
  );

  shadow.addEventListener(
    'focusin',
    e => {
      const bar = barOf(dom, e.target);
      const id = bar
        ? idOf(bar)
        : ((e.target as Element | null)?.closest?.<HTMLElement>('.gantt-tl-row')?.dataset['taskId'] ?? null);
      I.focusedRowId.set(id);
      I.focusVisibleBarId.set(bar && focus.keyboard ? id : null);
      // Keyboard link mode: the focused bar is the target
      if (bar && I.link.peek()?.mode === 'keyboard') ctx.link.over(id);
    },
    { signal },
  );
  shadow.addEventListener(
    'focusout',
    e => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (!barOf(dom, next)) I.focusVisibleBarId.set(null);
      // Focus left the chart for another control (a rebuilt row losing focus has no related target)
      if (next && next !== host && !shadow.contains(next)) I.focusedRowId.set(null);
    },
    { signal },
  );
}
