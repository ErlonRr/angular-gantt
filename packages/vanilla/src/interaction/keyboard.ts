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
 *   timeline viewport while no bar is mounted, whose arrow keys scroll natively) → `'any'`.
 * What the area leaves goes to the global shortcuts: Esc (D24: cancels move mode or a pointer
 * drag, else clears the selection — the open tooltip closes first, in the capture phase,
 * `tooltip-triggers.ts`), Ctrl/⌘+A, and + − T F (`characterShortcuts` from the resolved
 * `keyboard` option). Keys nothing uses (and Alt combinations, L, Delete, Ctrl+Z/Y until Phase
 * 11) keep their default action; so do text inputs in custom cells and the splitter's separator.
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

/** Typing in a consumer's cell control: the chart leaves its keys alone. */
const isTextEntry = (el: Element): boolean =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable;

/** Binds the keys until `signal` aborts (the element disconnects; move mode is cancelled then). */
export function bindKeyboard(ctx: LayerContext, signal: AbortSignal): void {
  const { host, shadow, dom, drag, selection, graph: G } = ctx;
  const edit = createKeyboardEdit(ctx);
  signal.addEventListener('abort', () => edit.cancel(true), { once: true });

  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const origin = event.composedPath()[0];
    const el = origin instanceof Element ? origin : null;
    if (el && (isTextEntry(el) || el === dom.splitterHandle)) return;

    // Move mode is modal: its keys, Esc and Tab end it
    if (edit.active()) {
      edit.key(event);
      return;
    }

    const bar = barOf(dom, el);
    const area: KeyArea = bar ? 'timeline' : el && dom.tasklistContainer.contains(el) ? 'grid' : 'any';
    const cmd = resolveKey(event, area, { ...G.config.peek().keyboard, active: drag.state.peek().kind !== 'idle' });
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
        drag.cancel();
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

  // Leaving the bar in move mode (blur) cancels it; a pointer press too, before any drag starts
  shadow.addEventListener(
    'focusout',
    e => {
      if (edit.active() && barOf(dom, e.target)?.getAttribute('data-task-id') === edit.taskId()) edit.cancel();
    },
    { signal },
  );
  shadow.addEventListener('pointerdown', () => edit.cancel(), { capture: true, signal });
}

/** Keys that alone don't make focus "visible" (pressing them with a pointer is common). */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']);

/**
 * Records the row that holds focus (`focusedRowId`: a task-list row or cell, or a bar; `null`
 * when focus moves elsewhere in the chart or leaves it) and the bar focused from the keyboard
 * (`focusVisibleBarId`).
 */
export function bindFocusTracking(ctx: LayerContext, signal: AbortSignal): void {
  const { shadow, host, dom, inputs: I } = ctx;
  /** The last input was a key (initially: focus moved by a script shows its ring, like `:focus-visible`) */
  let keyboard = true;
  const doc = shadow.ownerDocument;
  const idOf = (bar: Element | null) => bar?.getAttribute('data-task-id') ?? null;

  doc.addEventListener(
    'keydown',
    e => {
      if (MODIFIER_KEYS.has(e.key)) return;
      keyboard = true;
      // A key pressed on a bar focused by the pointer shows its ring from now on
      const id = idOf(barOf(dom, shadow.activeElement));
      if (id !== null) I.focusVisibleBarId.set(id);
    },
    { capture: true, signal },
  );
  doc.addEventListener(
    'pointerdown',
    () => {
      keyboard = false;
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
      I.focusVisibleBarId.set(bar && keyboard ? id : null);
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
