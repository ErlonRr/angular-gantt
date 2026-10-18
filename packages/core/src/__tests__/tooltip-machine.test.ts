// ─────────────────────────────────────────────────────────────
//  Tests — state/tooltip.ts open / close machine (`reduceTooltip`):
//  hover delay and intent, focus at once, tap toggles, the pointer
//  resting on the tooltip, dismiss (Esc), the triggers, and a
//  binding-like driver with fake timers.
// ─────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../render/config';
import {
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  initialTooltipState,
  reduceTooltip,
  tooltipVisibleId,
  type TooltipEvent,
  type TooltipMachineOptions,
  type TooltipState,
  type TooltipTransition,
} from '../state/tooltip';

const AUTO: TooltipMachineOptions = { trigger: 'auto', showDelay: 320, hideDelay: 120 };
const HOVER: TooltipMachineOptions = { ...AUTO, trigger: 'hover' };
const FOCUS: TooltipMachineOptions = { ...AUTO, trigger: 'focus' };

const hover = (id: string): TooltipEvent => ({ type: 'hover', id });
const focus = (id: string): TooltipEvent => ({ type: 'focus', id });
const tap = (id: string): TooltipEvent => ({ type: 'tap', id });
const UNHOVER: TooltipEvent = { type: 'unhover' };
const BLUR: TooltipEvent = { type: 'blur' };
const DISMISS: TooltipEvent = { type: 'dismiss' };
const ENTER: TooltipEvent = { type: 'enterTooltip' };
const LEAVE: TooltipEvent = { type: 'leaveTooltip' };
const TIMER: TooltipEvent = { type: 'timer' };

/** Runs events in order; returns every transition (the last one's state is the result). */
function run(events: TooltipEvent[], options = AUTO, from = initialTooltipState()): TooltipTransition[] {
  const out: TooltipTransition[] = [];
  let state = from;
  for (const e of events) {
    const t = reduceTooltip(state, e, options);
    out.push(t);
    state = t.state;
  }
  return out;
}
const last = (events: TooltipEvent[], options = AUTO, from?: TooltipState): TooltipTransition =>
  run(events, options, from).at(-1)!;
const stateAfter = (events: TooltipEvent[], options = AUTO, from?: TooltipState): TooltipState =>
  last(events, options, from).state;

describe('reduceTooltip — initial state', () => {
  it('starts closed with nothing hovered or focused', () => {
    const s = initialTooltipState();
    expect(s).toEqual({
      phase: 'closed',
      id: null,
      source: null,
      hovered: null,
      focused: null,
      onTooltip: false,
      dismissed: null,
    });
    expect(tooltipVisibleId(s)).toBeNull();
    expect(initialTooltipState()).toBe(s);
  });

  it('takes the resolved config.tooltip as options (its delays are the shared constants)', () => {
    const t = reduceTooltip(initialTooltipState(), hover('a'), resolveConfig().tooltip);
    expect(t.timer).toBe(TOOLTIP_SHOW_DELAY);
    const open = reduceTooltip(t.state, TIMER, resolveConfig().tooltip).state;
    expect(reduceTooltip(open, UNHOVER, resolveConfig().tooltip).timer).toBe(TOOLTIP_HIDE_DELAY);
  });
});

describe('reduceTooltip — hover', () => {
  it('opens after the show delay', () => {
    const [h, t] = run([hover('a'), TIMER]);
    expect(h.state).toMatchObject({ phase: 'opening', id: 'a', source: 'hover', hovered: 'a' });
    expect(h.timer).toBe(320);
    expect(tooltipVisibleId(h.state)).toBeNull();
    expect(t.state).toMatchObject({ phase: 'open', id: 'a', source: 'hover' });
    expect(t.timer).toBeNull();
    expect(tooltipVisibleId(t.state)).toBe('a');
  });

  it('restarts the delay while the pointer keeps moving on the bar (hover intent)', () => {
    const [first, again] = run([hover('a'), hover('a')]);
    expect(again.timer).toBe(320);
    expect(again.state).toBe(first.state);
  });

  it('moving to another bar before it opens restarts the delay for that bar', () => {
    const t = last([hover('a'), hover('b')]);
    expect(t.state).toMatchObject({ phase: 'opening', id: 'b', hovered: 'b' });
    expect(t.timer).toBe(320);
  });

  it('pointer moves on the open bar change nothing (same state object, no timer)', () => {
    const open = stateAfter([hover('a'), TIMER]);
    const t = reduceTooltip(open, hover('a'), AUTO);
    expect(t.state).toBe(open);
    expect(t.timer).toBeNull();
  });

  it('leaving before it opens cancels it; the stale timer is ignored', () => {
    const s = stateAfter([hover('a'), UNHOVER]);
    expect(s).toMatchObject({ phase: 'closed', id: null, hovered: null });
    const t = reduceTooltip(s, TIMER, AUTO);
    expect(t.state).toBe(s);
    expect(t.timer).toBeNull();
  });

  it('closes after the hide delay; repeated unhovers keep the first deadline', () => {
    const [, , u1, u2, t] = run([hover('a'), TIMER, UNHOVER, UNHOVER, TIMER]);
    expect(u1.state).toMatchObject({ phase: 'closing', id: 'a', hovered: null });
    expect(u1.timer).toBe(120);
    expect(tooltipVisibleId(u1.state)).toBe('a');
    expect(u2.state).toBe(u1.state);
    expect(u2.timer).toBeNull();
    expect(t.state).toMatchObject({ phase: 'closed', id: null, source: null });
  });

  it('coming back to the bar while closing keeps it open', () => {
    const s = stateAfter([hover('a'), TIMER, UNHOVER, hover('a')]);
    expect(s).toMatchObject({ phase: 'open', id: 'a', hovered: 'a' });
    // The hide timer that is still pending does nothing now
    expect(reduceTooltip(s, TIMER, AUTO).state).toBe(s);
  });

  it('once a tooltip shows, hovering another bar switches at once (open or closing)', () => {
    const open = stateAfter([hover('a'), TIMER, hover('b')]);
    expect(open).toMatchObject({ phase: 'open', id: 'b', source: 'hover', hovered: 'b' });
    const t = last([hover('a'), TIMER, UNHOVER, hover('b')]);
    expect(t.state).toMatchObject({ phase: 'open', id: 'b' });
    expect(t.timer).toBeNull();
  });
});

describe('reduceTooltip — the pointer can rest on the tooltip (WCAG 1.4.13)', () => {
  it('entering the tooltip cancels the pending hide; leaving it starts the hide delay', () => {
    const [, , , enter, stale, leave, done] = run([hover('a'), TIMER, UNHOVER, ENTER, TIMER, LEAVE, TIMER]);
    expect(enter.state).toMatchObject({ phase: 'open', onTooltip: true });
    expect(stale.state).toBe(enter.state);
    expect(leave.state).toMatchObject({ phase: 'closing', onTooltip: false });
    expect(leave.timer).toBe(120);
    expect(done.state.phase).toBe('closed');
  });

  it('from the tooltip back to the bar keeps it open', () => {
    const s = stateAfter([hover('a'), TIMER, UNHOVER, ENTER, LEAVE, hover('a')]);
    expect(s).toMatchObject({ phase: 'open', id: 'a', onTooltip: false });
  });

  it('enter / leave events while nothing shows are ignored', () => {
    const closed = initialTooltipState();
    expect(reduceTooltip(closed, ENTER, AUTO).state).toBe(closed);
    expect(reduceTooltip(closed, LEAVE, AUTO).state).toBe(closed);
    const opening = stateAfter([hover('a')]);
    expect(reduceTooltip(opening, ENTER, AUTO).state).toBe(opening);
  });
});

describe('reduceTooltip — focus', () => {
  it('opens at once, without a timer', () => {
    const t = last([focus('a')]);
    expect(t.state).toMatchObject({ phase: 'open', id: 'a', source: 'focus', focused: 'a' });
    expect(t.timer).toBeNull();
  });

  it('focus moving from bar to bar switches at once (no blur needed)', () => {
    expect(stateAfter([focus('a'), focus('b')])).toMatchObject({ phase: 'open', id: 'b', focused: 'b' });
  });

  it('the pointer leaving does not close a focused bar’s tooltip; blur closes it at once', () => {
    const s = stateAfter([focus('a'), hover('a'), UNHOVER]);
    expect(s).toMatchObject({ phase: 'open', id: 'a' });
    const t = reduceTooltip(s, BLUR, AUTO);
    expect(t.state).toMatchObject({ phase: 'closed', id: null, focused: null });
    expect(t.timer).toBeNull();
  });

  it('blur keeps it while the pointer still holds it; the pointer then closes it', () => {
    const s = stateAfter([focus('a'), hover('a'), BLUR]);
    expect(s).toMatchObject({ phase: 'open', id: 'a', source: 'hover', focused: null });
    const t = reduceTooltip(s, UNHOVER, AUTO);
    expect(t.state.phase).toBe('closing');
    expect(t.timer).toBe(120);
  });

  it('focus overrides a pending hover; the stale show timer is ignored', () => {
    const s = stateAfter([hover('b'), focus('a')]);
    expect(s).toMatchObject({ phase: 'open', id: 'a', source: 'focus', hovered: 'b' });
    expect(reduceTooltip(s, TIMER, AUTO).state).toBe(s);
  });

  it('focus on the bar whose tooltip is closing keeps it open', () => {
    const s = stateAfter([hover('a'), TIMER, UNHOVER, focus('a')]);
    expect(s).toMatchObject({ phase: 'open', id: 'a', source: 'hover', focused: 'a' });
  });

  it('blur while nothing shows only forgets the focus', () => {
    expect(stateAfter([hover('a'), BLUR])).toMatchObject({ phase: 'opening', id: 'a', focused: null });
  });
});

describe('reduceTooltip — tap', () => {
  it('toggles the tapped bar’s tooltip at once', () => {
    const [open, shut] = run([tap('a'), tap('a')]);
    expect(open.state).toMatchObject({ phase: 'open', id: 'a', source: 'tap' });
    expect(open.timer).toBeNull();
    expect(shut.state).toMatchObject({ phase: 'closed', id: null });
  });

  it('tapping another bar switches', () => {
    expect(stateAfter([tap('a'), tap('b')])).toMatchObject({ phase: 'open', id: 'b', source: 'tap' });
  });

  it('a tapped tooltip stays when the pointer leaves or the tooltip is left', () => {
    const s = stateAfter([tap('a')]);
    expect(reduceTooltip(s, UNHOVER, AUTO).state).toMatchObject({ phase: 'open', id: 'a' });
    expect(reduceTooltip(s, LEAVE, AUTO).state).toMatchObject({ phase: 'open', id: 'a' });
  });

  it('tap only counts with the auto trigger', () => {
    expect(stateAfter([tap('a')], HOVER).phase).toBe('closed');
    expect(stateAfter([tap('a')], FOCUS).phase).toBe('closed');
  });
});

describe('reduceTooltip — dismiss (Esc, drag start)', () => {
  it('closes at once from open and from closing', () => {
    for (const events of [[hover('a'), TIMER], [hover('a'), TIMER, UNHOVER], [focus('a')], [tap('a')]]) {
      const before = stateAfter(events);
      expect(tooltipVisibleId(before)).toBe('a');
      const t = reduceTooltip(before, DISMISS, AUTO);
      expect(t.state).toMatchObject({ phase: 'closed', id: null, dismissed: 'a' });
      expect(t.timer).toBeNull();
    }
  });

  it('cancels a pending opening, which never showed (Esc then goes on to clear the selection, D24)', () => {
    const opening = stateAfter([hover('a')]);
    expect(tooltipVisibleId(opening)).toBeNull();
    const s = reduceTooltip(opening, DISMISS, AUTO).state;
    expect(s).toMatchObject({ phase: 'closed', dismissed: 'a' });
    expect(reduceTooltip(s, TIMER, AUTO).state).toBe(s);
  });

  it('does nothing when closed', () => {
    const s = initialTooltipState();
    expect(reduceTooltip(s, DISMISS, AUTO).state).toBe(s);
  });

  it('the hovered bar does not reopen it until the pointer has left it', () => {
    const dismissed = stateAfter([hover('a'), TIMER, DISMISS]);
    const again = reduceTooltip(dismissed, hover('a'), AUTO);
    expect(again.state.phase).toBe('closed');
    expect(again.timer).toBeNull();
    const back = last([UNHOVER, hover('a')], AUTO, dismissed);
    expect(back.state).toMatchObject({ phase: 'opening', id: 'a', dismissed: null });
    expect(back.timer).toBe(320);
  });

  it('another bar opens normally', () => {
    const t = last([hover('a'), TIMER, DISMISS, hover('b')]);
    expect(t.state).toMatchObject({ phase: 'opening', id: 'b', dismissed: null });
  });

  it('the focused bar does not reopen it until focus has left it', () => {
    const dismissed = stateAfter([focus('a'), DISMISS]);
    expect(reduceTooltip(dismissed, focus('a'), AUTO).state.phase).toBe('closed');
    expect(stateAfter([BLUR, focus('a')], AUTO, dismissed)).toMatchObject({ phase: 'open', id: 'a' });
    expect(stateAfter([focus('b')], AUTO, dismissed)).toMatchObject({ phase: 'open', id: 'b' });
  });

  it('a tap reopens it', () => {
    expect(stateAfter([tap('a'), DISMISS, tap('a')])).toMatchObject({ phase: 'open', id: 'a', source: 'tap' });
  });
});

describe('reduceTooltip — triggers', () => {
  it("'hover' ignores focus and blur", () => {
    const s = initialTooltipState();
    expect(reduceTooltip(s, focus('a'), HOVER).state).toBe(s);
    const open = stateAfter([hover('a'), TIMER], HOVER);
    expect(reduceTooltip(open, BLUR, HOVER).state).toBe(open);
    expect(reduceTooltip(open, focus('b'), HOVER).state).toBe(open);
  });

  it("'focus' ignores hover and unhover", () => {
    const s = initialTooltipState();
    const t = reduceTooltip(s, hover('a'), FOCUS);
    expect(t.state).toBe(s);
    expect(t.timer).toBeNull();
    const open = stateAfter([focus('a')], FOCUS);
    expect(reduceTooltip(open, UNHOVER, FOCUS).state).toBe(open);
    expect(reduceTooltip(open, hover('b'), FOCUS).state).toBe(open);
    expect(stateAfter([BLUR], FOCUS, open).phase).toBe('closed');
  });

  it("'focus': resting on the tooltip does not keep it open after blur", () => {
    const s = stateAfter([focus('a'), ENTER, BLUR], FOCUS);
    expect(s.phase).toBe('closed');
  });

  it("'auto' listens to all three", () => {
    expect(stateAfter([hover('a'), TIMER]).phase).toBe('open');
    expect(stateAfter([focus('a')]).phase).toBe('open');
    expect(stateAfter([tap('a')]).phase).toBe('open');
  });
});

describe('reduceTooltip — delays', () => {
  it('showDelay 0 opens on hover at once', () => {
    const t = last([hover('a')], { ...AUTO, showDelay: 0 });
    expect(t.state).toMatchObject({ phase: 'open', id: 'a', source: 'hover' });
    expect(t.timer).toBeNull();
  });

  it('hideDelay 0 closes on unhover at once', () => {
    const t = last([hover('a'), TIMER, UNHOVER], { ...AUTO, hideDelay: 0 });
    expect(t.state.phase).toBe('closed');
    expect(t.timer).toBeNull();
  });

  it('negative or non-finite delays mean "at once"', () => {
    for (const bad of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stateAfter([hover('a')], { ...AUTO, showDelay: bad }).phase).toBe('open');
      expect(stateAfter([hover('a'), UNHOVER], { ...AUTO, showDelay: bad, hideDelay: bad }).phase).toBe('closed');
    }
  });

  it('custom delays are passed through as the timer', () => {
    const opts = { ...AUTO, showDelay: 500, hideDelay: 40 };
    const [h, , u] = run([hover('a'), TIMER, UNHOVER], opts);
    expect(h.timer).toBe(500);
    expect(u.timer).toBe(40);
  });
});

/** What a binding does: one timer, (re)started when `timer` is a number, `timer` sent when it runs out. */
function driver(options: TooltipMachineOptions) {
  let state = initialTooltipState();
  let handle: ReturnType<typeof setTimeout> | undefined;
  const shown: (string | null)[] = [];
  const send = (event: TooltipEvent): void => {
    const t = reduceTooltip(state, event, options);
    if (t.timer !== null) {
      clearTimeout(handle);
      handle = setTimeout(() => send({ type: 'timer' }), t.timer);
    } else if (t.state.phase === 'open' || t.state.phase === 'closed') {
      clearTimeout(handle);
      handle = undefined;
    }
    const before = tooltipVisibleId(state);
    state = t.state;
    const after = tooltipVisibleId(state);
    if (after !== before) shown.push(after);
  };
  return {
    send,
    shown,
    get state() {
      return state;
    },
  };
}

describe('reduceTooltip — driven like a binding (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens 320 ms after the pointer stops moving, closes 120 ms after it leaves', () => {
    const d = driver(AUTO);
    d.send(hover('a'));
    vi.advanceTimersByTime(200);
    d.send(hover('a')); // still moving: the delay restarts
    vi.advanceTimersByTime(300);
    expect(d.shown).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(d.shown).toEqual(['a']);
    d.send(UNHOVER);
    vi.advanceTimersByTime(60);
    d.send(UNHOVER); // keeps the first deadline
    vi.advanceTimersByTime(60);
    expect(d.shown).toEqual(['a', null]);
  });

  it('the pointer crosses to the tooltip within the hide delay and rests there', () => {
    const d = driver(AUTO);
    d.send(hover('a'));
    vi.advanceTimersByTime(320);
    d.send(UNHOVER);
    vi.advanceTimersByTime(80);
    d.send(ENTER);
    vi.advanceTimersByTime(5000);
    expect(d.state.phase).toBe('open');
    d.send(LEAVE);
    vi.advanceTimersByTime(119);
    expect(d.state.phase).toBe('closing');
    vi.advanceTimersByTime(1);
    expect(d.shown).toEqual(['a', null]);
  });

  it('focus shows at once; Esc closes it and the pending timers do nothing', () => {
    const d = driver(AUTO);
    d.send(hover('b'));
    d.send(focus('a'));
    expect(d.shown).toEqual(['a']);
    d.send(DISMISS);
    vi.advanceTimersByTime(1000);
    expect(d.shown).toEqual(['a', null]);
    expect(d.state.phase).toBe('closed');
  });

  it('sweeping across bars once a tooltip shows follows the pointer without waiting', () => {
    const d = driver(AUTO);
    d.send(hover('a'));
    vi.advanceTimersByTime(320);
    d.send(hover('b'));
    d.send(hover('c'));
    expect(d.shown).toEqual(['a', 'b', 'c']);
  });
});
