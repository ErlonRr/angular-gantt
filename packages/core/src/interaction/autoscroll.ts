// ─────────────────────────────────────────────────────────────
//  gantry · interaction/autoscroll.ts
//  Auto-scroll speed while dragging near the viewport edges (step 2.2).
// ─────────────────────────────────────────────────────────────

/** Depth (px) of the zone along each viewport edge where a drag scrolls the viewport. */
export const AUTO_SCROLL_EDGE = 32;
/** Fastest auto-scroll (px per animation frame), reached at the edge and beyond it. */
export const AUTO_SCROLL_MAX_STEP = 18;

/**
 * Auto-scroll step (px for this frame) along one axis, for a pointer at `pos` in a viewport
 * spanning `start`…`end` (the same coordinates, e.g. client px of the viewport's box).
 *
 * Negative near `start` (scroll back), positive near `end`, `0` in between. The speed grows
 * linearly from 1 px at the inner border of the `edge` zone to `max` at the viewport's edge, and
 * stays at `max` past it (the pointer left the viewport while dragging). A viewport narrower than
 * two zones splits itself between them. Whole pixels, so scroll offsets stay integral.
 */
export function autoScrollDelta(
  pos: number,
  start: number,
  end: number,
  edge: number = AUTO_SCROLL_EDGE,
  max: number = AUTO_SCROLL_MAX_STEP,
): number {
  const zone = Math.min(edge, (end - start) / 2);
  if (!(zone > 0) || !(max > 0)) return 0;
  const step = (depth: number) => Math.max(1, Math.round(max * Math.min(1, depth / zone)));
  const back = start + zone - pos;
  if (back > 0) return -step(back);
  const ahead = pos - (end - zone);
  if (ahead > 0) return step(ahead);
  return 0;
}
