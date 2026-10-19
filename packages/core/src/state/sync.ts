// ─────────────────────────────────────────────────────────────
//  gantry · state/sync.ts
//  Synchronised charts: a group shares the timeline range, the zoom
//  level, the horizontal scroll and the panel width between the charts
//  that join it (the `syncGroup` property / input of every binding).
//  No timers, no DOM: members report what changed locally and apply
//  the patches the group sends them.
//
//  - Range and extent are unions over the members' natural ranges
//    (`timelineRange`), sent to every member whenever the union changes:
//    a member that leaves takes its range out of the union.
//  - Level, scroll and panel width are last-writer-wins, sent to every
//    member except the one that reported them.
//  - Patches are delivered in order: a member that reports from inside
//    `update` has its report queued after the current delivery.
// ─────────────────────────────────────────────────────────────

/** What a group synchronises (each defaults to true). */
export interface GanttSyncOptions {
  /** Zoom level */
  zoom?: boolean | undefined;
  /** Horizontal scroll */
  scroll?: boolean | undefined;
  /** Timeline range (the union of the members' ranges) */
  range?: boolean | undefined;
  /** Task-list panel width */
  panel?: boolean | undefined;
}

/** A date range of the timeline. */
export interface GanttSyncRange {
  start: Date;
  end: Date;
}

/** The shared state of a group. */
export interface GanttSyncState {
  /** Union of the members' natural (padded, snapped) ranges */
  range: GanttSyncRange | null;
  /** Union of the members' task extents */
  extent: GanttSyncRange | null;
  /** Last zoom level set */
  level: string | null;
  /** Last horizontal scroll offset */
  scrollLeft: number | null;
  /** Last panel width in px */
  panelWidth: number | null;
}

/**
 * A chart in a group. `update` receives the changes of the shared state: first the whole state
 * when the member joins (before `join` returns; `null` = the group has no value yet), then only
 * the fields that changed. A field set to `null` means "nothing shared": use the chart's own value.
 */
export interface GanttSyncMember {
  update(patch: Partial<GanttSyncState>): void;
}

/**
 * What a member reports (only the fields that changed locally). `range` / `extent` are the
 * chart's natural ones (`timelineRange`, `TimelineModel.range` / `.extent`), never the shared
 * timeline it draws.
 */
export interface GanttSyncReport {
  range?: GanttSyncRange | null | undefined;
  extent?: GanttSyncRange | null | undefined;
  level?: string | undefined;
  scrollLeft?: number | undefined;
  panelWidth?: number | undefined;
}

/** A member's link to its group. */
export interface GanttSyncHandle {
  /** Reports local changes; ignored after `leave()` */
  report(patch: GanttSyncReport): void;
  /** Leaves the group (idempotent); its range and extent leave the unions */
  leave(): void;
}

/** `GanttSyncOptions` with every field set. */
export interface ResolvedSyncOptions {
  readonly zoom: boolean;
  readonly scroll: boolean;
  readonly range: boolean;
  readonly panel: boolean;
}

export interface GanttSyncGroup {
  readonly options: ResolvedSyncOptions;
  /** The current shared state (a frozen snapshot, replaced on every change) */
  readonly state: Readonly<GanttSyncState>;
  /** Number of members */
  readonly size: number;
  /**
   * Adds a member; it receives the current state at once. Joining again with the same member
   * returns its existing handle and sends nothing.
   */
  join(member: GanttSyncMember): GanttSyncHandle;
  /** Sets the zoom level of every member (ignored with `zoom: false`) */
  setLevel(level: string): void;
  /** Scrolls every member to `x` (ignored with `scroll: false` or a non-finite `x`) */
  scrollTo(x: number): void;
}

type Patch = Partial<GanttSyncState>;

interface Entry {
  readonly member: GanttSyncMember;
  readonly handle: GanttSyncHandle;
  range: GanttSyncRange | null;
  extent: GanttSyncRange | null;
  joined: boolean;
}

/** A frozen copy of `r` when both its dates are valid, else `null`. */
function cleanRange(r: GanttSyncRange | null | undefined): GanttSyncRange | null {
  if (!r) return null;
  const start = r.start.getTime();
  const end = r.end.getTime();
  return Number.isFinite(start) && Number.isFinite(end)
    ? Object.freeze({ start: new Date(start), end: new Date(end) })
    : null;
}

/** Union of ranges (earliest start, latest end), or `null` when there is none. */
function union(ranges: readonly (GanttSyncRange | null)[]): GanttSyncRange | null {
  let start: Date | null = null;
  let end: Date | null = null;
  for (const r of ranges) {
    if (!r) continue;
    if (!start || r.start < start) start = r.start;
    if (!end || r.end > end) end = r.end;
  }
  return start && end ? Object.freeze({ start, end }) : null;
}

const sameRange = (a: GanttSyncRange | null, b: GanttSyncRange | null) =>
  a === b || (!!a && !!b && a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime());

const isEmpty = (p: Patch) => Object.keys(p).length === 0;

/**
 * A sync group for charts that share one timeline. Pass it to each chart's `syncGroup`
 * property / input; each part can be turned off (`{ panel: false }`…).
 *
 * Range and extent are unions over the members (sent to every member when they change, so
 * leaving shrinks them); level, scroll and panel width are last-writer-wins, sent to every member
 * but the one that reported them. A report equal to the shared value sends nothing, so a member
 * that reports a value it just received from the group causes no loop. Patches are delivered in
 * order, also when a member reports from inside `update`; a member whose `update` throws does not
 * stop the delivery to the others (the first error is rethrown afterwards).
 */
export function createGanttSyncGroup(o: GanttSyncOptions = {}): GanttSyncGroup {
  const options: ResolvedSyncOptions = Object.freeze({
    zoom: o.zoom ?? true,
    scroll: o.scroll ?? true,
    range: o.range ?? true,
    panel: o.panel ?? true,
  });
  let state: Readonly<GanttSyncState> = Object.freeze({
    range: null,
    extent: null,
    level: null,
    scrollLeft: null,
    panelWidth: null,
  });
  const entries: Entry[] = [];
  const queue: [Entry, Patch][] = [];
  let flushing = false;

  const commit = (patch: Patch) => {
    if (!isEmpty(patch)) state = Object.freeze({ ...state, ...patch });
  };

  /** Delivers the queued patches in order; re-entrant calls only queue. */
  const flush = () => {
    if (flushing) return;
    flushing = true;
    let failed = false;
    let error: unknown;
    try {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [entry, patch] = next;
        if (!entry.joined) continue;
        try {
          entry.member.update(patch);
        } catch (e) {
          if (!failed) {
            failed = true;
            error = e;
          }
        }
      }
    } finally {
      flushing = false;
    }
    if (failed) throw error;
  };

  /** `common` goes to every member, `others` to every member but `reporter`. */
  const publish = (common: Patch, others: Patch, reporter: Entry | null) => {
    if (isEmpty(common) && isEmpty(others)) return;
    for (const e of entries) {
      const patch = e === reporter ? { ...common } : { ...common, ...others };
      if (!isEmpty(patch)) queue.push([e, patch]);
    }
    flush();
  };

  /** The union fields that changed since the last commit. */
  const unionPatch = (): Patch => {
    if (!options.range) return {};
    const patch: Patch = {};
    const range = union(entries.map(e => e.range));
    const extent = union(entries.map(e => e.extent));
    if (!sameRange(range, state.range)) patch.range = range;
    if (!sameRange(extent, state.extent)) patch.extent = extent;
    return patch;
  };

  const createEntry = (member: GanttSyncMember): Entry => {
    const entry: Entry = {
      member,
      range: null,
      extent: null,
      joined: true,
      handle: {
        report(p) {
          if (!entry.joined) return;
          let rangeChanged = false;
          if (options.range && p.range !== undefined) {
            const range = cleanRange(p.range);
            if (!sameRange(range, entry.range)) {
              entry.range = range;
              rangeChanged = true;
            }
          }
          if (options.range && p.extent !== undefined) {
            const extent = cleanRange(p.extent);
            if (!sameRange(extent, entry.extent)) {
              entry.extent = extent;
              rangeChanged = true;
            }
          }
          const common = rangeChanged ? unionPatch() : {};
          const others: Patch = {};
          if (options.zoom && typeof p.level === 'string' && p.level !== state.level) others.level = p.level;
          if (options.scroll && isOffset(p.scrollLeft) && p.scrollLeft !== state.scrollLeft) {
            others.scrollLeft = p.scrollLeft;
          }
          if (options.panel && isOffset(p.panelWidth) && p.panelWidth !== state.panelWidth) {
            others.panelWidth = p.panelWidth;
          }
          commit({ ...common, ...others });
          publish(common, others, entry);
        },
        leave() {
          if (!entry.joined) return;
          entry.joined = false;
          entries.splice(entries.indexOf(entry), 1);
          const common = unionPatch();
          commit(common);
          publish(common, {}, null);
        },
      },
    };
    return entry;
  };

  return {
    options,
    get state() {
      return state;
    },
    get size() {
      return entries.length;
    },
    join(member) {
      const existing = entries.find(e => e.member === member);
      if (existing) return existing.handle;
      const entry = createEntry(member);
      entries.push(entry);
      queue.push([entry, { ...state }]);
      flush();
      return entry.handle;
    },
    setLevel(level) {
      if (!options.zoom || typeof level !== 'string') return;
      commit({ level });
      publish({ level }, {}, null);
    },
    scrollTo(x) {
      if (!options.scroll || !Number.isFinite(x)) return;
      commit({ scrollLeft: x });
      publish({ scrollLeft: x }, {}, null);
    },
  };
}

/** A finite, non-negative offset or width. */
const isOffset = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// ─── Echo guard ───────────────────────────────────────────────

/**
 * Below this distance (px) a scroll event counts as the echo of a programmatic scroll: browsers
 * snap offsets to their device-pixel grid.
 */
export const SYNC_ECHO_TOLERANCE = 1;

/** Recognises the scroll event a programmatic scroll causes (within 1 px), once. */
export interface EchoGuard {
  /**
   * A programmatic scroll to `x` just happened (pass the offset read back from the element, as
   * the browser may clamp it). With `from` (the offset before the write) and no movement, no
   * event will come, so nothing is expected.
   */
  expect(x: number, from?: number): void;
  /** Whether a scroll to `x` is the expected echo (consumes the expectation either way) */
  isEcho(x: number): boolean;
}

/**
 * An echo guard for one scroll container (one per member): a sync member applies the group's
 * `scrollLeft`, calls `expect` with the resulting offset, and skips reporting the scroll event
 * for which `isEcho` returns true — so applying a shared scroll is never reported back.
 */
export function createEchoGuard(): EchoGuard {
  let expected: number | null = null;
  return {
    expect(x, from) {
      const moved = from === undefined || !(Math.abs(x - from) < SYNC_ECHO_TOLERANCE);
      expected = Number.isFinite(x) && moved ? x : null;
    },
    isEcho(x) {
      if (expected === null) return false;
      const echo = Math.abs(x - expected) < SYNC_ECHO_TOLERANCE;
      expected = null;
      return echo;
    },
  };
}
