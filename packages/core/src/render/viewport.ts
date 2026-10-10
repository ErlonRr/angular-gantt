// ─────────────────────────────────────────────────────────────
//  gantry · render/viewport.ts
//  Horizontal viewport decisions shared by every painter: where the
//  first render scrolls to, and how a zoom keeps its anchor date.
// ─────────────────────────────────────────────────────────────

import type { TimelineModel } from './timeline';

/** Where the timeline scrolls on the first render with data. */
export type InitialScroll = 'auto' | 'today' | 'start' | Date | false;

/** Gap (px) left before the first task when scrolling to it. */
export const START_SCROLL_MARGIN = 32;

export interface InitialScrollInput {
  timeline: TimelineModel;
  initialScroll: InitialScroll;
  /** Visible width of the timeline viewport */
  viewportWidth: number;
  now: Date;
}

/**
 * `scrollLeft` for the first render with data, or `null` to leave the scroll alone.
 *
 * - `'today'` / a `Date`: centre that date.
 * - `'start'`: the earliest task near the left edge.
 * - `'auto'`: today when it is near the tasks (within a quarter of the viewport of
 *   their span), otherwise the earliest task — so the first view shows bars.
 */
export function initialScrollLeft(input: InitialScrollInput): number | null {
  const { timeline: tl, initialScroll, viewportWidth: vw, now } = input;
  if (initialScroll === false) return null;

  const centre = (d: Date) => clampScroll(tl.toX(d) - vw / 2, tl, vw);
  const atStart = (d: Date) => clampScroll(tl.toX(d) - Math.min(START_SCROLL_MARGIN, vw / 4), tl, vw);

  if (initialScroll instanceof Date) return centre(initialScroll);
  if (initialScroll === 'today') return centre(now);

  const extent = tl.extent;
  if (!extent) return initialScroll === 'auto' ? centre(now) : null;
  if (initialScroll === 'start') return atStart(extent.start);

  const todayX = tl.toX(now);
  const near = vw / 4;
  return todayX >= tl.toX(extent.start) - near && todayX <= tl.toX(extent.end) + near
    ? centre(now)
    : atStart(extent.start);
}

/**
 * Whether a consumer changed `initialScroll` (dates compare by value) — painters
 * re-apply it on the next render with data when it did.
 */
export function initialScrollChanged(a: InitialScroll | undefined, b: InitialScroll | undefined): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b;
}

/**
 * `scrollLeft` that keeps the date under `anchorX` (px from the viewport's left edge)
 * in place when the timeline changes — zoom, a new range start, a new `pxPerDay`.
 */
export function zoomAnchorScroll(
  prev: TimelineModel,
  next: TimelineModel,
  scrollLeft: number,
  anchorX: number,
): number {
  return next.toX(prev.toDate(scrollLeft + anchorX)) - anchorX;
}

/** Clamp a scroll offset to the timeline's scrollable range. */
export function clampScroll(x: number, timeline: TimelineModel, viewportWidth: number): number {
  return Math.round(Math.max(0, Math.min(x, timeline.totalWidth - viewportWidth)));
}
