/**
 * @file responsive.ts
 * The narrow-width view switch (`options.responsive`, on by default: below `breakpoint` px the
 * chart shows `responsive.view`; core `reduceResponsive`). The state lives here, outside the
 * graph: it changes only through the hooks below, never from a paint, and it writes inputs only:
 * `inputs.narrow` (`data-narrow` on the wrapper, host region) and the forced view
 * (`inputs.viewOverride`, without `saveState`: the forced view is never persisted).
 *
 * Wiring (in `engine/engine.ts` and `gantry.element.ts`):
 * - `onWidth(width)`: the width of `.gantry-main` (`mainW`) when the element connects (before the
 *   panes are sized), from the ResizeObserver, and after an `options` assignment (the
 *   `responsive` option or the view may have changed) with the last measured width. A 0 width
 *   (not measured, hidden) changes nothing. A new width also closes the toolbar's More menu (its
 *   controls may move);
 * - `onUserView(view)`: the user picked a view (`setView()`, `togglePanel()`, the toolbar, the
 *   splitter's toggle): while narrow it wins until the width crosses back;
 * - `persistedView(current)`: the view `getState()` and the saved state report (the wide view
 *   while narrow, core `persistedView`).
 *
 * A view applied while narrow by anything but the user (an `options.view` change, a restored
 * state) is not a pick: it becomes the view restored when the chart is wide again, and the narrow
 * view is forced again (core `reduceResponsive` tells it apart by the state's `shown` view).
 */

import {
  INITIAL_RESPONSIVE_STATE,
  persistedView,
  reduceResponsive,
  type GanttView,
  type ResolvedResponsive,
  type ResponsiveState,
} from '@gantryjs/core';
import { batch } from '../reactive';
import type { LayerContext } from './context';
import { closeToolbarMenu } from './toolbar';

export interface ResponsiveLayer {
  /** The chart's width (`mainW`, px) was measured or the options changed. */
  onWidth(width: number): void;
  /** The user picked a view (already applied). */
  onUserView(view: GanttView): void;
  /** The view to persist: the wide view while narrow, else `current` (core `persistedView`). */
  persistedView(current: GanttView): GanttView;
}

export function createResponsiveLayer(ctx: LayerContext): ResponsiveLayer {
  const { inputs: I, graph: G, dom } = ctx;
  let state: ResponsiveState = INITIAL_RESPONSIVE_STATE;
  /** The width of the last `onWidth` */
  let lastWidth = 0;

  /** `responsive` of the options, `undefined` while they are invalid (the render reports them) */
  const resolved = (): ResolvedResponsive | false | undefined => {
    try {
      return G.config.peek().responsive;
    } catch {
      return undefined;
    }
  };

  return {
    onWidth(width) {
      if (width !== lastWidth) {
        lastWidth = width;
        closeToolbarMenu(dom);
      }
      const responsive = resolved();
      if (responsive === undefined) return;
      const next = reduceResponsive(state, { type: 'width', width, responsive, view: I.viewOverride.peek() });
      state = next.state;
      batch(() => {
        I.narrow.set(state.narrow);
        if (next.view !== null) I.viewOverride.set(next.view);
      });
    },
    onUserView(view) {
      state = reduceResponsive(state, { type: 'userView', view }).state;
    },
    persistedView: current => persistedView(state, current),
  };
}
