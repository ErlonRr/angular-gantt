// ─────────────────────────────────────────────────────────────
//  gantry · interaction/scroll-sync.ts
//  Vertical scroll mirroring between the task-list panel and the
//  timeline viewport, shared by both bindings' scroll handlers.
//
//  Writing one pane's offset into the other makes the other pane fire
//  its own scroll event, one frame later. By then the first pane may
//  have scrolled again (keyboard moves at key-repeat speed scroll the
//  timeline synchronously in each keydown), and browsers dispatch the
//  queued events in order: the mirrored pane's echo comes first and,
//  mirrored back, would undo the newer scroll. So the mirror remembers
//  the offset it wrote into each pane and ignores the event that only
//  reports it.
// ─────────────────────────────────────────────────────────────

/** The two vertically mirrored panes. */
export type ScrollPane = 'timeline' | 'panel';

export interface ScrollMirror {
  /**
   * `pane` fired a scroll event. Reads both panes' offsets with `read` and, unless they agree or
   * the event is the echo of this mirror's own write into `pane`, writes `pane`'s offset into the
   * other pane with `write` (reading it back, as the browser may clamp it).
   */
  scrolled(pane: ScrollPane, read: (pane: ScrollPane) => number, write: (pane: ScrollPane, top: number) => void): void;
}

/** The other pane of the pair. */
const otherPane = (pane: ScrollPane): ScrollPane => (pane === 'timeline' ? 'panel' : 'timeline');

/**
 * A scroll mirror for one chart (one per connection: it holds the pending echo of each pane).
 *
 * A write whose offset the browser clamped (the other pane can't scroll that far) records no
 * echo: its event is then mirrored back, so both panes end at the same offset. Offsets the browser
 * only snapped to its pixel grid (less than 1 px off) count as written.
 */
export function createScrollMirror(): ScrollMirror {
  const echo: Record<ScrollPane, number | null> = { timeline: null, panel: null };
  return {
    scrolled(pane, read, write) {
      const top = read(pane);
      const expected = echo[pane];
      echo[pane] = null;
      // Our own write coming back: the other pane is already where it should be (or newer)
      if (expected !== null && top === expected) return;
      const other = otherPane(pane);
      const before = read(other);
      if (before === top) return;
      write(other, top);
      const after = read(other);
      // No move, no event. A clamped offset (not just snapped to the pixel grid) is mirrored back
      // when its event arrives
      echo[other] = after !== before && Math.abs(after - top) < 1 ? after : null;
    },
  };
}
