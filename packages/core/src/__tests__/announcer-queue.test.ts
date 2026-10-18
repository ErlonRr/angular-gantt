// ─────────────────────────────────────────────────────────────
//  Tests — interaction/announce.ts → createAnnouncer (debounced
//  live region, fake timers)
// ─────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ANNOUNCE_DEBOUNCE, REPEAT_MARK, createAnnouncer, type AnnouncerTimers } from '../interaction/announce';

const timers: AnnouncerTimers<ReturnType<typeof setTimeout>> = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: h => clearTimeout(h),
};

describe('createAnnouncer', () => {
  let written: string[];
  const write = (text: string) => written.push(text);

  beforeEach(() => {
    vi.useFakeTimers();
    written = [];
  });
  afterEach(() => vi.useRealTimers());

  it('debounces by 250 ms (trailing) and the last message wins', () => {
    expect(ANNOUNCE_DEBOUNCE).toBe(250);
    const a = createAnnouncer(write, timers);
    a.say('1 task selected');
    vi.advanceTimersByTime(100);
    a.say('2 tasks selected');
    vi.advanceTimersByTime(200);
    a.say('3 tasks selected');
    vi.advanceTimersByTime(249);
    expect(written).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(written).toEqual(['3 tasks selected']);
    vi.advanceTimersByTime(1000);
    expect(written).toEqual(['3 tasks selected']);
  });

  it('marks a repeated sentence with a no-break space, alternating', () => {
    expect(REPEAT_MARK).toBe(' ');
    const a = createAnnouncer(write, timers);
    for (let i = 0; i < 3; i++) {
      a.say('Zoom: Week');
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    }
    expect(written).toEqual(['Zoom: Week', 'Zoom: Week ', 'Zoom: Week']);
    a.say('Zoom: Month');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    a.say('Zoom: Week');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(written.slice(3)).toEqual(['Zoom: Month', 'Zoom: Week']);
  });

  it('now() writes at once and drops a pending say()', () => {
    const a = createAnnouncer(write, timers);
    a.say('Backend moved 1 day later');
    a.now('Backend moved 2 days later');
    expect(written).toEqual(['Backend moved 2 days later']);
    vi.advanceTimersByTime(1000);
    expect(written).toEqual(['Backend moved 2 days later']);
    a.now('Backend moved 2 days later');
    expect(written.at(-1)).toBe('Backend moved 2 days later ');
  });

  it('cancel() drops a pending say() and is safe to call twice', () => {
    const a = createAnnouncer(write, timers);
    a.say('Selection cleared');
    a.cancel();
    a.cancel();
    vi.advanceTimersByTime(1000);
    expect(written).toEqual([]);
    a.say('1 task selected');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(written).toEqual(['1 task selected']);
  });

  it('uses the given timers and delay; a delay of 0 writes at once', () => {
    const set = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms));
    const clear = vi.fn((h: ReturnType<typeof setTimeout>) => clearTimeout(h));
    const a = createAnnouncer(write, { set, clear }, 500);
    a.say('a');
    a.say('b');
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[0]?.[1]).toBe(500);
    expect(clear).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(499);
    expect(written).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(written).toEqual(['b']);

    const immediate = createAnnouncer(write, { set, clear }, 0);
    immediate.say('c');
    expect(written).toEqual(['b', 'c']);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('a timer that fires after being cleared writes nothing (forgiving fakes)', () => {
    const queue: (() => void)[] = [];
    const leaky: AnnouncerTimers<number> = { set: fn => queue.push(fn), clear: () => undefined };
    const a = createAnnouncer(write, leaky);
    a.say('old');
    a.say('new');
    for (const fn of queue) fn();
    expect(written).toEqual(['new']);
  });

  it('empty text is written as-is (clears the region) and never marked', () => {
    const a = createAnnouncer(write, timers, 0);
    a.say('');
    a.say('');
    expect(written).toEqual(['', '']);
  });
});
