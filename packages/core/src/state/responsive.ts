// ─────────────────────────────────────────────────────────────
//  gantry · state/responsive.ts
//  The narrow-width view switch (`options.responsive`, on by default:
//  `{ breakpoint: 640, view: 'chart' }`): below the breakpoint the chart
//  shows `responsive.view`; a view the user picks while narrow wins
//  until the width crosses back, which restores the view shown before
//  (the wide view). The forced view is never persisted: `persistedView`
//  keeps the wide view in `getState().view`.
//
//  Bindings feed every measured chart width (and option change) as a
//  `width` event, every view the user picks (toolbar, `setView()`,
//  `togglePanel()`) as a `userView` event, and apply the returned view
//  without saving state. A view the binding forces is never reported
//  back as a `userView`. A view applied while narrow by anything else
//  (an `options.view` change, a restored state) is told apart by the
//  state's `shown`: it becomes the wide view, and the narrow view is
//  forced again. Bindings keep no view of their own.
// ─────────────────────────────────────────────────────────────

import type { GanttView } from '../types';
import type { ResolvedResponsive } from '../render/config';

/** The responsive state of a chart. */
export interface ResponsiveState {
  /** The chart is below the breakpoint */
  narrow: boolean;
  /** A view the user picked while narrow (wins over `responsive.view`), else `null` */
  userView: GanttView | null;
  /** The view shown when the chart became narrow: restored on crossing back and persisted meanwhile; `null` while wide */
  wideView: GanttView | null;
  /**
   * The view the chart shows after the last event while narrow (forced, picked or kept); `null`
   * while wide. A `width` event whose `view` differs got its view from something else than the
   * user (an `options.view` change, a restored state): that view becomes `wideView`.
   */
  shown: GanttView | null;
}

export const INITIAL_RESPONSIVE_STATE: Readonly<ResponsiveState> = Object.freeze({
  narrow: false,
  userView: null,
  wideView: null,
  shown: null,
});

export type ResponsiveEvent =
  /**
   * The chart width was measured (or `responsive` changed); `view` is the view the chart shows now.
   * A width of 0 or less (not measured, hidden, SSR) is ignored.
   */
  | { type: 'width'; width: number; responsive: ResolvedResponsive | false; view: GanttView }
  /** The user picked a view (toolbar, `setView()`, `togglePanel()`), already applied by the binding */
  | { type: 'userView'; view: GanttView };

/** Whether a chart `width` px wide is narrow: strictly below the breakpoint (an unmeasured width, 0 or less, never is). */
export function isNarrow(width: number, responsive: ResolvedResponsive | false): boolean {
  return responsive !== false && width > 0 && width < responsive.breakpoint;
}

/**
 * The next state, and the view the binding applies without saving state (`null`: leave the view
 * alone):
 * - crossing below the breakpoint: remember the view shown (the wide view) and force `responsive.view`;
 * - staying narrow: nothing, unless no view was picked and `responsive.view` changed (force it again);
 * - crossing back (or `responsive` turned off): restore the wide view and forget the user's pick;
 * - a view picked while narrow is remembered and wins until the width crosses back;
 * - a `width` event while narrow whose `view` is not the one shown (`state.shown`: the options or
 *   a restored state changed it) makes that view the wide view, then the rules above apply.
 * The same state object comes back when nothing changes.
 */
export function reduceResponsive(
  state: ResponsiveState,
  event: ResponsiveEvent,
): { state: ResponsiveState; view: GanttView | null } {
  if (event.type === 'userView') {
    if (!state.narrow || (state.userView === event.view && state.shown === event.view)) return { state, view: null };
    return { state: { ...state, userView: event.view, shown: event.view }, view: null };
  }
  if (!(event.width > 0)) return { state, view: null };
  // Changed while narrow by the options or a restored state (the user's picks come as
  // `userView`): the view to restore once wide
  const current =
    state.narrow && state.shown !== null && event.view !== state.shown ? { ...state, wideView: event.view } : state;
  const narrow = isNarrow(event.width, event.responsive);
  if (narrow && event.responsive !== false) {
    const forced = event.responsive.view;
    if (!current.narrow) {
      return { state: { narrow: true, userView: null, wideView: event.view, shown: forced }, view: forced };
    }
    const view = current.userView === null && event.view !== forced ? forced : null;
    const shown = view ?? event.view;
    return { state: current.shown === shown ? current : { ...current, shown }, view };
  }
  if (!current.narrow) return { state, view: null };
  const wide = current.wideView ?? event.view;
  return { state: INITIAL_RESPONSIVE_STATE, view: wide === event.view ? null : wide };
}

/** The view to persist (`getState().view`, saved state): the wide view while narrow, else `current`. */
export function persistedView(state: ResponsiveState, current: GanttView): GanttView {
  return state.narrow ? (state.wideView ?? current) : current;
}
