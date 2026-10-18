/**
 * @file focus-restore.ts
 * Keyboard focus across rebuilds. A layer that replaces nodes which may hold focus (toolbar,
 * task list) calls `focus.capture()` first: the focused control's `data-focus-key` is remembered
 * and the focus-restore region (after every painting region in the flush) focuses the rebuilt
 * control with the same key. When it is gone (e.g. its row was removed), focus stays in the chart
 * instead of dropping to `<body>`, so the keyboard shortcuts keep working: it goes to the timeline
 * viewport, or in the table view (where the timeline is inert) to the task list's tab-stop row.
 */

import { signal } from '../reactive';
import type { Layer, LayerContext } from './context';

export interface FocusTracker {
  /** Remember the focused control's key before replacing nodes (the first capture of a flush wins). */
  capture(): void;
  /** The remembered key, cleared (tracked: a capture re-runs the focus-restore region). */
  take(): string | null;
}

export function createFocusTracker(shadow: ShadowRoot): FocusTracker {
  const captured = signal(0);
  let pending: string | null = null;
  return {
    capture() {
      if (pending !== null) return;
      const key = (shadow.activeElement as HTMLElement | null)?.dataset?.['focusKey'];
      if (!key) return;
      pending = key;
      captured.set(captured.peek() + 1);
    },
    take() {
      captured();
      const key = pending;
      pending = null;
      return key;
    },
  };
}

/**
 * Focus for a chart whose focused control is gone: the timeline viewport, else (table view) the
 * task list's tab-stop row, else the first tab stop (the host delegates focus).
 */
export function focusFallback(ctx: Pick<LayerContext, 'dom' | 'host'>): void {
  const { dom, host } = ctx;
  const target = dom.viewport.inert
    ? dom.tasklistContainer.querySelector<HTMLElement>('.gantt-tl-row[tabindex="0"]')
    : dom.viewport;
  (target ?? host).focus({ preventScroll: true });
}

export function createFocusRestoreLayer(ctx: LayerContext): Layer {
  const { shadow } = ctx;
  return {
    paint() {
      const key = ctx.focus.take();
      if (!key) return;
      const active = shadow.activeElement as HTMLElement | null;
      if (active?.dataset['focusKey'] === key) return;
      for (const el of shadow.querySelectorAll<HTMLElement>('[data-focus-key]')) {
        if (el.dataset['focusKey'] === key) {
          el.focus({ preventScroll: true });
          return;
        }
      }
      focusFallback(ctx);
    },
  };
}
