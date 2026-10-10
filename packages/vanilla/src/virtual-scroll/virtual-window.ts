/**
 * @file virtual-window.ts
 * DOM engine for a virtual-scroll list; the window math is `computeVirtualWindow` from @gantry/core.
 */

import { computeVirtualWindow, type VirtualWindow } from '@gantry/core';

// The window math lives in @gantry/core (shared with Angular); the type stays importable from here
export type { VirtualWindow };

export class GanttVirtualScrollEngine {
  private viewportEl: HTMLElement;
  private itemHeight: number;
  private overscan: number;
  private onWindowChange: (vw: VirtualWindow) => void;
  private rafId?: number | undefined;

  constructor(viewportEl: HTMLElement, itemHeight: number, onWindowChange: (vw: VirtualWindow) => void, overscan = 4) {
    this.viewportEl = viewportEl;
    this.itemHeight = itemHeight;
    this.onWindowChange = onWindowChange;
    this.overscan = overscan;

    this.viewportEl.addEventListener('scroll', this.onScroll, { passive: true });
  }

  private readonly onScroll = (): void => {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.recompute(this.itemCount);
    });
  };

  private itemCount = 0;

  recompute(totalItems: number): VirtualWindow {
    this.itemCount = totalItems;
    const scrollTop = this.viewportEl.scrollTop;
    const viewportHeight = this.viewportEl.clientHeight || 500;
    const vw = computeVirtualWindow(scrollTop, this.itemHeight, viewportHeight, totalItems, this.overscan);
    this.onWindowChange(vw);
    return vw;
  }

  destroy(): void {
    this.viewportEl.removeEventListener('scroll', this.onScroll);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
