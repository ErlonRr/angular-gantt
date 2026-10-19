// ─────────────────────────────────────────────────────────────
//  gantry · layout/responsive.ts
//
//  The narrow-width view switch (`options.responsive`, on by default:
//  `{ breakpoint: 640, view: 'chart' }`: below `breakpoint` px the chart
//  shows `responsive.view`), the Web Component's `layers/responsive.ts`.
//  One per chart, provided by GantryComponent. The view logic is core's
//  (`reduceResponsive`, `persistedView`); the state lives here and changes
//  only through the hooks below, never during a render. It writes the
//  shown view (`layout.view`) without saving state: the forced view is
//  never persisted.
//
//  - `onWidth(px)`: every measured width of the main area (GantryComponent's
//    ResizeObserver callback; a 0 width, not measured or hidden, changes
//    nothing), and, from this service's effect, the last measured width
//    again whenever the `responsive` option or the view applied by the
//    options changes;
//  - `recheck()`: the last measured width again, at once (`setState()`, as
//    the Web Component's: a view restored while narrow becomes the wide
//    view before `setState()` returns);
//  - `userView(view)`: the user picked a view (the toolbar's view radios and
//    panel toggle, the splitter's toggle, `setView()`, `togglePanel()`):
//    while narrow it wins until the width crosses back;
//  - `persistedView(view)`: the view `getState()` (and so every saved state)
//    reports: the wide view while the chart is narrow;
//  - `narrow()` → the host's `data-narrow`.
//
//  A view applied while narrow by anything but the user (an `options.view`
//  change, a restored state) is not a pick: it becomes the view restored
//  when the chart is wide again, and the narrow view is forced again (core
//  `reduceResponsive` tells it apart by the state's `shown` view).
//
//  The toolbar's More menu closes on any width change by itself (its open
//  state is reset by `layout.mainWidth`, which GantryComponent writes with
//  the same measurement right before `onWidth`).
// ─────────────────────────────────────────────────────────────

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  INITIAL_RESPONSIVE_STATE,
  persistedView,
  reduceResponsive,
  type GanttView,
  type ResolvedResponsive,
  type ResponsiveState,
} from '@gantryjs/core';

import { GanttLayoutService } from './gantt-layout.service';

/** `responsive` of the resolved options; `undefined` while they can't be resolved */
type ResponsiveOption = ResolvedResponsive | false | undefined;

const sameResponsive = (a: ResponsiveOption, b: ResponsiveOption): boolean =>
  a === b || (!!a && !!b && a.breakpoint === b.breakpoint && a.view === b.view);

@Injectable()
export class GanttResponsive {
  private readonly layout = inject(GanttLayoutService);

  /** The chart's responsive state (core `reduceResponsive`) */
  protected readonly state = signal<ResponsiveState>(INITIAL_RESPONSIVE_STATE);

  /** The chart is below `responsive.breakpoint` (the host's `data-narrow`) */
  readonly narrow = computed(() => this.state().narrow);

  /** `options.responsive`, resolved (`undefined` while the options are invalid: the chart reports them) */
  private readonly responsive = computed<ResponsiveOption>(
    () => {
      try {
        return this.layout.cfg().responsive;
      } catch {
        return undefined;
      }
    },
    { equal: sameResponsive },
  );

  /** The width of the last `onWidth` (px; 0: not measured) */
  private lastWidth = 0;

  constructor() {
    // The `responsive` option or the view applied by the options or a restored state changed:
    // the switch looks again at the last measured width (as the Web Component does after an
    // `options` assignment; `setState` rechecks at once). A view the user picked is already the
    // state's `shown`: no change.
    effect(() => {
      this.responsive();
      this.layout.view();
      untracked(() => this.onWidth(this.lastWidth));
    });
  }

  /** The main area was measured `width` px wide (0: not measured, hidden). */
  onWidth(width: number): void {
    this.lastWidth = width;
    const responsive = this.responsive();
    if (responsive === undefined) return;
    const view = this.layout.view();
    const next = reduceResponsive(untracked(this.state), { type: 'width', width, responsive, view });
    this.state.set(next.state);
    // Applied as is: no `saveState` (the forced view is never persisted)
    if (next.view !== null) this.layout.view.set(next.view);
  }

  /**
   * The last measured width again, at once: `setState()` restored a view (while narrow it becomes
   * the wide view and the narrow view is forced again before `setState()` returns).
   */
  recheck(): void {
    // Nothing read here becomes a dependency of a caller's effect
    untracked(() => this.onWidth(this.lastWidth));
  }

  /** The user picked `view` (toolbar, `setView()`, `togglePanel()`): it wins while the chart stays narrow. */
  userView(view: GanttView): void {
    this.state.set(reduceResponsive(untracked(this.state), { type: 'userView', view }).state);
  }

  /** The view to persist (`getState().view`, saved state): the wide view while narrow, else `current`. */
  persistedView(current: GanttView): GanttView {
    return persistedView(this.state(), current);
  }
}
