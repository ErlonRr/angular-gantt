/**
 * @file keyboard.ts
 * Keyboard shortcuts on the element (zoom, today, select all, clear, cancel a drag) through the
 * core keymap, and focus tracking: the task-list row that holds focus is recorded in the
 * `focusedRowId` input, so the virtual window keeps it mounted (pinned) while it scrolls away.
 */

import { resolveKey } from '@gantry/core';
import type { LayerContext } from '../layers/context';

/** Binds the shortcuts until `signal` aborts (the element disconnects). */
export function bindKeyboard(ctx: LayerContext, signal: AbortSignal): void {
  const { host, dom, drag, selection } = ctx;
  host.addEventListener(
    'keydown',
    event => {
      // Don't hijack typing inside slotted/custom cell inputs, editable cells or the splitter's separator
      if (event.defaultPrevented) return;
      const origin = event.composedPath()[0] as HTMLElement | undefined;
      if (origin && (/^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName) || origin.isContentEditable)) return;
      if (origin === dom.splitterHandle) return;

      // Only the commands the Web Component handles take the key; anything else keeps its default action
      switch (resolveKey(event, 'any', { active: drag.state.peek().kind !== 'idle' })) {
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
        default:
          return;
      }
      event.preventDefault();
    },
    { signal },
  );
}

/** Records the task-list row that holds focus (`focusedRowId`); `null` when focus moves elsewhere in the chart. */
export function bindFocusTracking(ctx: LayerContext, signal: AbortSignal): void {
  const { shadow, host, inputs: I } = ctx;
  const rowOf = (target: EventTarget | null): string | null =>
    (target as Element | null)?.closest?.<HTMLElement>('.gantt-tl-row')?.dataset['taskId'] ?? null;
  shadow.addEventListener('focusin', e => I.focusedRowId.set(rowOf(e.target)), { signal });
  // Focus left the chart for another control (a rebuilt row losing focus has no related target)
  shadow.addEventListener(
    'focusout',
    e => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (next && next !== host && !shadow.contains(next)) I.focusedRowId.set(null);
    },
    { signal },
  );
}
