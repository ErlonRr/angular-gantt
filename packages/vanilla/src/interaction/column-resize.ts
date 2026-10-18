/**
 * @file column-resize.ts
 * Resizing a task-list column by dragging its edge (`.gantt-col-resize`).
 *
 * The handle captures the pointer (`setPointerCapture`), so every move and the release reach the
 * handle itself: the listeners live on the handle for the length of one gesture, never on
 * `window`. The handle is keyed with its column and survives the re-renders that the live width
 * changes cause. `abort()` ends a gesture in progress (the element left the document): its
 * listeners go, the width reached so far is kept and the end is reported like a release.
 */

import { clampColumnWidth } from '@gantryjs/core';
import type { VanillaColumnDef } from '../types';

/** What a resize reports. */
export interface ColumnResizeHooks {
  /** Live width while dragging (clamped to the column's min / max, rounded); only actual changes */
  readonly onWidth: (key: string, width: number) => void;
  /** The gesture ended: released, cancelled, capture lost or aborted */
  readonly onEnd: () => void;
}

export interface ColumnResize {
  /** Starts resizing `col` from a primary-button `pointerdown` on its `handle`. */
  start(handle: HTMLElement, event: PointerEvent, col: VanillaColumnDef): void;
  /**
   * A resize is running, or has just ended and the click that follows its release is not
   * dispatched yet (that click must not sort the column).
   */
  active(): boolean;
  /** Ends the gesture in progress, if any, and forgets the pending click guard. */
  abort(): void;
}

export function createColumnResize(hooks: ColumnResizeHooks): ColumnResize {
  /** The gesture in progress: its handle and how to end it */
  let gesture: { readonly handle: HTMLElement; readonly end: () => void } | null = null;
  /** Set from a release until the next task: the trailing click is the drag's, not a sort */
  let settling = false;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const stopSettling = (): void => {
    clearTimeout(settle);
    settle = undefined;
    settling = false;
  };

  return {
    start(handle, event, col) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      gesture?.end();
      stopSettling();

      const { pointerId } = event;
      const startX = event.clientX;
      const startWidth = col.width;
      let last = startWidth;

      const move = (e: PointerEvent): void => {
        if (e.pointerId !== pointerId) return;
        const width = clampColumnWidth(startWidth + e.clientX - startX, col);
        if (width === last) return;
        last = width;
        hooks.onWidth(col.key, width);
      };
      const release = (e: PointerEvent): void => {
        if (e.pointerId === pointerId) end(true);
      };
      const end = (settleClick: boolean): void => {
        if (gesture?.handle !== handle) return;
        gesture = null;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', release);
        handle.removeEventListener('pointercancel', release);
        handle.removeEventListener('lostpointercapture', release);
        try {
          if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        } catch {
          // the pointer is already gone
        }
        if (settleClick) {
          settling = true;
          settle = setTimeout(stopSettling);
        }
        hooks.onEnd();
      };

      gesture = { handle, end: () => end(false) };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', release);
      handle.addEventListener('pointercancel', release);
      handle.addEventListener('lostpointercapture', release);
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // no active pointer with this id (synthetic events): the handle still gets what it is sent
      }
    },
    active() {
      // A handle taken out of the document mid-drag never hears its release: not active any more
      return (gesture !== null && gesture.handle.isConnected) || settling;
    },
    abort() {
      gesture?.end();
      stopSettling();
    },
  };
}
