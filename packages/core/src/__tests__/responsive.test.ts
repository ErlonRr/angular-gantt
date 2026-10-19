// ─────────────────────────────────────────────────────────────
//  Tests — the narrow-width view switch (Phase 10, step 2.5):
//  `isNarrow`, `reduceResponsive` (crossing in and out, the user's pick
//  wins while narrow, option changes, a view applied while narrow by
//  anything but the user) and `persistedView` (the forced view is never
//  persisted).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import type { GanttView } from '../types';
import { resolveConfig, type ResolvedResponsive } from '../render/config';
import {
  INITIAL_RESPONSIVE_STATE,
  isNarrow,
  persistedView,
  reduceResponsive,
  type ResponsiveEvent,
  type ResponsiveState,
} from '../state/responsive';

const R: ResolvedResponsive = { breakpoint: 640, view: 'chart' };

/**
 * A chart that applies the forced view the way a binding does: `view` is what it shows, the
 * reducer's view replaces it without saving state.
 */
function chart(initial: GanttView, responsive: ResolvedResponsive | false = R) {
  let state: ResponsiveState = INITIAL_RESPONSIVE_STATE;
  let view = initial;
  let cfg = responsive;
  const dispatch = (e: ResponsiveEvent): GanttView | null => {
    const out = reduceResponsive(state, e);
    state = out.state;
    if (out.view !== null) view = out.view;
    return out.view;
  };
  let lastWidth = 0;
  return {
    width: (width: number) => {
      lastWidth = width;
      return dispatch({ type: 'width', width, responsive: cfg, view });
    },
    /** The view set by something else than the user (no event: the next `width` tells) */
    set: (v: GanttView) => (view = v),
    get lastWidth() {
      return lastWidth;
    },
    pick: (v: GanttView) => {
      view = v;
      return dispatch({ type: 'userView', view: v });
    },
    configure: (next: ResolvedResponsive | false) => (cfg = next),
    get view() {
      return view;
    },
    get state() {
      return state;
    },
    get persisted() {
      return persistedView(state, view);
    },
  };
}

describe('isNarrow', () => {
  it('is strictly below the breakpoint', () => {
    expect(isNarrow(639, R)).toBe(true);
    expect(isNarrow(320, R)).toBe(true);
    expect(isNarrow(640, R)).toBe(false);
    expect(isNarrow(1400, R)).toBe(false);
  });

  it('is never narrow unmeasured (0, negative, NaN) or with responsive off', () => {
    expect(isNarrow(0, R)).toBe(false);
    expect(isNarrow(-5, R)).toBe(false);
    expect(isNarrow(Number.NaN, R)).toBe(false);
    expect(isNarrow(100, false)).toBe(false);
  });

  it('reads the resolved option: on by default at 640 px, off with false', () => {
    const on = resolveConfig({}).responsive;
    expect(on).toEqual({ breakpoint: 640, view: 'chart' });
    expect(isNarrow(600, on)).toBe(true);
    expect(isNarrow(600, resolveConfig({ responsive: false }).responsive)).toBe(false);
    const custom = resolveConfig({ responsive: { breakpoint: 900, view: 'table' } }).responsive;
    expect(isNarrow(800, custom)).toBe(true);
  });
});

describe('reduceResponsive — crossing in and out', () => {
  it('starts wide', () => {
    expect(INITIAL_RESPONSIVE_STATE).toEqual({ narrow: false, userView: null, wideView: null, shown: null });
    expect(Object.isFrozen(INITIAL_RESPONSIVE_STATE)).toBe(true);
  });

  it('leaves a wide chart alone (same state object)', () => {
    const out = reduceResponsive(INITIAL_RESPONSIVE_STATE, {
      type: 'width',
      width: 1100,
      responsive: R,
      view: 'split',
    });
    expect(out.view).toBeNull();
    expect(out.state).toBe(INITIAL_RESPONSIVE_STATE);
  });

  it('crossing below the breakpoint forces responsive.view and remembers the wide view', () => {
    const out = reduceResponsive(INITIAL_RESPONSIVE_STATE, { type: 'width', width: 600, responsive: R, view: 'split' });
    expect(out).toEqual({ state: { narrow: true, userView: null, wideView: 'split', shown: 'chart' }, view: 'chart' });
  });

  it('staying narrow changes nothing (same state object)', () => {
    const c = chart('split');
    c.width(600);
    const before = c.state;
    expect(c.width(400)).toBeNull();
    expect(c.width(639)).toBeNull();
    expect(c.state).toBe(before);
    expect(c.view).toBe('chart');
  });

  it('crossing back restores the wide view', () => {
    const c = chart('split');
    expect(c.width(600)).toBe('chart');
    expect(c.width(640)).toBe('split');
    expect(c.state).toEqual(INITIAL_RESPONSIVE_STATE);
    expect(c.view).toBe('split');
  });

  it('forces a custom view', () => {
    const c = chart('split', { breakpoint: 900, view: 'table' });
    expect(c.width(800)).toBe('table');
    expect(c.width(1000)).toBe('split');
  });

  it('crosses in and out repeatedly', () => {
    const c = chart('table');
    for (let i = 0; i < 3; i++) {
      c.width(500);
      expect(c.view).toBe('chart');
      c.width(900);
      expect(c.view).toBe('table');
    }
  });

  it('is narrow from the first measure, with the initial view as the wide view', () => {
    const c = chart('split');
    expect(c.width(390)).toBe('chart');
    expect(c.state.wideView).toBe('split');
  });

  it('ignores an unmeasured width (hidden chart) while narrow', () => {
    const c = chart('split');
    c.width(500);
    const before = c.state;
    expect(c.width(0)).toBeNull();
    expect(c.state).toBe(before);
    expect(c.view).toBe('chart');
  });

  it('restoring a wide view that is already shown moves nothing', () => {
    const c = chart('chart');
    expect(c.width(500)).toBe('chart');
    expect(c.width(800)).toBeNull();
    expect(c.view).toBe('chart');
  });
});

describe('reduceResponsive — the user picks a view while narrow', () => {
  it('the pick wins while narrow, and is not forced back on later widths', () => {
    const c = chart('split');
    c.width(600);
    expect(c.pick('table')).toBeNull();
    expect(c.state).toEqual({ narrow: true, userView: 'table', wideView: 'split', shown: 'table' });
    expect(c.width(500)).toBeNull();
    expect(c.width(320)).toBeNull();
    expect(c.view).toBe('table');
  });

  it('crossing back restores the wide view and forgets the pick; narrow again forces again', () => {
    const c = chart('split');
    c.width(600);
    c.pick('table');
    expect(c.width(1000)).toBe('split');
    expect(c.state.userView).toBeNull();
    expect(c.width(600)).toBe('chart');
  });

  it('a pick while wide changes nothing (same state object)', () => {
    const out = reduceResponsive(INITIAL_RESPONSIVE_STATE, { type: 'userView', view: 'chart' });
    expect(out).toEqual({ state: INITIAL_RESPONSIVE_STATE, view: null });
    expect(out.state).toBe(INITIAL_RESPONSIVE_STATE);
  });

  it('picking the forced view counts as a pick too', () => {
    const c = chart('split');
    c.width(600);
    c.pick('chart');
    expect(c.state.userView).toBe('chart');
    const same = c.state;
    expect(c.pick('chart')).toBeNull();
    expect(c.state).toBe(same);
  });
});

describe('reduceResponsive — option changes', () => {
  it('turning responsive off while narrow restores the wide view', () => {
    const c = chart('split');
    c.width(500);
    c.configure(false);
    expect(c.width(500)).toBe('split');
    expect(c.state).toEqual(INITIAL_RESPONSIVE_STATE);
  });

  it('responsive off never forces a view', () => {
    const c = chart('split', false);
    expect(c.width(300)).toBeNull();
    expect(c.view).toBe('split');
  });

  it('a larger breakpoint makes a wide chart narrow on the next width event', () => {
    const c = chart('split');
    expect(c.width(700)).toBeNull();
    c.configure({ breakpoint: 800, view: 'chart' });
    expect(c.width(700)).toBe('chart');
  });

  it('a new responsive.view while narrow is forced, unless the user picked a view', () => {
    const c = chart('split');
    c.width(500);
    c.configure({ breakpoint: 640, view: 'table' });
    expect(c.width(500)).toBe('table');
    c.pick('split');
    c.configure({ breakpoint: 640, view: 'chart' });
    expect(c.width(500)).toBeNull();
    expect(c.view).toBe('split');
  });
});

describe('reduceResponsive — a view applied while narrow by anything but the user', () => {
  /** The options or a restored state set the view (no `userView` event), then the binding re-checks. */
  function applied(c: ReturnType<typeof chart>, v: GanttView): GanttView | null {
    c.set(v);
    return c.width(c.lastWidth);
  }

  it('becomes the wide view, and the narrow view is forced again', () => {
    const c = chart('split');
    c.width(500);
    expect(applied(c, 'table')).toBe('chart');
    expect(c.state).toEqual({ narrow: true, userView: null, wideView: 'table', shown: 'chart' });
    expect(c.persisted).toBe('table');
    // Crossing back restores it
    expect(c.width(900)).toBe('table');
  });

  it('keeps the shown view in the state: the bindings track none', () => {
    const c = chart('split');
    c.width(500);
    expect(c.state.shown).toBe('chart');
    c.pick('table');
    expect(c.state.shown).toBe('table');
    c.configure({ breakpoint: 640, view: 'table' });
    expect(c.width(500)).toBeNull();
    expect(c.state.shown).toBe('table');
    c.width(900);
    expect(c.state.shown).toBeNull();
  });

  it('after a pick: the applied view shows, and becomes the wide view', () => {
    const c = chart('split');
    c.width(500);
    c.pick('table');
    expect(applied(c, 'chart')).toBeNull();
    expect(c.view).toBe('chart');
    expect(c.state).toEqual({ narrow: true, userView: 'table', wideView: 'chart', shown: 'chart' });
    expect(c.width(900)).toBeNull();
    expect(c.view).toBe('chart');
  });

  it('the shown view applied again is no change (same state object)', () => {
    const c = chart('split');
    c.width(500);
    const before = c.state;
    expect(applied(c, 'chart')).toBeNull();
    expect(c.state).toBe(before);
    expect(c.state.wideView).toBe('split');
  });

  it('is told apart only while narrow and measured', () => {
    const c = chart('split');
    // Wide: a new view is just the view (the wide view is taken when crossing)
    c.width(900);
    expect(applied(c, 'table')).toBeNull();
    expect(c.width(500)).toBe('chart');
    expect(c.state.wideView).toBe('table');
    // Unmeasured (hidden): nothing yet; the next measured width takes it
    c.set('split');
    expect(c.width(0)).toBeNull();
    expect(c.state.wideView).toBe('table');
    expect(c.width(500)).toBe('chart');
    expect(c.state.wideView).toBe('split');
  });

  it('turning responsive off with a new view at once keeps that view', () => {
    const c = chart('split');
    c.width(500);
    c.set('table');
    c.configure(false);
    expect(c.width(500)).toBeNull();
    expect(c.view).toBe('table');
    expect(c.state).toBe(INITIAL_RESPONSIVE_STATE);
  });
});

describe('persistedView — the forced view is never persisted', () => {
  it('is the current view while wide', () => {
    expect(persistedView(INITIAL_RESPONSIVE_STATE, 'table')).toBe('table');
  });

  it('is the wide view while narrow: forced or picked', () => {
    const c = chart('split');
    c.width(500);
    expect(c.view).toBe('chart');
    expect(c.persisted).toBe('split');
    c.pick('table');
    expect(c.persisted).toBe('split');
    c.width(900);
    expect(c.persisted).toBe('split');
  });

  it('falls back to the current view without a remembered one', () => {
    expect(persistedView({ narrow: true, userView: null, wideView: null, shown: null }, 'chart')).toBe('chart');
  });
});
