// ─────────────────────────────────────────────────────────────
//  gantry · render/virtual.ts
//  Vertical virtual-scroll window for fixed-height rows — shared by
//  the Angular component, its standalone directive and the Web
//  Component so every painter mounts exactly the same rows.
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
  /**
   * Pinned indexes before `first` that must stay mounted (active, editing or
   * dragged rows), ascending and unique. They are not part of the spacers:
   * `paddingTop` still covers them, so painters position them absolutely
   * (`index × itemHeight`) instead of in the flow.
   */
  pinnedBefore: number[];
  /** Pinned indexes after `last` that must stay mounted, ascending and unique (see `pinnedBefore`). */
  pinnedAfter: number[];
}

/**
 * Compute the visible window for a fixed-height virtual list.
 *
 * @param scrollTop       Vertical scroll offset within the list (px, ≥ 0)
 * @param itemHeight      Fixed height of every item (px)
 * @param viewportHeight  Height of the visible viewport (px)
 * @param itemCount       Total number of items
 * @param overscan        Extra items rendered above & below the window
 * @param pinned          Item indexes that must stay mounted even when scrolled out of
 *                        the window (focused / edited / dragged rows). Out-of-range,
 *                        non-integer and duplicate indexes are ignored.
 */
export function computeVirtualWindow(
  scrollTop: number,
  itemHeight: number,
  viewportHeight: number,
  itemCount: number,
  overscan = 4,
  pinned?: Iterable<number>,
): VirtualWindow {
  if (itemHeight <= 0 || itemCount <= 0) {
    // Everything is mounted: nothing can be pinned outside the window
    return {
      first: 0,
      last: Math.max(0, itemCount - 1),
      paddingTop: 0,
      paddingBottom: 0,
      pinnedBefore: [],
      pinnedAfter: [],
    };
  }

  const first = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const last = Math.min(itemCount - 1, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);

  const pinnedBefore: number[] = [];
  const pinnedAfter: number[] = [];
  if (pinned) {
    const seen = new Set<number>();
    for (const i of pinned) {
      if (!Number.isInteger(i) || i < 0 || i >= itemCount || seen.has(i)) continue;
      seen.add(i);
      if (i < first) pinnedBefore.push(i);
      else if (i > last) pinnedAfter.push(i);
    }
    pinnedBefore.sort((a, b) => a - b);
    pinnedAfter.sort((a, b) => a - b);
  }

  return {
    first,
    last,
    paddingTop: first * itemHeight,
    paddingBottom: Math.max(0, (itemCount - last - 1) * itemHeight),
    pinnedBefore,
    pinnedAfter,
  };
}

/**
 * Every index a painter mounts for `vw`, ascending: pinned rows before the window,
 * `first..last`, then pinned rows after it — clamped to `[0, itemCount)` (an empty
 * list reports `first = last = 0` but mounts nothing).
 */
export function virtualIndexes(
  vw: Pick<VirtualWindow, 'first' | 'last' | 'pinnedBefore' | 'pinnedAfter'>,
  itemCount: number,
): number[] {
  const out = vw.pinnedBefore.filter(i => i < itemCount);
  const last = Math.min(vw.last, itemCount - 1);
  for (let i = Math.max(0, vw.first); i <= last; i++) out.push(i);
  for (const i of vw.pinnedAfter) if (i < itemCount) out.push(i);
  return out;
}

/**
 * Whether item `index` is mounted for `vw` (in `first..last` or pinned) — `false`
 * outside `[0, itemCount)`, matching {@link virtualIndexes} (an empty list reports
 * `first = last = 0` but mounts nothing).
 */
export function isIndexMounted(
  vw: Pick<VirtualWindow, 'first' | 'last' | 'pinnedBefore' | 'pinnedAfter'>,
  index: number,
  itemCount: number,
): boolean {
  if (!(index >= 0 && index < itemCount)) return false;
  if (index >= vw.first && index <= vw.last) return true;
  return index < vw.first ? vw.pinnedBefore.includes(index) : vw.pinnedAfter.includes(index);
}
