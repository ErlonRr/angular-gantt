// ─────────────────────────────────────────────────────────────
//  gantry · render/zoom.ts
//  Zoom gestures (Ctrl/⌘ + wheel, trackpad and touch pinch) and the
//  fit-to-screen level. Zoom levels are discrete, so every gesture is
//  turned into whole steps here; painters only feed it the raw event
//  values and apply the steps (anchored with `anchoredScrollLeft`).
// ─────────────────────────────────────────────────────────────

import { calendarDays } from '../gantt-math';
import type { GanttZoomLevel } from '../types';
import { levelPxPerDay } from './scales';
import type { TimelineModel } from './timeline';

/** Accumulated wheel distance (px, after {@link wheelZoom}'s `deltaMode` normalisation) per zoom level. */
export const WHEEL_ZOOM_DELTA = 100;

/**
 * Pixels one wheel *line* counts for (`deltaMode` 1, Firefox's mouse wheel: 3 lines a notch,
 * so a notch is 120 px — one zoom level, like Chromium's 100–120 px pixel-mode notch).
 */
export const WHEEL_LINE_DELTA = 40;

/** Pixels one wheel *page* counts for (`deltaMode` 2): a page is one zoom level. */
export const WHEEL_PAGE_DELTA = WHEEL_ZOOM_DELTA;

/** Finger-distance ratio of one touch-pinch zoom step (spread ×1.25 = one level finer). */
export const PINCH_ZOOM_RATIO = 1.25;

/** Space (px) kept on each side of the tasks by "fit to screen" (at most a quarter of the viewport). */
export const FIT_MARGIN = 32;

// ─── Wheel ────────────────────────────────────────────────────

/** Wheel-zoom accumulator, kept by the painter between `wheel` events. */
export interface WheelZoomState {
  /**
   * Normalised `deltaY` (px) not yet turned into a step, `|delta| < WHEEL_ZOOM_DELTA`.
   * Negative = towards zooming in.
   */
  delta: number;
}

/** A fresh wheel-zoom accumulator (also what a painter resets to, e.g. when the pointer leaves). */
export function initialWheelZoomState(): WheelZoomState {
  return { delta: 0 };
}

/**
 * Turn one Ctrl/⌘ + wheel event (trackpad pinch arrives as one too) into zoom steps.
 *
 * `deltaY` is normalised by `deltaMode` (`WheelEvent.DOM_DELTA_PIXEL` 0 → px,
 * `DOM_DELTA_LINE` 1 → {@link WHEEL_LINE_DELTA} px a line, `DOM_DELTA_PAGE` 2 →
 * {@link WHEEL_PAGE_DELTA} px a page; anything else counts as px) and accumulated:
 * every {@link WHEEL_ZOOM_DELTA} px is one step. A delta against the accumulated direction
 * drops the leftover first, so reversing responds at once.
 *
 * `steps > 0` zooms **in** that many levels (negative `deltaY`, wheel up / pinch out),
 * `steps < 0` zooms out; `0` waits for more. Keep the returned `state` for the next event.
 * A non-finite `deltaY` changes nothing.
 */
export function wheelZoom(
  state: WheelZoomState,
  deltaY: number,
  deltaMode: number,
): { state: WheelZoomState; steps: number } {
  if (!Number.isFinite(deltaY) || deltaY === 0) return { state, steps: 0 };
  const px = deltaY * (deltaMode === 1 ? WHEEL_LINE_DELTA : deltaMode === 2 ? WHEEL_PAGE_DELTA : 1);
  const kept = Number.isFinite(state.delta) && Math.sign(state.delta) === Math.sign(px) ? state.delta : 0;
  const total = kept + px;
  const whole = Math.trunc(total / WHEEL_ZOOM_DELTA);
  const rest = total - whole * WHEEL_ZOOM_DELTA;
  // Zooming in is a negative deltaY; `+ 0` turns `-0` into `0`
  return { state: { delta: rest }, steps: -whole + 0 };
}

// ─── Pinch ────────────────────────────────────────────────────

/** Tolerance for floating-point step boundaries (a spread of exactly ×1.25 is one step). */
const STEP_EPSILON = 1e-9;

/**
 * Zoom steps a touch pinch has earned since the last call: the gesture's step count is
 * `log(d / d0) / log(ratio)` (spread ×1.25 = one level in, pinch ×0.8 = one level out) and
 * this returns how far it moved past `applied` — the steps already taken in this gesture.
 *
 * A step is taken only once the count reaches the next whole number away from `applied`,
 * so fingers resting on a boundary don't flip between two levels (a step in at ×1.25 goes
 * back out at ×1). `> 0` zooms in, `< 0` zooms out. Add the result to `applied` even when
 * the zoom is already at its finest/coarsest level, so the gesture stays consistent.
 *
 * @param d0      Distance (px) between the two touches when the pinch started
 * @param d       Their current distance
 * @param applied Steps already applied for this gesture (start at `0`)
 * @param ratio   Distance ratio of one step (default {@link PINCH_ZOOM_RATIO})
 */
export function pinchZoomSteps(d0: number, d: number, applied: number, ratio = PINCH_ZOOM_RATIO): number {
  if (!(d0 > 0 && d > 0 && Number.isFinite(d0) && Number.isFinite(d) && ratio > 1 && Number.isFinite(ratio))) {
    return 0;
  }
  const done = Number.isFinite(applied) ? applied : 0;
  const moved = Math.log(d / d0) / Math.log(ratio) - done;
  const steps = moved >= 0 ? Math.floor(moved + STEP_EPSILON) : Math.ceil(moved - STEP_EPSILON);
  return steps + 0;
}

// ─── Fit to screen ────────────────────────────────────────────

export interface FitZoomInput {
  /** The zoom levels to choose from (`config.zoomLevels`) */
  levels: readonly GanttZoomLevel[];
  /** The tasks' extent as drawn (`TimelineModel.extent`, the same at every level) */
  extent: TimelineModel['extent'];
  /** Visible width of the timeline viewport (px) */
  viewportWidth: number;
  /** Space kept on each side of the tasks (default {@link FIT_MARGIN}, at most a quarter of the viewport) */
  margin?: number | undefined;
}

/**
 * Margin "fit to screen" keeps on each side of the tasks for a viewport width:
 * `margin` (default {@link FIT_MARGIN}), at most a quarter of the viewport, never negative.
 */
export function fitMargin(viewportWidth: number, margin: number = FIT_MARGIN): number {
  const m = Number.isFinite(margin) ? Math.max(0, margin) : FIT_MARGIN;
  return Number.isFinite(viewportWidth) && viewportWidth > 0 ? Math.min(m, viewportWidth / 4) : m;
}

/**
 * Name of the zoom level "fit to screen" switches to: the finest one (highest px per day)
 * at which the task extent plus {@link fitMargin} on each side fits the viewport; the
 * coarsest level when none does. Ties go to the earlier level in `levels`.
 *
 * `null` when there is nothing to fit — no task, no level, or a viewport without a
 * measurable width (before layout, hidden, SSR).
 */
export function fitZoomLevel(input: FitZoomInput): string | null {
  const { levels, extent, viewportWidth } = input;
  if (!extent || levels.length === 0 || !(Number.isFinite(viewportWidth) && viewportWidth > 0)) return null;
  const room = viewportWidth - 2 * fitMargin(viewportWidth, input.margin);
  // Extent dates are already normalised (`taskSpan`): read them as local calendar days
  const days = Math.max(0, calendarDays(extent.end, false) - calendarDays(extent.start, false));

  let fit: { name: string; pxPerDay: number } | null = null;
  let coarsest: { name: string; pxPerDay: number } | null = null;
  for (const level of levels) {
    const pxPerDay = levelPxPerDay(level);
    if (!(Number.isFinite(pxPerDay) && pxPerDay > 0)) continue;
    if (!coarsest || pxPerDay < coarsest.pxPerDay) coarsest = { name: level.name, pxPerDay };
    if (Math.ceil(days * pxPerDay - STEP_EPSILON) <= room && (!fit || pxPerDay > fit.pxPerDay)) {
      fit = { name: level.name, pxPerDay };
    }
  }
  return (fit ?? coarsest)?.name ?? null;
}
