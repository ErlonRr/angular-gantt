// ─────────────────────────────────────────────────────────────
//  Tests — sync groups (`createGanttSyncGroup`) and the scroll echo
//  guard (`createEchoGuard`)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  createEchoGuard,
  createGanttSyncGroup,
  SYNC_ECHO_TOLERANCE,
  type GanttSyncGroup,
  type GanttSyncHandle,
  type GanttSyncMember,
  type GanttSyncOptions,
  type GanttSyncState,
} from '../state/sync';

type Patch = Partial<GanttSyncState>;

/** A member that records every patch it receives. */
interface Probe extends GanttSyncMember {
  readonly got: Patch[];
  /** Patches after the join snapshot */
  readonly since: () => Patch[];
}

function probe(onUpdate?: (patch: Patch) => void): Probe {
  const got: Patch[] = [];
  return {
    got,
    since: () => got.slice(1),
    update(patch) {
      got.push(patch);
      onUpdate?.(patch);
    },
  };
}

const range = (s: [number, number, number], e: [number, number, number]) => ({
  start: new Date(s[0], s[1], s[2]),
  end: new Date(e[0], e[1], e[2]),
});

const EMPTY: GanttSyncState = { range: null, extent: null, level: null, scrollLeft: null, panelWidth: null };

function setup(n: number, options?: GanttSyncOptions) {
  const group = createGanttSyncGroup(options);
  const members = Array.from({ length: n }, () => probe());
  const handles = members.map(m => group.join(m));
  return { group, members, handles };
}

describe('createGanttSyncGroup — options and state', () => {
  it('synchronises everything by default and starts empty', () => {
    const group = createGanttSyncGroup();
    expect(group.options).toEqual({ zoom: true, scroll: true, range: true, panel: true });
    expect(Object.isFrozen(group.options)).toBe(true);
    expect(group.state).toEqual(EMPTY);
    expect(group.size).toBe(0);
  });

  it('turns each part off on its own', () => {
    expect(createGanttSyncGroup({ panel: false }).options).toEqual({
      zoom: true,
      scroll: true,
      range: true,
      panel: false,
    });
    expect(createGanttSyncGroup({ zoom: false, scroll: false, range: false }).options).toEqual({
      zoom: false,
      scroll: false,
      range: false,
      panel: true,
    });
  });

  it('exposes the state as a frozen snapshot replaced on change', () => {
    const { group, handles } = setup(1);
    const before = group.state;
    expect(Object.isFrozen(before)).toBe(true);
    handles[0].report({ level: 'week' });
    expect(group.state).not.toBe(before);
    expect(before.level).toBeNull();
    expect(group.state.level).toBe('week');
    expect(Object.isFrozen(group.state)).toBe(true);
  });
});

describe('createGanttSyncGroup — join and leave', () => {
  it('sends the whole current state to a new member before join returns', () => {
    const group = createGanttSyncGroup();
    const first = probe();
    const joined: { handle?: GanttSyncHandle } = {};
    const late = probe(() => expect(joined.handle).toBeUndefined());
    group.join(first).report({ range: range([2026, 0, 5], [2026, 2, 2]), level: 'month', scrollLeft: 120 });
    group.join(probe()).report({ panelWidth: 280 });
    joined.handle = group.join(late);
    expect(late.got).toEqual([
      {
        range: range([2026, 0, 5], [2026, 2, 2]),
        extent: null,
        level: 'month',
        scrollLeft: 120,
        panelWidth: 280,
      },
    ]);
    expect(group.size).toBe(3);
    // A fresh group sends the empty state
    const solo = probe();
    createGanttSyncGroup().join(solo);
    expect(solo.got).toEqual([EMPTY]);
  });

  it('joining twice with the same member returns its handle and sends nothing (idempotent)', () => {
    const group = createGanttSyncGroup();
    const m = probe();
    const h1 = group.join(m);
    const h2 = group.join(m);
    expect(h2).toBe(h1);
    expect(group.size).toBe(1);
    expect(m.got).toHaveLength(1);
  });

  it('leaving is idempotent; a left member reports nothing and receives nothing', () => {
    const { group, members, handles } = setup(2);
    handles[1].leave();
    handles[1].leave();
    expect(group.size).toBe(1);
    handles[1].report({ level: 'day', range: range([2026, 0, 1], [2026, 5, 1]) });
    expect(group.state).toEqual(EMPTY);
    expect(members[0].since()).toEqual([]);
    handles[0].report({ level: 'week' });
    expect(members[1].since()).toEqual([]);
  });

  it('supports leave then join again (React StrictMode)', () => {
    const group = createGanttSyncGroup();
    const m = probe();
    const h1 = group.join(m);
    h1.report({ range: range([2026, 0, 5], [2026, 1, 2]), level: 'week' });
    h1.leave();
    expect(group.size).toBe(0);
    expect(group.state.range).toBeNull();
    const h2 = group.join(m);
    expect(h2).not.toBe(h1);
    expect(group.size).toBe(1);
    // Last-writer-wins values outlive their writer; the unions do not
    expect(m.got.at(-1)).toEqual({ ...EMPTY, level: 'week' });
  });
});

describe('createGanttSyncGroup — range and extent unions', () => {
  it('unions the members’ ranges and extents and sends the union to every member, the reporter too', () => {
    const { group, members, handles } = setup(2);
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) });
    expect(group.state.range).toEqual(range([2026, 0, 5], [2026, 2, 2]));
    expect(members[0].since()).toEqual([
      { range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) },
    ]);
    expect(members[1].since()).toEqual(members[0].since());

    handles[1].report({ range: range([2026, 1, 2], [2026, 5, 1]), extent: range([2026, 1, 9], [2026, 4, 29]) });
    const union = { range: range([2026, 0, 5], [2026, 5, 1]), extent: range([2026, 0, 12], [2026, 4, 29]) };
    expect(group.state).toMatchObject(union);
    expect(members[0].since().at(-1)).toEqual(union);
    expect(members[1].since().at(-1)).toEqual(union);
  });

  it('sends nothing when a report does not change the union', () => {
    const { members, handles } = setup(2);
    handles[0].report({ range: range([2026, 0, 5], [2026, 5, 1]) });
    const count = members[1].got.length;
    handles[1].report({ range: range([2026, 1, 2], [2026, 2, 2]) }); // inside
    handles[0].report({ range: range([2026, 0, 5], [2026, 5, 1]) }); // the same again
    expect(members[1].got).toHaveLength(count);
    expect(members[0].got).toHaveLength(count);
  });

  it('sends only the union field that changed', () => {
    const { members, handles } = setup(1);
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) });
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 27]) });
    expect(members[0].got.at(-1)).toEqual({ extent: range([2026, 0, 12], [2026, 1, 27]) });
  });

  it('shrinks the union when a member leaves, and empties it with the last one', () => {
    const { group, members, handles } = setup(3);
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) });
    handles[1].report({ range: range([2026, 1, 2], [2026, 7, 3]), extent: range([2026, 1, 9], [2026, 6, 31]) });
    expect(group.state.range).toEqual(range([2026, 0, 5], [2026, 7, 3]));

    handles[1].leave();
    expect(group.state.range).toEqual(range([2026, 0, 5], [2026, 2, 2]));
    expect(group.state.extent).toEqual(range([2026, 0, 12], [2026, 1, 20]));
    const shrunk = { range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) };
    expect(members[0].got.at(-1)).toEqual(shrunk);
    expect(members[2].got.at(-1)).toEqual(shrunk);

    // A member without a range leaving changes nothing
    const before = members[0].got.length;
    handles[2].leave();
    expect(members[0].got).toHaveLength(before);

    handles[0].leave();
    expect(group.state.range).toBeNull();
    expect(group.state.extent).toBeNull();
  });

  it('takes null back out of the union, and ignores undefined', () => {
    const { group, handles } = setup(2);
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) });
    handles[1].report({ range: range([2026, 1, 2], [2026, 7, 3]), extent: range([2026, 1, 9], [2026, 6, 31]) });
    handles[1].report({ extent: null });
    expect(group.state.range).toEqual(range([2026, 0, 5], [2026, 7, 3]));
    expect(group.state.extent).toEqual(range([2026, 0, 12], [2026, 1, 20]));
    handles[1].report({ range: undefined, extent: undefined, level: 'day' });
    expect(group.state.range).toEqual(range([2026, 0, 5], [2026, 7, 3]));
  });

  it('copies reported dates and ignores invalid ones', () => {
    const { group, handles } = setup(1);
    const r = range([2026, 0, 5], [2026, 2, 2]);
    handles[0].report({ range: r });
    r.start.setFullYear(2020);
    expect(group.state.range).toEqual(range([2026, 0, 5], [2026, 2, 2]));
    handles[0].report({ range: { start: new Date(Number.NaN), end: new Date(2026, 3, 1) } });
    expect(group.state.range).toBeNull();
  });

  it('keeps no union with range: false', () => {
    const { group, members, handles } = setup(2, { range: false });
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), extent: range([2026, 0, 12], [2026, 1, 20]) });
    expect(group.state.range).toBeNull();
    expect(group.state.extent).toBeNull();
    expect(members[1].since()).toEqual([]);
  });
});

describe('createGanttSyncGroup — level, scroll and panel width (last writer wins)', () => {
  it('sends each to every member except the reporter', () => {
    const { group, members, handles } = setup(3);
    handles[1].report({ level: 'month', scrollLeft: 340, panelWidth: 300 });
    expect(group.state).toMatchObject({ level: 'month', scrollLeft: 340, panelWidth: 300 });
    expect(members[1].since()).toEqual([]);
    expect(members[0].since()).toEqual([{ level: 'month', scrollLeft: 340, panelWidth: 300 }]);
    expect(members[2].since()).toEqual([{ level: 'month', scrollLeft: 340, panelWidth: 300 }]);

    handles[2].report({ scrollLeft: 10 });
    expect(group.state.scrollLeft).toBe(10);
    expect(members[0].since().at(-1)).toEqual({ scrollLeft: 10 });
    expect(members[1].since().at(-1)).toEqual({ scrollLeft: 10 });
    // Its own report does not come back to it
    expect(members[2].since()).toEqual([{ level: 'month', scrollLeft: 340, panelWidth: 300 }]);
  });

  it('does not loop: reporting the value just received sends nothing', () => {
    const group = createGanttSyncGroup();
    const handles: GanttSyncHandle[] = [];
    // Each member re-reports what it applies (as a careless binding might)
    const echoing = (i: number) =>
      probe(p => {
        if (p.level != null || p.scrollLeft != null || p.panelWidth != null) {
          handles[i]?.report({
            ...(p.level != null && { level: p.level }),
            ...(p.scrollLeft != null && { scrollLeft: p.scrollLeft }),
            ...(p.panelWidth != null && { panelWidth: p.panelWidth }),
          });
        }
      });
    const members = [echoing(0), echoing(1), echoing(2)];
    for (const m of members) handles.push(group.join(m));
    handles[0].report({ level: 'day', scrollLeft: 50, panelWidth: 240 });
    expect(members[1].since()).toEqual([{ level: 'day', scrollLeft: 50, panelWidth: 240 }]);
    expect(members[2].since()).toEqual([{ level: 'day', scrollLeft: 50, panelWidth: 240 }]);
    expect(members[0].since()).toEqual([]);
  });

  it('sends one patch per member for a report with several parts', () => {
    const { members, handles } = setup(2);
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), level: 'week', scrollLeft: 0 });
    expect(members[0].since()).toEqual([{ range: range([2026, 0, 5], [2026, 2, 2]) }]);
    expect(members[1].since()).toEqual([{ range: range([2026, 0, 5], [2026, 2, 2]), level: 'week', scrollLeft: 0 }]);
  });

  it('ignores parts that are turned off', () => {
    const { group, members, handles } = setup(2, { zoom: false, scroll: false, panel: false });
    handles[0].report({ level: 'week', scrollLeft: 100, panelWidth: 300 });
    expect(group.state).toEqual(EMPTY);
    expect(members[1].since()).toEqual([]);
    group.setLevel('day');
    group.scrollTo(40);
    expect(group.state).toEqual(EMPTY);
    expect(members[1].since()).toEqual([]);
  });

  it('ignores non-finite or negative offsets and widths', () => {
    const { group, members, handles } = setup(2);
    handles[0].report({ scrollLeft: Number.NaN, panelWidth: -4 });
    handles[0].report({ scrollLeft: Number.POSITIVE_INFINITY, panelWidth: Number.NaN });
    group.scrollTo(Number.NaN);
    expect(group.state).toEqual(EMPTY);
    expect(members[1].since()).toEqual([]);
  });
});

describe('createGanttSyncGroup — setLevel and scrollTo', () => {
  it('set the state and send it to every member', () => {
    const { group, members } = setup(2);
    group.setLevel('quarter');
    group.scrollTo(512);
    expect(group.state).toMatchObject({ level: 'quarter', scrollLeft: 512 });
    for (const m of members) expect(m.since()).toEqual([{ level: 'quarter' }, { scrollLeft: 512 }]);
  });

  it('send again even when the value is already shared (an explicit command)', () => {
    const { group, members } = setup(1);
    group.scrollTo(30);
    group.scrollTo(30);
    expect(members[0].since()).toEqual([{ scrollLeft: 30 }, { scrollLeft: 30 }]);
  });
});

describe('createGanttSyncGroup — delivery order', () => {
  it('queues a report made inside update after the current delivery', () => {
    const group = createGanttSyncGroup();
    const handles: GanttSyncHandle[] = [];
    const a = probe();
    // b can't be wider than 250 px: it applies the clamp and reports it from inside update
    const b = probe(p => {
      if (p.panelWidth != null && p.panelWidth > 250) handles[1]?.report({ panelWidth: 250 });
    });
    const c = probe();
    handles.push(group.join(a), group.join(b), group.join(c));
    handles[0].report({ panelWidth: 300 });
    // c first gets 300 (the current delivery), then 250: never the reverse
    expect(c.since()).toEqual([{ panelWidth: 300 }, { panelWidth: 250 }]);
    expect(a.since()).toEqual([{ panelWidth: 250 }]);
    expect(b.since()).toEqual([{ panelWidth: 300 }]);
    expect(group.state.panelWidth).toBe(250);
  });

  it('drops queued patches of a member that left meanwhile', () => {
    const group = createGanttSyncGroup();
    const handles: GanttSyncHandle[] = [];
    const a = probe(p => {
      if (p.level === 'week') handles[2]?.leave();
    });
    const b = probe();
    const c = probe();
    handles.push(group.join(a), group.join(b), group.join(c));
    group.setLevel('week');
    expect(b.since()).toEqual([{ level: 'week' }]);
    expect(c.since()).toEqual([]);
    expect(group.size).toBe(2);
  });

  it('delivers to every member even when one throws, then rethrows the first error', () => {
    const group = createGanttSyncGroup();
    const ok = probe();
    group.join(probe());
    const bad: GanttSyncMember = {
      update(p) {
        if (p.level) throw new Error('boom');
      },
    };
    group.join(bad);
    group.join(ok);
    expect(() => group.setLevel('day')).toThrow('boom');
    expect(ok.since()).toEqual([{ level: 'day' }]);
    // The group still works
    group.scrollTo(5);
    expect(ok.since().at(-1)).toEqual({ scrollLeft: 5 });
  });

  it('gives every member its own patch object', () => {
    const { members, handles } = setup(3);
    handles[0].report({ range: range([2026, 0, 5], [2026, 2, 2]), level: 'week' });
    const [p0, p1, p2] = members.map(m => m.got.at(-1));
    expect(p0).not.toBe(p1);
    expect(p1).not.toBe(p2);
  });
});

describe('createGanttSyncGroup — a mini binding', () => {
  /** A chart that applies level and scroll from the group, and reports its own changes. */
  class Chart implements GanttSyncMember {
    level = 'day';
    scroll = 0;
    readonly guard = createEchoGuard();
    readonly handle: GanttSyncHandle;
    readonly maxScroll: number;
    constructor(group: GanttSyncGroup, maxScroll = 1000) {
      this.maxScroll = maxScroll;
      this.handle = group.join(this);
    }
    update(p: Partial<GanttSyncState>) {
      if (p.level != null) this.level = p.level; // applied from the group: not reported
      if (p.scrollLeft != null) {
        const from = this.scroll;
        this.scroll = Math.min(p.scrollLeft, this.maxScroll); // the browser clamps
        this.guard.expect(this.scroll, from);
        if (this.scroll !== from) this.onScrollEvent(this.scroll);
      }
    }
    /** The viewport's scroll handler */
    onScrollEvent(x: number) {
      this.scroll = x;
      if (!this.guard.isEcho(x)) this.handle.report({ scrollLeft: x });
    }
    zoom(level: string) {
      this.level = level;
      this.handle.report({ level });
    }
  }

  it('keeps narrower charts clamped without pushing their clamp back', () => {
    const group = createGanttSyncGroup();
    const wide = new Chart(group, 1000);
    const narrow = new Chart(group, 600);
    wide.onScrollEvent(800);
    expect(narrow.scroll).toBe(600);
    expect(wide.scroll).toBe(800);
    expect(group.state.scrollLeft).toBe(800);
    narrow.onScrollEvent(200);
    expect(wide.scroll).toBe(200);
    wide.zoom('week');
    expect(narrow.level).toBe('week');
  });
});

describe('createEchoGuard', () => {
  it('recognises the expected offset once, within 1 px', () => {
    const guard = createEchoGuard();
    guard.expect(300);
    expect(guard.isEcho(300.5)).toBe(true);
    expect(guard.isEcho(300)).toBe(false); // consumed
    guard.expect(300);
    expect(guard.isEcho(299.01)).toBe(true);
    expect(SYNC_ECHO_TOLERANCE).toBe(1);
  });

  it('treats an offset 1 px or more away as a user scroll (and drops the expectation)', () => {
    const guard = createEchoGuard();
    guard.expect(300);
    expect(guard.isEcho(301)).toBe(false);
    expect(guard.isEcho(300)).toBe(false);
  });

  it('expects nothing before any expect, or when the write did not move', () => {
    const guard = createEchoGuard();
    expect(guard.isEcho(0)).toBe(false);
    guard.expect(120, 120.4); // no movement: no event will come
    expect(guard.isEcho(120)).toBe(false);
    guard.expect(120, 80);
    expect(guard.isEcho(120)).toBe(true);
  });

  it('a later expect replaces the earlier one; a non-finite one clears it', () => {
    const guard = createEchoGuard();
    guard.expect(100);
    guard.expect(200);
    expect(guard.isEcho(100)).toBe(false);
    guard.expect(100);
    guard.expect(Number.NaN);
    expect(guard.isEcho(100)).toBe(false);
    expect(guard.isEcho(Number.NaN)).toBe(false);
  });
});
