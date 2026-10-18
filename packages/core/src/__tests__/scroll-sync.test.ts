// ─────────────────────────────────────────────────────────────
//  Tests — interaction/scroll-sync.ts (vertical scroll mirroring of the
//  task-list panel and the timeline), with a model of two panes whose
//  scroll events are queued and dispatched in order, as browsers do.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { createScrollMirror, type ScrollPane } from '../interaction/scroll-sync';

/** Two panes: offsets clamped to `max`, a write that moves a pane queues its scroll event. */
function panes(max: Record<ScrollPane, number> = { timeline: 1000, panel: 1000 }) {
  const top: Record<ScrollPane, number> = { timeline: 0, panel: 0 };
  const queue: ScrollPane[] = [];
  const mirror = createScrollMirror();
  const read = (p: ScrollPane) => top[p];
  const scroll = (p: ScrollPane, value: number) => {
    const next = Math.max(0, Math.min(max[p], value));
    if (next === top[p]) return;
    top[p] = next;
    if (!queue.includes(p)) queue.push(p);
  };
  return {
    top,
    queue,
    /** A user / keyboard scroll of `p` */
    scroll,
    /** One frame: the queued scroll events, in order (writes made meanwhile queue for the next frame) */
    frame() {
      const events = queue.splice(0);
      for (const p of events) mirror.scrolled(p, read, scroll);
    },
    /** Frames until no event is queued */
    settle() {
      for (let i = 0; i < 10 && queue.length; i++) this.frame();
      expect(queue).toEqual([]);
    },
  };
}

describe('createScrollMirror', () => {
  it('mirrors a scroll of either pane into the other', () => {
    const p = panes();
    p.scroll('timeline', 300);
    p.settle();
    expect(p.top).toEqual({ timeline: 300, panel: 300 });
    p.scroll('panel', 120);
    p.settle();
    expect(p.top).toEqual({ timeline: 120, panel: 120 });
  });

  it('a newer scroll is not undone by the echo of the previous mirror write (key-repeat speed)', () => {
    const p = panes({ timeline: 3000, panel: 3000 });
    p.scroll('timeline', 1951);
    p.frame(); // the timeline's event: the panel follows, its echo queued
    expect(p.top.panel).toBe(1951);
    p.scroll('timeline', 1915); // the next key, before the echo arrives
    expect(p.queue).toEqual(['panel', 'timeline']);
    p.frame(); // the echo first (ignored), then the timeline's new offset
    expect(p.top).toEqual({ timeline: 1915, panel: 1915 });
    p.settle();
    expect(p.top).toEqual({ timeline: 1915, panel: 1915 });
  });

  it('the same race the other way: task-list moves are not undone by the timeline’s echo', () => {
    const p = panes();
    p.scroll('panel', 400);
    p.frame();
    p.scroll('panel', 436);
    p.frame();
    p.settle();
    expect(p.top).toEqual({ timeline: 436, panel: 436 });
  });

  it('a pane scrolled again before its echo arrives is a new scroll', () => {
    const p = panes();
    p.scroll('timeline', 200);
    p.frame(); // panel = 200, echo pending
    p.scroll('panel', 260); // the user scrolls the panel itself: one coalesced event at 260
    p.settle();
    expect(p.top).toEqual({ timeline: 260, panel: 260 });
  });

  it('an offset clamped by the shorter pane is mirrored back: both panes end equal', () => {
    const p = panes({ timeline: 1000, panel: 900 });
    p.scroll('timeline', 950);
    p.settle();
    expect(p.top).toEqual({ timeline: 900, panel: 900 });
  });

  it('writes nothing when the panes agree', () => {
    const p = panes();
    p.scroll('timeline', 100);
    p.settle();
    let writes = 0;
    createScrollMirror().scrolled(
      'timeline',
      () => 100,
      () => writes++,
    );
    expect(writes).toBe(0);
  });

  it('an offset snapped to the pixel grid counts as written (its echo is ignored)', () => {
    const top: Record<ScrollPane, number> = { timeline: 0, panel: 0 };
    const mirror = createScrollMirror();
    const read = (p: ScrollPane) => top[p];
    const write = (p: ScrollPane, v: number) => (top[p] = Math.floor(v));
    top.timeline = 300.5;
    mirror.scrolled('timeline', read, write);
    expect(top.panel).toBe(300);
    top.timeline = 264.5; // the next key, before the panel's echo
    mirror.scrolled('panel', read, write); // the echo: ignored
    expect(top.timeline).toBe(264.5);
  });
});
