// ─────────────────────────────────────────────────────────────
//  gantry · render/viewport.ts
//  Viewport decisions shared by every painter: where the first
//  render scrolls to, how a zoom keeps its anchor date, where "fit to
//  screen" scrolls, the body under the header (keyboard pages, the
//  loading skeleton) and the timeline's scroll padding.
// ─────────────────────────────────────────────────────────────

import { calendarDays } from '../gantt-math';
import { FOCUS_RING_MARGIN } from './bars';
import type { TimelineModel } from './timeline';
import { FIT_MARGIN, fitMargin } from './zoom';

/** Where the timeline scrolls on the first render with data. */
export type InitialScroll = 'auto' | 'today' | 'start' | Date | false;

/** Gap (px) left before the first task when scrolling to it. */
export const START_SCROLL_MARGIN = 32;

/**
 * Viewport height (px) assumed for the vertical window before the timeline viewport has
 * been measured (first render, or a host without layout such as SSR and tests).
 */
export const VIEWPORT_FALLBACK_HEIGHT = 500;

/**
 * Height (px) of the chart body under the sticky header: the timeline viewport's height (or
 * `VIEWPORT_FALLBACK_HEIGHT` while it is not measured yet) minus the header height, never
 * negative. The loading skeleton fills it, and a keyboard page is as many rows as it shows.
 */
export function bodyHeight(viewportHeight: number, headerHeight: number): number {
  const height = viewportHeight > 0 ? viewportHeight : VIEWPORT_FALLBACK_HEIGHT;
  return Math.max(0, height - (Number.isFinite(headerHeight) ? headerHeight : 0));
}

/**
 * Rows of one keyboard page (PageUp / PageDown in the task list and on the bars): as many whole
 * rows as `bodyHeight` shows, at least one.
 */
export function pageRowCount(bodyHeight: number, rowHeight: number): number {
  if (!(rowHeight > 0) || !(bodyHeight > 0)) return 1;
  return Math.max(1, Math.floor(bodyHeight / rowHeight));
}

/** Scroll padding (px) of a scroll container, per side (`scroll-padding-top` …). */
export interface ScrollPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Scroll padding of the timeline viewport. What the browser scrolls into view there (keyboard
 * focus, `scrollIntoView({ block: 'nearest' })` on a bar) lands with the bar's whole focus ring
 * (`FOCUS_RING_MARGIN` around its box) below the sticky header (`headerHeight`: tiers and marker
 * lane) and inside the viewport's other edges (WCAG 2.4.11). The task-list panel keeps
 * `scroll-padding-top: headerHeight`: its focus outlines are drawn inside their rows and cells.
 */
export function timelineScrollPadding(headerHeight: number): ScrollPadding {
  const header = Number.isFinite(headerHeight) ? Math.max(0, headerHeight) : 0;
  return {
    top: header + FOCUS_RING_MARGIN,
    right: FOCUS_RING_MARGIN,
    bottom: FOCUS_RING_MARGIN,
    left: FOCUS_RING_MARGIN,
  };
}

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
 *
 * @deprecated Use {@link anchoredScrollLeft}: it also decides whether the scroll has to
 * move at all, picks the anchor (centre, pointer or left edge) and clamps the result.
 */
export function zoomAnchorScroll(
  prev: TimelineModel,
  next: TimelineModel,
  scrollLeft: number,
  anchorX: number,
): number {
  return next.toX(prev.toDate(scrollLeft + anchorX)) - anchorX;
}

/**
 * `scrollLeft` after the painted timeline changed from `prev` to `next`, or `null` when the
 * scroll can stay (same model, or the same density and range start):
 *
 * - **zoom** (`pxPerDay` changed): the date under `anchorX` stays under it — `anchorX` is
 *   px from the viewport's left edge (the pointer for Ctrl/⌘ + wheel and pinch, clamped
 *   to the viewport) and defaults to the viewport centre (buttons, keys) when it is
 *   `undefined`, `null` or not finite;
 * - **a new range start** at the same density (tasks added or moved earlier, `now` moved):
 *   the dates stay where they were, so the left edge keeps its date.
 *
 * The result is rounded and clamped to the scrollable range of `next`. Dates are read as
 * local calendar days, so the anchor holds across DST changes and in every time zone.
 */
export function anchoredScrollLeft(
  prev: TimelineModel,
  next: TimelineModel,
  scrollLeft: number,
  viewportWidth: number,
  anchorX?: number | null,
): number | null {
  if (prev === next) return null;
  const zoomed = prev.pxPerDay !== next.pxPerDay;
  if (!zoomed && prev.start.getTime() === next.start.getTime()) return null;
  const vw = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const left = Number.isFinite(scrollLeft) ? scrollLeft : 0;
  const anchor = !zoomed
    ? 0
    : typeof anchorX === 'number' && Number.isFinite(anchorX)
      ? Math.min(vw, Math.max(0, anchorX))
      : vw / 2;
  // The range starts are local dates core generated itself: no date-only normalisation
  const day = calendarDays(prev.start, false) + (left + anchor) / prev.pxPerDay;
  return clampScroll((day - calendarDays(next.start, false)) * next.pxPerDay - anchor, next, vw);
}

/**
 * `scrollLeft` for "fit to screen" once the fitting level is painted (see `fitZoomLevel`):
 * the earliest task `margin` px from the left edge (default {@link FIT_MARGIN}, at most a
 * quarter of the viewport), clamped. `null` without tasks.
 */
export function fitScrollLeft(timeline: TimelineModel, viewportWidth: number, margin = FIT_MARGIN): number | null {
  const extent = timeline.extent;
  if (!extent) return null;
  const vw = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  return clampScroll(timeline.toX(extent.start) - fitMargin(vw, margin), timeline, vw);
}

/** Clamp a scroll offset to the timeline's scrollable range. */
export function clampScroll(x: number, timeline: TimelineModel, viewportWidth: number): number {
  return Math.round(Math.max(0, Math.min(x, timeline.totalWidth - viewportWidth)));
}
