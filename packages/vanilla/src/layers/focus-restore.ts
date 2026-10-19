/**
 * @file focus-restore.ts
 * Keyboard focus across rebuilds and keyboard moves.
 *
 * - A layer that replaces nodes which may hold focus (toolbar, task list, bars) calls
 *   `focus.capture()` first: the focused control's `data-focus-key` is remembered and the
 *   focus-restore region (after every painting region in the flush) focuses the rebuilt control
 *   with the same key, without scrolling.
 * - A keyboard move to a control that is not mounted yet (a task-list row or a bar beyond the
 *   virtual window: PageDown, End) pins its row (`focusedRowId`) and calls `focus.request(key)`:
 *   the region focuses it once the flush has mounted it, scrolling it into view.
 *
 * When the control is gone (e.g. its row was removed) or became inert (the table view hides the
 * timeline, the state box covers the body), focus stays in the chart instead of dropping to
 * `<body>`, so the keyboard shortcuts keep working: it goes to the timeline's tab stop (the
 * tab-stop bar, else the viewport when no bar is mounted), or in the table view (where the
 * timeline is inert) to the task list's tab stop; while the state box shows, to its Retry, else
 * the toolbar's tab stop, else the task list's (a header cell, above the box).
 */

import { signal } from '../reactive';
import type { Layer, LayerContext } from './context';

/** What the focus-restore region focuses after the flush. */
export interface FocusTarget {
  /** `data-focus-key` of the control */
  readonly key: string;
  /** Scroll it into view (a keyboard move), not just keep it focused (a rebuild) */
  readonly scroll: boolean;
  /** Show its focus ring whatever the last input was (`focus({ focusVisible: true })`: `focusTask()`) */
  readonly visible: boolean;
}

export interface FocusTracker {
  /** Remember the focused control's key before replacing nodes (the first capture of a flush wins). */
  capture(): void;
  /**
   * Focus the control with `key` after the next flush, scrolling it into view (a keyboard move to
   * a control that may not be mounted yet). Wins over the captures of that flush. `visible`: its
   * focus ring shows even when a pointer led here (`focusTask()` from a button).
   */
  request(key: string, options?: { visible?: boolean | undefined }): void;
  /** The remembered target, cleared (tracked: a capture or a request re-runs the focus-restore region). */
  take(): FocusTarget | null;
  /**
   * The input modality the bars' focus ring follows (`keyboard.ts` `bindFocusTracking`, like
   * `:focus-visible`): `true` after a key (and initially: focus moved by a script shows its ring),
   * `false` after a pointer press. `focusTask()` sets it, so the bar it focuses shows its ring.
   */
  keyboard: boolean;
}

/** `data-focus-key` of an element (HTML or SVG). */
export const focusKeyOf = (el: Element | null | undefined): string | null => el?.getAttribute('data-focus-key') ?? null;

/**
 * Focuses `el` and scrolls it into view by the least amount (a keyboard move: `focus()` alone
 * may centre it), below the sticky headers (the panes' scroll padding: in the timeline a bar
 * lands with its whole focus ring, core `timelineScrollPadding`). `visible`: the browser shows its
 * focus ring (`:focus-visible`) even after a pointer input, where `focusVisible` is supported.
 */
export function focusIntoView(el: HTMLElement | SVGElement, visible = false): void {
  const options: FocusOptions & { focusVisible?: boolean } = visible
    ? { preventScroll: true, focusVisible: true }
    : { preventScroll: true };
  el.focus(options);
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** The element of `root` with `data-focus-key` = `key` (compared as strings: keys hold task ids). */
export function findFocusKey(root: ParentNode, key: string): HTMLElement | SVGElement | null {
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-focus-key]')) {
    if (el.getAttribute('data-focus-key') === key) return el;
  }
  return null;
}

export function createFocusTracker(shadow: ShadowRoot): FocusTracker {
  const captured = signal(0);
  let pending: FocusTarget | null = null;
  const bump = () => captured.set(captured.peek() + 1);
  return {
    keyboard: true,
    capture() {
      if (pending !== null) return;
      const key = focusKeyOf(shadow.activeElement);
      if (!key) return;
      pending = { key, scroll: false, visible: false };
      bump();
    },
    request(key, options) {
      pending = { key, scroll: true, visible: options?.visible === true };
      bump();
    },
    take() {
      captured();
      const target = pending;
      pending = null;
      return target;
    },
  };
}

/** Whether `el` is inside an inert subtree (it can't take focus). */
export function isInert(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as Partial<HTMLElement>).inert === true || node.hasAttribute('inert')) return true;
  }
  return false;
}

/**
 * Focus for a chart whose focused control is gone or inert: while the state box covers the body,
 * its Retry, else the toolbar's tab stop, else the task list's (a header cell, above the box);
 * otherwise the timeline's tab stop (the bar with `tabindex=0`, else the viewport when no bar is
 * mounted), else (table view) the task list's tab stop (a row, a cell or a header cell); else the
 * first tab stop (the host delegates focus).
 */
export function focusFallback(ctx: Pick<LayerContext, 'dom' | 'host'>): void {
  const { dom, host } = ctx;
  const stop = '[tabindex="0"]';
  let target: HTMLElement | SVGElement | null;
  if (dom.stateBox.parentNode !== null) {
    target =
      dom.stateBox.querySelector<HTMLElement>('.gantt-state-retry') ??
      dom.toolbarContainer.querySelector<HTMLElement>(stop) ??
      dom.tasklistContainer.querySelector<HTMLElement>(stop);
  } else {
    target = dom.viewport.inert
      ? dom.tasklistContainer.querySelector<HTMLElement>(stop)
      : (dom.bars.querySelector<SVGElement>(stop) ?? dom.viewport);
  }
  (target && !isInert(target) ? target : host).focus({ preventScroll: true });
}

export function createFocusRestoreLayer(ctx: LayerContext): Layer {
  const { shadow, graph: G } = ctx;
  return {
    paint() {
      const target = ctx.focus.take();
      // Re-runs when the state box comes or goes: what it covers turns inert
      G.chartState();
      const active = shadow.activeElement;
      if (!target) {
        if (active && isInert(active)) focusFallback(ctx);
        return;
      }
      const el = focusKeyOf(active) === target.key ? (active as HTMLElement) : findFocusKey(shadow, target.key);
      if (!el || isInert(el)) focusFallback(ctx);
      else if (target.scroll) focusIntoView(el, target.visible);
      else if (el !== active) el.focus({ preventScroll: true });
    },
  };
}
