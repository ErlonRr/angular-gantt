import { ReactiveCycleError } from './signal';

/** Upper bound of job runs in one flush before a re-scheduling loop is reported. */
const MAX_JOB_RUNS = 10_000;

export interface FrameSchedulerOptions<P extends string> {
  /** Flush order: every job of `priorities[0]` runs before any job of `priorities[1]`, and so on. */
  priorities: readonly P[];
  /** Defaults to `requestAnimationFrame` (read lazily, so the module stays SSR-safe). */
  raf?: ((callback: () => void) => number) | undefined;
  /** Defaults to `cancelAnimationFrame`. */
  caf?: ((handle: number) => void) | undefined;
}

export interface FrameScheduler<P extends string> {
  /**
   * Queues `job` for the next frame (once, however often it is scheduled). Within a priority,
   * jobs run in the order they were first scheduled (an effect schedules its first run when it
   * is created, so this is creation order). A job scheduled while flushing runs in the same
   * flush: at once if its priority is higher than the running one's, otherwise in its turn.
   */
  schedule(job: () => void, priority: P): void;
  /** Runs everything queued now, cancelling the pending frame. No-op while already flushing. */
  flushSync(): void;
  /** Cancels the pending frame and drops every queued job; later `schedule` calls are ignored. */
  dispose(): void;
}

interface Entry {
  job: () => void;
  seq: number;
}

/** `globalThis.__GANTRY_PERF__ = true` turns on the `gantry:flush` performance measure (no API surface). */
const perfEnabled = (): boolean => (globalThis as { __GANTRY_PERF__?: unknown }).__GANTRY_PERF__ === true;

export function createFrameScheduler<const P extends string>(options: FrameSchedulerOptions<P>): FrameScheduler<P> {
  const raf = options.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const caf = options.caf ?? ((h: number) => cancelAnimationFrame(h));
  const rank = new Map<string, number>(options.priorities.map((p, i) => [p, i]));
  const queues: Entry[][] = options.priorities.map(() => []);
  const queued = new Set<() => void>();
  const seqOf = new WeakMap<() => void, number>();
  let nextSeq = 0;
  let handle: number | null = null;
  let flushing = false;
  let disposed = false;

  function flush(): void {
    if (flushing || disposed) return;
    flushing = true;
    const perf = perfEnabled();
    const start = perf ? performance.now() : 0;
    let runs = 0;
    let error: unknown;
    let failed = false;
    try {
      for (;;) {
        const queue = queues.find(q => q.length > 0);
        if (!queue) break;
        if (++runs > MAX_JOB_RUNS) {
          clear();
          throw new ReactiveCycleError('jobs keep re-scheduling');
        }
        const { job } = queue.shift()!;
        queued.delete(job);
        try {
          job();
        } catch (err) {
          if (!failed) error = err;
          failed = true;
        }
      }
    } finally {
      flushing = false;
      if (perf) performance.measure('gantry:flush', { start, end: performance.now() });
    }
    if (failed) throw error;
  }

  function clear(): void {
    for (const q of queues) q.length = 0;
    queued.clear();
  }

  function cancelFrame(): void {
    if (handle === null) return;
    caf(handle);
    handle = null;
  }

  return {
    schedule(job, priority) {
      if (disposed) return;
      const index = rank.get(priority);
      if (index === undefined) throw new Error(`Unknown priority "${priority}"`);
      if (queued.has(job)) return;
      queued.add(job);
      let seq = seqOf.get(job);
      if (seq === undefined) seqOf.set(job, (seq = nextSeq++));
      const queue = queues[index]!;
      let at = queue.length;
      while (at > 0 && queue[at - 1]!.seq > seq) at--;
      queue.splice(at, 0, { job, seq });
      if (!flushing && handle === null)
        handle = raf(() => {
          handle = null;
          flush();
        });
    },
    flushSync() {
      cancelFrame();
      flush();
    },
    dispose() {
      disposed = true;
      cancelFrame();
      clear();
    },
  };
}
