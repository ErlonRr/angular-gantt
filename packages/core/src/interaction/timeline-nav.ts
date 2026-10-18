// ─────────────────────────────────────────────────────────────
//  gantry · interaction/timeline-nav.ts
//  Keyboard moves between bars (row by row) and panning of the
//  timeline by one bottom-tier cell. Pure: bindings move DOM focus
//  to the bar of the returned row (scrolling it into view) or set
//  the viewport's scrollLeft; nothing here touches the DOM.
//
//    Up / Down            bar of the previous / next row
//    PageUp / PageDown    ± pageSize rows
//    Home / End           bar of the first / last row (Ctrl/Cmd too)
//    Left / Right         pan one bottom-tier cell earlier / later
//
//  Moves never wrap. Left/right are logical (see keymap.ts); the
//  time axis runs left to right, so `move.left` pans earlier.
// ─────────────────────────────────────────────────────────────

import type { TimelineModel } from '../render/timeline';
import { resolveKey, type KeyLike, type MoveCommand } from './keymap';
import { DEFAULT_GRID_PAGE_SIZE } from './grid-nav';

export interface TimelineNavState {
  /** Row of the focused bar, 0-based among the visible rows */
  row: number;
  rowCount: number;
}

export interface TimelineNavOptions {
  /** Rows moved by PageUp / PageDown (bindings pass the rows of one viewport). Default 10. */
  pageSize?: number | undefined;
  /**
   * Ctrl/Cmd held (`isGridEdgeJump`). Home / End go to the first / last row either way; the flag is
   * accepted so a binding can pass the grid context unchanged. Default `false`.
   */
  toEdge?: boolean | undefined;
}

/**
 * `move`: focus the bar of `row` · `pan`: scroll the timeline one cell earlier (`-1`) or later
 * (`1`), see `panScrollLeft` · `none`: already at the edge — still swallow the key so the page
 * does not scroll.
 */
export type TimelineNavResult = { action: 'move'; row: number } | { action: 'pan'; dir: -1 | 1 } | { action: 'none' };

const NONE: TimelineNavResult = { action: 'none' };

/** Next bar (or a pan) for a move command while a bar has focus. */
export function navigateTimeline(
  state: TimelineNavState,
  command: MoveCommand,
  options: TimelineNavOptions = {},
): TimelineNavResult {
  if (command === 'move.left') return { action: 'pan', dir: -1 };
  if (command === 'move.right') return { action: 'pan', dir: 1 };

  const rowCount = Math.max(0, Math.floor(state.rowCount));
  if (rowCount === 0) return NONE;
  const last = rowCount - 1;
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? DEFAULT_GRID_PAGE_SIZE));
  const row = Math.min(Math.max(Math.floor(state.row), 0), last);
  const to = (r: number): TimelineNavResult => {
    const next = Math.min(Math.max(r, 0), last);
    return next === state.row ? NONE : { action: 'move', row: next };
  };

  switch (command) {
    case 'move.up':
      return to(row - 1);
    case 'move.down':
      return to(row + 1);
    case 'move.pageUp':
      return to(row - pageSize);
    case 'move.pageDown':
      return to(row + pageSize);
    case 'move.home':
      return to(0);
    case 'move.end':
      return to(last);
  }
}

/**
 * `resolveKey(event, 'timeline')` + `navigateTimeline` in one step. Returns `null` when the key is
 * not a move (Space, Enter, F2, shortcuts…: the binding handles it as another command).
 */
export function navigateTimelineKey(
  state: TimelineNavState,
  event: KeyLike,
  options: Omit<TimelineNavOptions, 'toEdge'> = {},
): TimelineNavResult | null {
  const command = resolveKey(event, 'timeline', { characterShortcuts: false });
  if (!command?.startsWith('move.')) return null;
  return navigateTimeline(state, command as MoveCommand, options);
}

/** A cell boundary closer than this (px) to the current scroll position counts as reached. */
const PAN_EPSILON = 1;

/**
 * The scrollLeft after panning one bottom-tier cell earlier (`dir` -1) or later (`1`): the start of
 * the previous / next cell of the bottom header tier, so the view stays aligned to the cells (a
 * view scrolled to the middle of a cell first aligns to it). Boundaries less than 1 px away are
 * skipped, so fractional browser scroll positions never stall. Clamped to `[0, totalWidth −
 * viewportWidth]`; returns the clamped `scrollLeft` itself at the edge.
 */
export function panScrollLeft(
  timeline: Pick<TimelineModel, 'tiers' | 'totalWidth' | 'pxPerDay'>,
  scrollLeft: number,
  viewportWidth: number,
  dir: -1 | 1,
): number {
  const max = Math.max(0, timeline.totalWidth - Math.max(0, viewportWidth));
  const clamp = (x: number) => Math.min(Math.max(x, 0), max);
  const from = clamp(Number.isFinite(scrollLeft) ? scrollLeft : 0);
  const cells = timeline.tiers.at(-1)?.cells ?? [];
  // No header cells: one day
  if (cells.length === 0) return clamp(from + dir * Math.max(1, timeline.pxPerDay));

  // Number of cells starting before `x` (or at `x` too, with `inclusive`); cells are in x order
  const countBefore = (x: number, inclusive: boolean): number => {
    let lo = 0;
    let hi = cells.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const cx = cells[mid]?.x ?? Infinity;
      if (cx < x || (inclusive && cx === x)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  if (dir > 0) {
    // First cell starting at least 1 px after the left edge
    const next = cells[countBefore(from + PAN_EPSILON, false)];
    return clamp(next ? next.x : timeline.totalWidth);
  }
  // Last cell starting at least 1 px before the left edge
  const prev = cells[countBefore(from - PAN_EPSILON, true) - 1];
  return clamp(prev ? prev.x : 0);
}
