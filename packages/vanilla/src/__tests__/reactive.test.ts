import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ReactiveCycleError,
  batch,
  computed,
  createFrameScheduler,
  createOwner,
  createRoot,
  effect,
  onCleanup,
  runWithOwner,
  signal,
  untracked,
} from '../reactive';

describe('signal', () => {
  it('reads, sets, updates and peeks', () => {
    const s = signal(1);
    expect(s()).toBe(1);
    s.set(2);
    expect(s.peek()).toBe(2);
    s.update(v => v + 3);
    expect(s()).toBe(5);
  });

  it('skips writes equal under Object.is by default', () => {
    const s = signal(NaN);
    const run = vi.fn(() => void s());
    effect(run);
    s.set(NaN);
    expect(run).toHaveBeenCalledTimes(1);
    s.set(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('honours a custom equals and equals: false', () => {
    const custom = signal({ id: 1 }, { equals: (a, b) => a.id === b.id });
    const always = signal(0, { equals: false });
    const runA = vi.fn(() => void custom());
    const runB = vi.fn(() => void always());
    effect(runA);
    effect(runB);
    custom.set({ id: 1 });
    always.set(0);
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledTimes(2);
    custom.set({ id: 2 });
    expect(runA).toHaveBeenCalledTimes(2);
  });
});

describe('computed', () => {
  it('is lazy: never runs until read, then caches', () => {
    const s = signal(1);
    const fn = vi.fn(() => s() * 2);
    const c = computed(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(c()).toBe(2);
    expect(c()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c()).toBe(4);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('an unobserved computed revalidates by version when anything was written', () => {
    const s = signal(1);
    const other = signal(0);
    const fn = vi.fn(() => s() + 1);
    const c = computed(fn);
    expect(c()).toBe(2);
    other.set(1); // global version moves, s did not change
    expect(c()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('diamond: the join runs once per change and never sees a mixed state', () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => a() * 10);
    const seen: string[] = [];
    const d = vi.fn(() => `${b()}/${c()}`);
    const join = computed(d);
    effect(() => void seen.push(join()));
    expect(seen).toEqual(['2/10']);
    a.set(2);
    expect(seen).toEqual(['2/10', '3/20']);
    expect(d).toHaveBeenCalledTimes(2);
  });

  it('a node depending on a signal both through a computed and directly runs once', () => {
    const a = signal(1);
    const b = computed(() => a() * 2);
    const fn = vi.fn(() => b() + a()); // b first: a's observers are [b, c], so c goes CHECK then DIRTY
    const c = computed(fn);
    const seen: number[] = [];
    effect(() => void seen.push(c()));
    a.set(2);
    expect(seen).toEqual([3, 6]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('diamond pulled without an effect also runs the join once', () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => a() + 2);
    const fn = vi.fn(() => b() + c());
    const d = computed(fn);
    expect(d()).toBe(5);
    a.set(5);
    expect(d()).toBe(13);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('an equals cut-off stops downstream work', () => {
    const s = signal(1);
    const parity = computed(() => s() % 2);
    const downstream = vi.fn(() => parity() * 100);
    const d = computed(downstream);
    const run = vi.fn(() => void d());
    effect(run);
    s.set(3); // parity unchanged
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    s.set(4);
    expect(downstream).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a custom equals on a computed cuts off structurally equal results', () => {
    const s = signal(1);
    const c = computed(() => ({ big: s() > 5 }), { equals: (x, y) => x.big === y.big });
    const run = vi.fn(() => void c());
    effect(run);
    s.set(2);
    expect(run).toHaveBeenCalledTimes(1);
    s.set(9);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('peek reads without tracking', () => {
    const s = signal(1);
    const c = computed(() => s() + 1);
    const run = vi.fn(() => void c.peek());
    effect(run);
    s.set(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(c.peek()).toBe(3);
  });

  it('drops dependencies that a re-run no longer reads', () => {
    const flag = signal(true);
    const a = signal(1);
    const b = signal(2);
    const fn = vi.fn(() => (flag() ? a() : b()));
    const c = computed(fn);
    const run = vi.fn(() => void c());
    effect(run);
    flag.set(false);
    expect(run).toHaveBeenCalledTimes(2);
    a.set(10); // no longer a dependency
    expect(fn).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(2);
    b.set(20);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('caches errors, rethrows them on read and recovers', () => {
    const s = signal(0);
    const c = computed(() => {
      if (s() === 0) throw new Error('zero');
      return s();
    });
    expect(() => c()).toThrow('zero');
    expect(() => c()).toThrow('zero');
    const seen: unknown[] = [];
    const dispose = effect(() => {
      try {
        seen.push(c());
      } catch (err) {
        seen.push((err as Error).message);
      }
    });
    s.set(1);
    s.set(0);
    expect(seen).toEqual(['zero', 1, 'zero']);
    dispose();
  });

  it('detects a computed that reads itself', () => {
    const c: () => number = computed(() => c() + 1);
    expect(() => c()).toThrow(ReactiveCycleError);
  });

  it('detects an indirect cycle', () => {
    const a: () => number = computed(() => b() + 1);
    const b: () => number = computed(() => a() + 1);
    expect(() => a()).toThrow(ReactiveCycleError);
  });

  it('reading the same source twice records it once (and nested duplicates are harmless)', () => {
    const s = signal(1);
    const inner = computed(() => s() + 1);
    const run = vi.fn(() => {
      s();
      s();
      inner(); // runs inner, which also reads s
      s();
    });
    const dispose = effect(run);
    s.set(2);
    expect(run).toHaveBeenCalledTimes(2);
    dispose();
    s.set(3);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('effect', () => {
  it('runs immediately and on every relevant change', () => {
    const s = signal(1);
    const values: number[] = [];
    effect(() => void values.push(s()));
    s.set(2);
    s.set(3);
    expect(values).toEqual([1, 2, 3]);
  });

  it('dispose stops it, is idempotent, and runs its cleanups', () => {
    const s = signal(1);
    const cleanup = vi.fn();
    const run = vi.fn(() => {
      s();
      onCleanup(cleanup);
    });
    const dispose = effect(run);
    s.set(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    dispose();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
    s.set(3);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('disposes effects it created when it re-runs', () => {
    const outer = signal(0);
    const inner = signal(0);
    const innerRun = vi.fn(() => void inner());
    effect(() => {
      outer();
      effect(innerRun);
    });
    inner.set(1);
    expect(innerRun).toHaveBeenCalledTimes(2);
    outer.set(1); // old inner effect disposed, a new one created
    expect(innerRun).toHaveBeenCalledTimes(3);
    inner.set(2); // only the live inner effect runs
    expect(innerRun).toHaveBeenCalledTimes(4);
  });

  it('an effect writing a signal runs its dependents after it, not re-entrantly', () => {
    const src = signal(1);
    const derived = signal(0);
    const log: string[] = [];
    effect(() => {
      log.push(`read derived ${derived()}`);
    });
    effect(() => {
      log.push('writer start');
      derived.set(src() * 2);
      log.push('writer end');
    });
    expect(log).toEqual(['read derived 0', 'writer start', 'writer end', 'read derived 2']);
  });

  it('an effect writing what it reads re-runs until it settles', () => {
    const s = signal(0);
    const run = vi.fn(() => {
      if (s() < 3) s.set(s() + 1);
    });
    effect(run);
    expect(s()).toBe(3);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('reports effects that keep re-triggering each other', () => {
    const s = signal(0);
    expect(() =>
      effect(() => {
        s.set(s() + 1);
      }),
    ).toThrow(ReactiveCycleError);
    // The graph stays usable afterwards.
    const t = signal(1);
    const run = vi.fn(() => void t());
    effect(run);
    t.set(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('collects errors of a flush and rethrows the first after running the rest', () => {
    const s = signal(0);
    const after = vi.fn(() => void s());
    effect(() => {
      if (s() > 0) throw new Error('first');
    });
    effect(() => {
      if (s() > 0) throw new Error('second');
    });
    effect(after);
    expect(() => s.set(1)).toThrow('first');
    expect(after).toHaveBeenCalledTimes(2);
  });

  it('skips a run when every source settled back (CHECK without change)', () => {
    const s = signal(2);
    const sign = computed(() => Math.sign(s()));
    const run = vi.fn(() => void sign());
    effect(run);
    s.set(5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('with a scheduler: hands over a stable run function and ignores redundant calls', () => {
    const s = signal(1);
    const runs: (() => void)[] = [];
    const fn = vi.fn(() => void s());
    effect(fn, { scheduler: run => runs.push(run) });
    expect(fn).not.toHaveBeenCalled();
    expect(runs).toHaveLength(1);
    runs[0]();
    expect(fn).toHaveBeenCalledTimes(1);
    runs[0](); // clean: nothing to do
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(2);
    s.set(3); // already pending: not handed over twice
    expect(runs).toHaveLength(2);
    expect(runs[1]).toBe(runs[0]);
    runs[1]();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('a scheduled run of a disposed effect does nothing', () => {
    const s = signal(1);
    let pendingRun: (() => void) | undefined;
    const fn = vi.fn(() => void s());
    const dispose = effect(fn, { scheduler: run => (pendingRun = run) });
    dispose();
    pendingRun!();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('batch and untracked', () => {
  it('batch coalesces writes into one effect run and returns the result', () => {
    const a = signal(1);
    const b = signal(2);
    const run = vi.fn(() => void (a() + b()));
    effect(run);
    const result = batch(() => {
      a.set(10);
      batch(() => b.set(20));
      expect(run).toHaveBeenCalledTimes(1);
      return 'done';
    });
    expect(result).toBe('done');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('batch still flushes when its function throws', () => {
    const a = signal(1);
    const run = vi.fn(() => void a());
    effect(run);
    expect(() =>
      batch(() => {
        a.set(2);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('untracked reads do not subscribe', () => {
    const tracked = signal(1);
    const quiet = signal(1);
    const run = vi.fn(() => void (tracked() + untracked(() => quiet())));
    effect(run);
    quiet.set(2);
    expect(run).toHaveBeenCalledTimes(1);
    tracked.set(2);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('owners and disposal', () => {
  it('createRoot is never adopted by the current owner (an effect re-running does not dispose it)', () => {
    const s1 = signal(0);
    let root: ReturnType<typeof createRoot> | undefined;
    let runs = 0;
    const inner = signal(0);
    const stop = effect(() => {
      s1();
      root ??= createRoot();
    });
    runWithOwner(root!, () =>
      effect(() => {
        inner();
        runs++;
      }),
    );
    s1.set(1); // the outer effect re-runs: a child owner would be disposed here
    inner.set(1);
    expect(runs).toBe(2);
    root!.dispose();
    inner.set(2);
    expect(runs).toBe(2);
    stop();
  });

  it('disposing an owner disposes its effects, nested owners and cleanups (in reverse order)', () => {
    const s = signal(0);
    const order: string[] = [];
    const root = createOwner();
    const run = vi.fn(() => void s());
    runWithOwner(root, () => {
      effect(run);
      onCleanup(() => order.push('first'));
      onCleanup(() => order.push('second'));
      const child = createOwner();
      runWithOwner(child, () => onCleanup(() => order.push('child')));
      onCleanup(() => order.push('third')); // back on root after the nested runWithOwner
    });
    root.dispose();
    root.dispose();
    expect(root.disposed).toBe(true);
    expect(order).toEqual(['child', 'third', 'second', 'first']);
    s.set(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a child owner disposed on its own detaches from its parent', () => {
    const root = createOwner();
    const cleanup = vi.fn();
    const child = runWithOwner(root, () => createOwner());
    runWithOwner(child, () => onCleanup(cleanup));
    child.dispose();
    root.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('effects created under a disposed owner never run', () => {
    const root = createOwner();
    root.dispose();
    const fn = vi.fn();
    runWithOwner(root, () => effect(fn));
    expect(fn).not.toHaveBeenCalled();
  });

  it('onCleanup without an owner is a no-op', () => {
    expect(() => onCleanup(() => undefined)).not.toThrow();
  });

  it('runWithOwner does not track', () => {
    const s = signal(1);
    const root = createOwner();
    const run = vi.fn(() => {
      runWithOwner(root, () => s());
    });
    effect(run);
    s.set(2);
    expect(run).toHaveBeenCalledTimes(1);
    root.dispose();
  });

  it('no leaks after 10k create/dispose: a computed stops listening when its last observer goes', () => {
    const s = signal(0);
    const shared = computed(() => s() + 1);
    const fn = vi.fn(() => s() * 2);
    for (let i = 0; i < 10_000; i++) {
      const root = createOwner();
      runWithOwner(root, () => {
        const c = computed(fn);
        effect(() => void (c() + shared()));
      });
      root.dispose();
    }
    const calls = fn.mock.calls.length;
    expect(calls).toBe(10_000);
    // Nothing observes the graph any more: a write runs no computed at all.
    const sharedFn = vi.fn(() => s());
    const probe = computed(sharedFn);
    s.set(1);
    expect(fn).toHaveBeenCalledTimes(calls);
    expect(sharedFn).not.toHaveBeenCalled();
    expect(probe()).toBe(1);
    // And the signal is genuinely unsubscribed: a fresh effect is the only observer that runs.
    const run = vi.fn(() => void s());
    const dispose = effect(run);
    s.set(2);
    expect(run).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledTimes(calls);
    dispose();
  });

  it('10k disposed effects leave no subscription on their signal', () => {
    const s = signal(0);
    const created: (() => void)[] = [];
    let live = 0;
    for (let i = 0; i < 10_000; i++) {
      created.push(
        effect(() => {
          s();
          live++;
        }),
      );
    }
    for (const dispose of created) dispose();
    live = 0;
    s.set(1);
    expect(live).toBe(0);
  });
});

describe('createFrameScheduler', () => {
  afterEach(() => {
    delete (globalThis as { __GANTRY_PERF__?: unknown }).__GANTRY_PERF__;
    vi.restoreAllMocks();
  });

  function manualFrames() {
    const callbacks = new Map<number, () => void>();
    let next = 1;
    const raf = vi.fn((cb: () => void) => {
      callbacks.set(next, cb);
      return next++;
    });
    const caf = vi.fn((h: number) => void callbacks.delete(h));
    const tick = () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const cb of pending) cb();
    };
    return { raf, caf, tick, callbacks };
  }

  it('flushes in priority order, then creation order within a priority', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['config', 'header', 'bars'], ...frames });
    const log: string[] = [];
    const barsA = () => log.push('barsA');
    const barsB = () => log.push('barsB');
    const header = () => log.push('header');
    const config = () => log.push('config');
    // creation (first schedule) order: barsA, barsB
    sched.schedule(barsA, 'bars');
    sched.schedule(barsB, 'bars');
    frames.tick();
    log.length = 0;
    // re-scheduled in reverse: creation order still wins
    sched.schedule(barsB, 'bars');
    sched.schedule(header, 'header');
    sched.schedule(barsA, 'bars');
    sched.schedule(config, 'config');
    frames.tick();
    expect(log).toEqual(['config', 'header', 'barsA', 'barsB']);
  });

  it('requests a single frame per burst and runs a job once however often it is scheduled', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['a', 'b'], ...frames });
    const job = vi.fn();
    sched.schedule(job, 'a');
    sched.schedule(job, 'a');
    sched.schedule(vi.fn(), 'b');
    expect(frames.raf).toHaveBeenCalledTimes(1);
    frames.tick();
    expect(job).toHaveBeenCalledTimes(1);
    sched.schedule(job, 'a');
    expect(frames.raf).toHaveBeenCalledTimes(2);
  });

  it('flushSync runs everything now and cancels the pending frame', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['a'], ...frames });
    const job = vi.fn();
    sched.schedule(job, 'a');
    sched.flushSync();
    expect(job).toHaveBeenCalledTimes(1);
    expect(frames.caf).toHaveBeenCalledTimes(1);
    expect(frames.callbacks.size).toBe(0);
    sched.flushSync(); // nothing pending: no cancel
    expect(frames.caf).toHaveBeenCalledTimes(1);
  });

  it('a job scheduled during a flush runs in the same flush, first when its priority is higher', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['theme', 'header', 'bars', 'tooltip'], ...frames });
    const log: string[] = [];
    const header = () => log.push('header');
    const tooltip = () => log.push('tooltip');
    const barsLate = () => log.push('barsLate');
    const bars = () => {
      log.push('bars');
      sched.schedule(tooltip, 'tooltip');
      sched.schedule(header, 'header');
      sched.schedule(barsLate, 'bars');
    };
    sched.schedule(bars, 'bars');
    frames.tick();
    expect(log).toEqual(['bars', 'header', 'barsLate', 'tooltip']);
    expect(frames.raf).toHaveBeenCalledTimes(1);
  });

  it('flushSync inside a job is a no-op', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['a', 'b'], ...frames });
    const log: string[] = [];
    sched.schedule(() => {
      log.push('a');
      sched.schedule(() => log.push('b'), 'b');
      sched.flushSync();
      log.push('a end');
    }, 'a');
    sched.flushSync();
    expect(log).toEqual(['a', 'a end', 'b']);
  });

  it('drives reactive effects: one frame for many writes, effects in priority order', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['header', 'bars'], ...frames });
    const s = signal(1);
    const log: string[] = [];
    effect(() => void log.push(`bars ${s()}`), { scheduler: run => sched.schedule(run, 'bars') });
    effect(() => void log.push(`header ${s()}`), { scheduler: run => sched.schedule(run, 'header') });
    expect(log).toEqual([]);
    frames.tick();
    expect(log).toEqual(['header 1', 'bars 1']);
    s.set(2);
    s.set(3);
    expect(frames.raf).toHaveBeenCalledTimes(2);
    frames.tick();
    expect(log).toEqual(['header 1', 'bars 1', 'header 3', 'bars 3']);
  });

  it('rejects unknown priorities', () => {
    const sched = createFrameScheduler({ priorities: ['a'], ...manualFrames() });
    expect(() => sched.schedule(() => undefined, 'nope' as 'a')).toThrow('Unknown priority "nope"');
  });

  it('dispose cancels the frame, drops queued jobs and ignores later schedules', () => {
    const frames = manualFrames();
    const sched = createFrameScheduler({ priorities: ['a'], ...frames });
    const job = vi.fn();
    sched.schedule(job, 'a');
    sched.dispose();
    expect(frames.caf).toHaveBeenCalledTimes(1);
    sched.schedule(job, 'a');
    sched.flushSync();
    frames.tick();
    expect(job).not.toHaveBeenCalled();
    expect(frames.raf).toHaveBeenCalledTimes(1);
  });

  it('runs the remaining jobs when one throws, then rethrows the first error', () => {
    const sched = createFrameScheduler({ priorities: ['a'], ...manualFrames() });
    const after = vi.fn();
    sched.schedule(() => {
      throw new Error('first');
    }, 'a');
    sched.schedule(() => {
      throw new Error('second');
    }, 'a');
    sched.schedule(after, 'a');
    expect(() => sched.flushSync()).toThrow('first');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('reports a job that keeps re-scheduling itself and recovers', () => {
    const sched = createFrameScheduler({ priorities: ['a'], ...manualFrames() });
    const job = (): void => sched.schedule(job, 'a');
    sched.schedule(job, 'a');
    expect(() => sched.flushSync()).toThrow(ReactiveCycleError);
    const next = vi.fn();
    sched.schedule(next, 'a');
    sched.flushSync();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('writes the gantry:flush measure only when globalThis.__GANTRY_PERF__ is true', () => {
    const measure = vi.spyOn(performance, 'measure');
    const sched = createFrameScheduler({ priorities: ['a'], ...manualFrames() });
    sched.schedule(() => undefined, 'a');
    sched.flushSync();
    expect(measure).not.toHaveBeenCalled();
    (globalThis as { __GANTRY_PERF__?: unknown }).__GANTRY_PERF__ = true;
    sched.schedule(() => undefined, 'a');
    sched.flushSync();
    expect(measure).toHaveBeenCalledTimes(1);
    expect(measure.mock.calls[0][0]).toBe('gantry:flush');
  });

  it('defaults to requestAnimationFrame / cancelAnimationFrame', () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 42);
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const sched = createFrameScheduler({ priorities: ['a'] });
    const job = vi.fn();
    sched.schedule(job, 'a');
    expect(raf).toHaveBeenCalledTimes(1);
    sched.flushSync();
    expect(caf).toHaveBeenCalledWith(42);
    expect(job).toHaveBeenCalledTimes(1);
  });
});
