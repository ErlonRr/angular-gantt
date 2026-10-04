/**
 * @file virtual-window.ts
 * Virtual scrolling window calculation math and engine for Vanilla JS.
 */

export interface VirtualWindow {
  /** First rendered item index (inclusive) */
  first: number;
  /** Last rendered item index (inclusive) */
  last: number;
  /** Top spacer height in pixels */
  paddingTop: number;
  /** Bottom spacer height in pixels */
  paddingBottom: number;
}

/**
 * Computes visible item range and padding for virtual scroll list.
 */
export function computeVirtualWindow(
  scrollTop: number,
  itemHeight: number,
  viewportHeight: number,
  itemCount: number,
  overscan = 4,
): VirtualWindow {
  if (itemHeight <= 0 || itemCount <= 0) {
    return { first: 0, last: Math.max(0, itemCount - 1), paddingTop: 0, paddingBottom: 0 };
  }

  const first = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const last = Math.min(
    itemCount - 1,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
  );

  return {
    first,
    last,
    paddingTop: first * itemHeight,
    paddingBottom: Math.max(0, (itemCount - last - 1) * itemHeight),
  };
}

export class GanttVirtualScrollEngine {
  private viewportEl: HTMLElement;
  private itemHeight: number;
  private overscan: number;
  private onWindowChange: (vw: VirtualWindow) => void;
  private rafId?: number;

  constructor(
    viewportEl: HTMLElement,
    itemHeight: number,
    onWindowChange: (vw: VirtualWindow) => void,
    overscan = 4
  ) {
    this.viewportEl = viewportEl;
    this.itemHeight = itemHeight;
    this.onWindowChange = onWindowChange;
    this.overscan = overscan;

    this.onScroll = this.onScroll.bind(this);
    this.viewportEl.addEventListener('scroll', this.onScroll, { passive: true });
  }

  private onScroll(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.recompute(this.itemCount);
    });
  }

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
