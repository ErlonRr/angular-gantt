// ─────────────────────────────────────────────────────────────
//  gantry · virtual-scroll/virtual-window.ts
//
//  Pure virtual-scroll window math — no Angular, no DOM.
//  Shared by GanttVirtualScrollDirective (standalone reuse) and
//  GantryComponent's internal row slicing, so both compute the
//  exact same visible window and spacer heights.
// ─────────────────────────────────────────────────────────────

export interface VirtualWindow {
  /** First rendered item index (inclusive), overscan already applied */
  first: number;
  /** Last rendered item index (inclusive), overscan already applied */
  last: number;
  /** Spacer height (px) above the first rendered item */
  paddingTop: number;
  /** Spacer height (px) below the last rendered item */
  paddingBottom: number;
}

/**
 * Compute the visible window for a fixed-height virtual list.
 *
 * @param scrollTop       Vertical scroll offset within the list (px, ≥ 0)
 * @param itemHeight      Fixed height of every item (px)
 * @param viewportHeight  Height of the visible viewport (px)
 * @param itemCount       Total number of items
 * @param overscan        Extra items rendered above & below the window
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
  const last = Math.min(itemCount - 1, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);

  return {
    first,
    last,
    paddingTop: first * itemHeight,
    paddingBottom: Math.max(0, (itemCount - last - 1) * itemHeight),
  };
}
