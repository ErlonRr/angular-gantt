// ─────────────────────────────────────────────────────────────
//  Tests — editing/validate.ts (Phase 11 step 2.3, D10): each built-in
//  rejection code, cycles through existing links, parent ↔ descendant
//  links with `parentChild` off and on, the read-only locks, the custom
//  `editing.validate` hook, `linkError` / `wouldCreateCycle`, and the
//  10 000-task budget (< 60 ms: generous for loaded CI; still catches a quadratic walk).
//  Changes are built by hand (the field patches and their ops), so the
//  tests don't depend on editing/changes.ts.
//  (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../render/config';
import { linkError, validateChange, wouldCreateCycle } from '../editing/validate';
import {
  DEFAULT_LABELS,
  type DependencyType,
  type GanttChange,
  type GanttChangeOp,
  type GanttDependency,
  type GanttEditingOptions,
  type GanttLabels,
  type GanttOptions,
  type GanttTask,
  type GanttTaskUpdate,
} from '../types';

const d = (day: number, month = 0) => new Date(2026, month, day);

const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id.toUpperCase()}`,
  start: d(5),
  end: d(10),
  ...extra,
});

/** `tasks` with each update's `after` applied (`undefined` deletes the field); untouched tasks kept. */
function propose(tasks: readonly GanttTask[], updates: readonly GanttTaskUpdate[]): GanttTask[] {
  return tasks.map(t => {
    const mine = updates.filter(u => u.taskId === t.id);
    if (!mine.length) return t;
    const next: Record<string, unknown> = { ...t };
    for (const u of mine)
      for (const [k, v] of Object.entries(u.after)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
    return next as unknown as GanttTask;
  });
}

/** An update of `id`'s fields, `before` read from `tasks`. */
function update(tasks: readonly GanttTask[], id: string, after: Partial<GanttTask>): GanttTaskUpdate {
  const t = tasks.find(x => x.id === id) as Record<string, unknown> | undefined;
  const before: Record<string, unknown> = {};
  for (const k of Object.keys(after)) before[k] = t?.[k];
  return { taskId: id, before, after };
}

const linkOp = (fromId: string, toId: string, type: DependencyType = 'FS', lag = 0, op: 'link' | 'unlink' = 'link') =>
  ({ op, event: { fromId, toId, type, lag } }) as GanttChangeOp;

/** The change `toId` gains a dependency on `fromId` (written as `linkChange` writes it: an object array). */
function addLink(tasks: readonly GanttTask[], fromId: string, toId: string, type: DependencyType = 'FS'): GanttChange {
  const succ = tasks.find(t => t.id === toId);
  const deps: GanttDependency[] = succ
    ? [...(Array.isArray(succ.dependency) ? succ.dependency : succ.dependency ? [succ.dependency] : [])].map(x =>
        typeof x === 'string' ? { taskId: x } : x,
      )
    : [];
  return {
    source: 'link',
    updates: succ ? [update(tasks, toId, { dependency: [...deps, { taskId: fromId, type, lag: 0 }] })] : [],
    ops: [linkOp(fromId, toId, type)],
  };
}

function check(
  tasks: readonly GanttTask[],
  change: GanttChange,
  options: GanttOptions = { editing: true },
  labels?: GanttLabels,
) {
  return validateChange(change, {
    tasks,
    proposed: propose(tasks, change.updates),
    config: resolveConfig(options),
    labels,
  });
}

const editing = (o: GanttEditingOptions): GanttOptions => ({ editing: o });

describe('validateChange: links', () => {
  // a → b → c (c depends on b, b on a); d alone
  const chain = [task('a'), task('b', { dependency: 'a' }), task('c', { dependency: [{ taskId: 'b' }] }), task('d')];

  it('accepts a new link between unrelated tasks', () => {
    expect(check(chain, addLink(chain, 'c', 'd'))).toBeNull();
    expect(check(chain, addLink(chain, 'd', 'a'))).toBeNull();
  });

  it('self-link: a task depending on itself', () => {
    expect(check(chain, addLink(chain, 'd', 'd'))).toEqual({
      code: 'self-link',
      message: DEFAULT_LABELS.errorSelfLink,
    });
  });

  it('duplicate-link: the same predecessor twice, of any type', () => {
    expect(check(chain, addLink(chain, 'a', 'b'))?.code).toBe('duplicate-link');
    expect(check(chain, addLink(chain, 'a', 'b', 'SS'))).toEqual({
      code: 'duplicate-link',
      message: DEFAULT_LABELS.errorDuplicateLink,
    });
    // A duplicate the data already held is not this change's fault
    const twice = [task('a'), task('b', { dependency: [{ taskId: 'a' }, { taskId: 'a', type: 'SS' }] }), task('e')];
    expect(check(twice, addLink(twice, 'e', 'b'))).toBeNull();
  });

  it('cycle: closing a loop through existing links, in either length', () => {
    // a → b → c, then c → a
    expect(check(chain, addLink(chain, 'c', 'a'))).toEqual({ code: 'cycle', message: DEFAULT_LABELS.errorCycle });
    // b → a: a two-task loop
    expect(check(chain, addLink(chain, 'b', 'a'))?.code).toBe('cycle');
    // A string, an object and an array dependency are all followed
    const mixed = [
      task('a'),
      task('b', { dependency: { taskId: 'a', type: 'SS' } }),
      task('c', { dependency: 'b' }),
      task('d', { dependency: [{ taskId: 'c' }, { taskId: 'x-unknown' }] }),
    ];
    expect(check(mixed, addLink(mixed, 'd', 'a'))?.code).toBe('cycle');
    // d's link to an unknown task was there before: not this change's to check
    expect(check(mixed, addLink(mixed, 'a', 'd'))).toBeNull();
  });

  it('cycle: two links added by one change that loop together', () => {
    const tasks = [task('a'), task('b')];
    const change: GanttChange = {
      source: 'cell',
      updates: [update(tasks, 'a', { dependency: 'b' }), update(tasks, 'b', { dependency: [{ taskId: 'a' }] })],
      ops: [linkOp('b', 'a'), linkOp('a', 'b')],
    };
    expect(check(tasks, change)?.code).toBe('cycle');
  });

  it('parent-child: rejected both ways with parentChild off, accepted with it on', () => {
    const tree = [task('p'), task('k', { parentId: 'p' }), task('g', { parentId: 'k' }), task('o')];
    const allow = editing({ dependencies: { parentChild: true } });
    for (const [from, to] of [
      ['p', 'k'],
      ['k', 'p'],
      ['p', 'g'], // a grandchild is a descendant too
      ['g', 'p'],
    ] as const) {
      expect(check(tree, addLink(tree, from, to))).toEqual({
        code: 'parent-child',
        message: DEFAULT_LABELS.errorParentChild,
      });
      expect(check(tree, addLink(tree, from, to), allow)).toBeNull();
    }
    // Siblings and cousins are not related
    expect(check(tree, addLink(tree, 'o', 'g'))).toBeNull();
    // Editing off resolves `parentChild: false` too (API links go through the same rules)
    expect(check(tree, addLink(tree, 'p', 'k'), {})?.code).toBe('parent-child');
  });

  it('a looping parentId chain does not hang the ancestor walk', () => {
    const loop = [task('x', { parentId: 'y' }), task('y', { parentId: 'x' }), task('z')];
    expect(check(loop, addLink(loop, 'z', 'x'))).toBeNull();
    expect(check(loop, addLink(loop, 'x', 'y'))?.code).toBe('parent-child');
  });

  it('editing an existing link (type, lag) is never rejected for the link itself', () => {
    // b already depends on a; the data even holds the parent-child link k → p
    const tasks = [
      task('a'),
      task('b', { dependency: 'a' }),
      task('p', { dependency: 'k' }),
      task('k', { parentId: 'p' }),
    ];
    const lag: GanttChange = {
      source: 'cell',
      updates: [update(tasks, 'b', { dependency: [{ taskId: 'a', type: 'SS', lag: 2 }] })],
      ops: [linkOp('a', 'b', 'FS', 0, 'unlink'), linkOp('a', 'b', 'SS', 2)],
    };
    expect(check(tasks, lag)).toBeNull();
    const kept: GanttChange = {
      source: 'cell',
      updates: [update(tasks, 'p', { dependency: [{ taskId: 'k', lag: 1 }] })],
      ops: [],
    };
    expect(check(tasks, kept)).toBeNull();
  });

  it('reads new links from the dependency field even when the change carries no op', () => {
    const tasks = [task('a'), task('b', { dependency: 'a' })];
    const change: GanttChange = { source: 'api', updates: [update(tasks, 'a', { dependency: 'b' })], ops: [] };
    expect(check(tasks, change)?.code).toBe('cycle');
  });
});

describe('validateChange: missing tasks', () => {
  const tasks = [task('a'), task('b', { dependency: [{ taskId: 'gone' }] })];

  it('an update of an unknown task', () => {
    const change: GanttChange = {
      source: 'drag',
      updates: [{ taskId: 'nope', before: { start: d(5) }, after: { start: d(6) } }],
      ops: [],
    };
    expect(check(tasks, change)).toEqual({ code: 'missing-task', message: DEFAULT_LABELS.errorUnknownTask('nope') });
  });

  it('a link whose successor or predecessor is unknown', () => {
    // `linkChange` with a missing successor: the op and no update
    expect(check(tasks, { source: 'api', updates: [], ops: [linkOp('a', 'zz')] })?.message).toBe(
      DEFAULT_LABELS.errorUnknownTask('zz'),
    );
    expect(check(tasks, addLink(tasks, 'zz', 'a'))).toEqual({
      code: 'missing-task',
      message: DEFAULT_LABELS.errorUnknownTask('zz'),
    });
    expect(check(tasks, { source: 'delete', updates: [], ops: [linkOp('a', 'zz', 'FS', 0, 'unlink')] })?.code).toBe(
      'missing-task',
    );
  });

  it('removing a link to a task that no longer exists is fine', () => {
    const change: GanttChange = {
      source: 'cell',
      updates: [update(tasks, 'b', { dependency: undefined })],
      ops: [linkOp('gone', 'b', 'FS', 0, 'unlink')],
    };
    expect(check(tasks, change)).toBeNull();
  });
});

describe('validateChange: dates and progress', () => {
  const tasks = [task('a'), task('m', { type: 'milestone', start: d(8), end: d(8) })];

  it('end-before-start: an end before the start', () => {
    const change: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { end: d(4) })], ops: [] };
    expect(check(tasks, change)).toEqual({ code: 'end-before-start', message: DEFAULT_LABELS.errorEndBeforeStart });
    const start: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { start: d(11) })], ops: [] };
    expect(check(tasks, start)?.code).toBe('end-before-start');
  });

  it('a zero-length task and an inclusive one-day task are fine', () => {
    const zero: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { end: d(5) })], ops: [] };
    expect(check(tasks, zero)).toBeNull();
    expect(check(tasks, zero, { editing: true, endDateMode: 'inclusive' })).toBeNull();
    expect(
      check(tasks, { source: 'drag', updates: [update(tasks, 'm', { start: d(9), end: d(9) })], ops: [] }),
    ).toBeNull();
  });

  it('reads date-only UTC values as local days, like the bars', () => {
    // 2026-01-07 as a UTC date-only value against local midnight of the same day: not before
    const utc = [task('u', { start: new Date(Date.UTC(2026, 0, 7)), end: new Date(Date.UTC(2026, 0, 9)) })];
    const sameDay: GanttChange = { source: 'cell', updates: [update(utc, 'u', { end: d(7) })], ops: [] };
    expect(check(utc, sameDay)).toBeNull();
    const dayBefore: GanttChange = { source: 'cell', updates: [update(utc, 'u', { end: d(6) })], ops: [] };
    expect(check(utc, dayBefore)?.code).toBe('end-before-start');
  });

  it('only checks the dates of updates that touch them', () => {
    const broken = [task('x', { start: d(10), end: d(2) })];
    const progress: GanttChange = { source: 'progress', updates: [update(broken, 'x', { progress: 40 })], ops: [] };
    expect(check(broken, progress)).toBeNull();
  });

  it('progress-range: outside 0–100 or not a number', () => {
    for (const bad of [-1, 101, Number.NaN, '50' as unknown as number]) {
      const change: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { progress: bad })], ops: [] };
      expect(check(tasks, change)).toEqual({ code: 'progress-range', message: DEFAULT_LABELS.errorRange(0, 100) });
    }
    for (const ok of [0, 37.5, 100, undefined]) {
      const change: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { progress: ok })], ops: [] };
      expect(check(tasks, change)).toBeNull();
    }
  });
});

describe('validateChange: read-only', () => {
  const RO = { code: 'read-only', message: DEFAULT_LABELS.errorReadOnly };

  it('a task with editable: false, whatever the field or the source', () => {
    const tasks = [task('a', { editable: false }), task('b')];
    for (const after of [{ start: d(6), end: d(11) }, { progress: 20 }, { name: 'Renamed' }]) {
      for (const source of ['drag', 'cell', 'api', 'undo'] as const)
        expect(check(tasks, { source, updates: [update(tasks, 'a', after)], ops: [] })).toEqual(RO);
    }
    // An update that changes nothing is not a change
    expect(check(tasks, { source: 'api', updates: [update(tasks, 'a', { start: d(5) })], ops: [] })).toBeNull();
  });

  it('a link or unlink touching a read-only task at either end', () => {
    const tasks = [task('a', { editable: false }), task('b'), task('c', { dependency: 'a' })];
    expect(check(tasks, addLink(tasks, 'a', 'b'))).toEqual(RO);
    expect(check(tasks, addLink(tasks, 'b', 'a'))).toEqual(RO);
    const unlink: GanttChange = {
      source: 'delete',
      updates: [update(tasks, 'c', { dependency: undefined })],
      ops: [linkOp('a', 'c', 'FS', 0, 'unlink')],
    };
    expect(check(tasks, unlink)).toEqual(RO);
  });

  it('the dates of a draggable: false task (its progress and name stay editable)', () => {
    const tasks = [task('a', { draggable: false })];
    expect(check(tasks, { source: 'cell', updates: [update(tasks, 'a', { start: d(6) })], ops: [] })).toEqual(RO);
    expect(check(tasks, { source: 'cell', updates: [update(tasks, 'a', { end: d(12) })], ops: [] })).toEqual(RO);
    expect(check(tasks, { source: 'cell', updates: [update(tasks, 'a', { progress: 50 })], ops: [] })).toBeNull();
    expect(check(tasks, { source: 'cell', updates: [update(tasks, 'a', { name: 'x' })], ops: [] })).toBeNull();
  });

  it("a rolled-up parent's derived fields, only while they are rolled up", () => {
    const tasks = [task('p'), task('k', { parentId: 'p' })];
    const dates: GanttChange = { source: 'drag', updates: [update(tasks, 'p', { start: d(6), end: d(11) })], ops: [] };
    const progress: GanttChange = { source: 'cell', updates: [update(tasks, 'p', { progress: 30 })], ops: [] };
    expect(check(tasks, dates, { editing: true, rollup: true })).toEqual(RO);
    expect(check(tasks, progress, { editing: true, rollup: true })).toEqual(RO);
    expect(check(tasks, dates, { editing: true, rollup: { dates: false } })).toBeNull();
    expect(check(tasks, progress, { editing: true, rollup: { progress: false } })).toBeNull();
    expect(check(tasks, dates)).toBeNull();
    // The child and the parent's name stay editable
    expect(
      check(tasks, { source: 'drag', updates: [update(tasks, 'k', { start: d(6) })], ops: [] }, { rollup: true }),
    ).toBeNull();
    expect(
      check(tasks, { source: 'cell', updates: [update(tasks, 'p', { name: 'P' })], ops: [] }, { rollup: true }),
    ).toBeNull();
  });

  it("a task's id", () => {
    const tasks = [task('a')];
    expect(check(tasks, { source: 'api', updates: [update(tasks, 'a', { id: 'b' })], ops: [] })).toEqual(RO);
  });
});

describe('validateChange: order, labels and editing.validate', () => {
  it('runs the built-in checks before the custom one, which sees the change and both task lists', () => {
    const tasks = [task('a'), task('b')];
    const seen: unknown[] = [];
    const options = editing({
      validate: (change, ctx) => {
        seen.push(change, ctx.tasks, ctx.proposed);
        return true;
      },
    });
    const change = addLink(tasks, 'b', 'b');
    expect(check(tasks, change, options)?.code).toBe('self-link');
    expect(seen).toEqual([]);
    const ok = addLink(tasks, 'a', 'b');
    const proposed = propose(tasks, ok.updates);
    expect(validateChange(ok, { tasks, proposed, config: resolveConfig(options) })).toBeNull();
    expect(seen).toEqual([ok, tasks, proposed]);
  });

  it('false rejects with errorRejected, a string with itself; true / null / undefined accept', () => {
    const tasks = [task('a')];
    const change: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { name: 'x' })], ops: [] };
    const run = (verdict: boolean | string | null | undefined) =>
      check(tasks, change, editing({ validate: () => verdict }));
    expect(run(false)).toEqual({ code: 'custom', message: DEFAULT_LABELS.errorRejected });
    expect(run('Locked by finance')).toEqual({ code: 'custom', message: 'Locked by finance' });
    expect(run('')).toEqual({ code: 'custom', message: DEFAULT_LABELS.errorRejected });
    expect(run(true)).toBeNull();
    expect(run(null)).toBeNull();
    expect(run(undefined)).toBeNull();
  });

  it('a missing task is reported before the link checks that need it', () => {
    const tasks = [task('a')];
    expect(check(tasks, addLink(tasks, 'a', 'zz'))?.code).toBe('missing-task');
  });

  it('the messages come from the labels passed', () => {
    const labels: GanttLabels = {
      ...DEFAULT_LABELS,
      errorCycle: 'Boucle',
      errorUnknownTask: ref => `Inconnue : ${ref}`,
      errorRange: (min, max) => `De ${min} à ${max}`,
    };
    const tasks = [task('a'), task('b', { dependency: 'a' })];
    expect(check(tasks, addLink(tasks, 'b', 'a'), { editing: true }, labels)?.message).toBe('Boucle');
    expect(check(tasks, addLink(tasks, 'q', 'a'), { editing: true }, labels)?.message).toBe('Inconnue : q');
    const bad: GanttChange = { source: 'cell', updates: [update(tasks, 'a', { progress: 200 })], ops: [] };
    expect(check(tasks, bad, { editing: true }, labels)?.message).toBe('De 0 à 100');
  });
});

describe('linkError', () => {
  const tasks = [
    task('a'),
    task('b', { dependency: [{ taskId: 'a', type: 'SS' }] }),
    task('c', { dependency: 'b' }),
    task('p'),
    task('k', { parentId: 'p' }),
    task('ro', { editable: false }),
  ];
  const opts = { parentChild: false };

  it('checks self, missing, duplicate, parent-child, cycle, read-only — in that order', () => {
    expect(linkError(tasks, 'a', 'a', opts)?.code).toBe('self-link');
    expect(linkError(tasks, 'zz', 'a', opts)).toEqual({
      code: 'missing-task',
      message: DEFAULT_LABELS.errorUnknownTask('zz'),
    });
    expect(linkError(tasks, 'a', 'zz', opts)?.message).toBe(DEFAULT_LABELS.errorUnknownTask('zz'));
    expect(linkError(tasks, 'a', 'b', opts)?.code).toBe('duplicate-link');
    expect(linkError(tasks, 'p', 'k', opts)?.code).toBe('parent-child');
    expect(linkError(tasks, 'k', 'p', opts)?.code).toBe('parent-child');
    expect(linkError(tasks, 'p', 'k', { parentChild: true })).toBeNull();
    expect(linkError(tasks, 'c', 'a', opts)?.code).toBe('cycle');
    expect(linkError(tasks, 'a', 'ro', opts)?.code).toBe('read-only');
    expect(linkError(tasks, 'ro', 'a', opts)?.code).toBe('read-only');
    expect(linkError(tasks, 'a', 'c', opts)).toBeNull();
  });

  it('with a type, only a link of that type is a duplicate', () => {
    expect(linkError(tasks, 'a', 'b', { parentChild: false, type: 'SS' })?.code).toBe('duplicate-link');
    expect(linkError(tasks, 'a', 'b', { parentChild: false, type: 'FS' })).toBeNull();
    // A string dependency is FS
    expect(linkError(tasks, 'b', 'c', { parentChild: false, type: 'FS' })?.code).toBe('duplicate-link');
  });

  it('uses the labels passed', () => {
    const labels: GanttLabels = { ...DEFAULT_LABELS, errorSelfLink: 'Non' };
    expect(linkError(tasks, 'a', 'a', { parentChild: false, labels })?.message).toBe('Non');
  });

  it('agrees with validateChange on the same link', () => {
    const config = resolveConfig({ editing: true });
    for (const from of ['a', 'b', 'c', 'p', 'k', 'ro'])
      for (const to of ['a', 'b', 'c', 'p', 'k', 'ro']) {
        const change = addLink(tasks, from, to);
        const viaChange = validateChange(change, { tasks, proposed: propose(tasks, change.updates), config });
        expect(viaChange, `${from} → ${to}`).toEqual(linkError(tasks, from, to, { parentChild: false }));
      }
  });
});

describe('wouldCreateCycle', () => {
  const tasks = [task('a'), task('b', { dependency: 'a' }), task('c', { dependency: [{ taskId: 'b' }] })];

  it('is true when the predecessor already depends on the successor', () => {
    expect(wouldCreateCycle(tasks, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'b', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'a', 'a')).toBe(true);
  });

  it('is false otherwise, and for unknown ids', () => {
    expect(wouldCreateCycle(tasks, 'a', 'c')).toBe(false);
    expect(wouldCreateCycle(tasks, 'zz', 'a')).toBe(false);
    expect(wouldCreateCycle(tasks, 'a', 'zz')).toBe(false);
  });

  it('terminates on data that already loops', () => {
    const loop = [task('x', { dependency: 'y' }), task('y', { dependency: 'x' }), task('z')];
    expect(wouldCreateCycle(loop, 'x', 'z')).toBe(false);
    expect(wouldCreateCycle(loop, 'x', 'y')).toBe(true);
  });
});

describe('10 000 tasks', () => {
  const N = 10_000;
  // One long chain t0 → t1 → … → t9999, the worst case for the walk (no recursion: no stack overflow)
  const chain: GanttTask[] = Array.from({ length: N }, (_, i) =>
    task(`t${i}`, i ? { dependency: [{ taskId: `t${i - 1}`, type: 'FS' }] } : {}),
  );
  const config = resolveConfig({ editing: true });

  /** The fastest of a few runs, in ms (the first warms the JIT up) */
  const time = (fn: () => void) => {
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      fn();
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };

  it('finds the loop across the whole chain within 60 ms (linear: a few ms idle)', () => {
    const closing = addLink(chain, `t${N - 1}`, 't0');
    const proposed = propose(chain, closing.updates);
    let result: ReturnType<typeof validateChange> = null;
    const ms = time(() => {
      result = validateChange(closing, { tasks: chain, proposed, config });
    });
    expect(result).toEqual({ code: 'cycle', message: DEFAULT_LABELS.errorCycle });
    expect(ms).toBeLessThan(60);
    expect(time(() => wouldCreateCycle(chain, `t${N - 1}`, 't0'))).toBeLessThan(60);
    expect(time(() => linkError(chain, `t${N - 1}`, 't0', { parentChild: false }))).toBeLessThan(60);
  });

  it('accepts a link that closes no loop within 60 ms (linear: a few ms idle)', () => {
    const forward = addLink(chain, 't0', `t${N - 1}`);
    const proposed = propose(chain, forward.updates);
    let result: ReturnType<typeof validateChange> = { code: 'custom', message: '' };
    const ms = time(() => {
      result = validateChange(forward, { tasks: chain, proposed, config });
    });
    expect(result).toBeNull();
    expect(ms).toBeLessThan(60);
  });
});
