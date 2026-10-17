/**
 * Minimal push-dirty / pull-recompute reactive core for the `<gantry-element>` engine.
 *
 * - `signal` holds a value; writing it marks its live observers.
 * - `computed` is lazy: it only runs when read, and only when a source's version changed
 *   (CLEAN / CHECK / DIRTY colouring + per-node versions, so diamonds are glitch-free and
 *   an `equals` cut-off stops downstream work).
 * - A computed subscribes to its sources only while something live (an effect, or another
 *   live computed) observes it, so unobserved computeds are garbage-collectable.
 * - `effect` re-runs when a source changed; with a `scheduler` it hands its run to it
 *   (the frame scheduler) instead of running synchronously.
 * - Owners (`createOwner` / `runWithOwner` / `onCleanup`) form the dispose tree; every
 *   effect is itself an owner of what it creates while running.
 */

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;
type State = typeof CLEAN | typeof CHECK | typeof DIRTY;

/** Upper bound of synchronous effect runs in one flush before a write loop is reported. */
const MAX_EFFECT_RUNS = 100_000;

/** Thrown when a computed reads itself, or when effects keep re-triggering each other. */
export class ReactiveCycleError extends Error {
  override name = 'ReactiveCycleError';
}

export type EqualsFn<T> = (a: T, b: T) => boolean;

export interface SignalOptions<T> {
  /** Values considered equal do not notify observers. `false` notifies on every write. Default `Object.is`. */
  equals?: EqualsFn<T> | false | undefined;
}

export interface ReadonlySignal<T> {
  (): T;
  /** Reads without tracking. */
  peek(): T;
}

export interface WritableSignal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

export interface EffectOptions {
  /** Receives the effect's (stable) run function whenever the effect needs to run, the first time included. */
  scheduler?: ((run: () => void) => void) | undefined;
}

export interface Owner {
  readonly disposed: boolean;
  /** Disposes owned effects and owners, then runs cleanups (last registered first). Idempotent. */
  readonly dispose: () => void;
}

interface Disposable {
  readonly dispose: () => void;
}

interface OwnerNode extends Owner {
  disposed: boolean;
  parent: OwnerNode | null;
  owned: Set<Disposable> | null;
  cleanups: (() => void)[] | null;
}

interface Node {
  /** `undefined` for signals. */
  fn: (() => unknown) | undefined;
  value: unknown;
  equals: EqualsFn<unknown>;
  state: State;
  /** Bumped whenever `value` changes (or a computed caches a new error). */
  version: number;
  observers: Set<Node>;
  sources: Node[];
  sourceVersions: number[];
  /** `globalVersion` at the last refresh, for unobserved computeds. */
  seen: number;
  running: boolean;
  hasError: boolean;
  /** Run id of the last tracking context that recorded this node (dedupe). */
  trackedIn: number;
  /** Scratch mark used while diffing sources. */
  mark: number;
  /** Sources being recorded by the current run (with their versions), and that run's id. */
  nextSources: Node[];
  nextVersions: number[];
  runId: number;
  effect: EffectNode | null;
}

interface EffectNode extends OwnerNode {
  node: Node;
  run: () => void;
  scheduler: ((run: () => void) => void) | undefined;
}

let observer: Node | null = null;
let owner: OwnerNode | null = null;
let batchDepth = 0;
let globalVersion = 0;
let runCounter = 0;
let flushing = false;
const pending: EffectNode[] = [];

const notifyAll: EqualsFn<unknown> = () => false;

function toEquals<T>(opts: SignalOptions<T> | undefined): EqualsFn<unknown> {
  const eq = opts?.equals;
  if (eq === false) return notifyAll;
  return (eq ?? Object.is) as EqualsFn<unknown>;
}

function createNode(fn: (() => unknown) | undefined, value: unknown, equals: EqualsFn<unknown>): Node {
  return {
    fn,
    value,
    equals,
    state: fn ? DIRTY : CLEAN,
    version: 0,
    observers: new Set(),
    sources: [],
    sourceVersions: [],
    seen: -1,
    running: false,
    hasError: false,
    trackedIn: -1,
    mark: -1,
    nextSources: [],
    nextVersions: [],
    runId: -1,
    effect: null,
  };
}

function ownerFields(): Pick<OwnerNode, 'disposed' | 'parent' | 'owned' | 'cleanups'> {
  return { disposed: false, parent: null, owned: null, cleanups: null };
}

function isLive(node: Node): boolean {
  return node.effect !== null || node.observers.size > 0;
}

function link(source: Node, target: Node): void {
  if (source.observers.has(target)) return;
  source.observers.add(target);
  // A computed that just became observed starts listening to its own sources.
  if (source.observers.size === 1) for (const s of source.sources) link(s, source);
}

function unlink(source: Node, target: Node): void {
  if (!source.observers.delete(target)) return;
  // A computed nobody observes any more stops listening (it stays readable, lazily).
  if (source.observers.size === 0) for (const s of source.sources) unlink(s, source);
}

function mark(node: Node, state: State): void {
  if (node.state >= state) return;
  const wasClean = node.state === CLEAN;
  node.state = state;
  if (!wasClean) return;
  if (node.effect) pending.push(node.effect);
  else for (const o of node.observers) mark(o, CHECK);
}

function sourcesChanged(node: Node): boolean {
  for (let i = 0; i < node.sources.length; i++) {
    const s = node.sources[i]!;
    if (s.fn) refresh(s);
    if (s.version !== node.sourceVersions[i]) return true;
  }
  return false;
}

/** Brings a computed up to date (never throws: errors are cached and rethrown on read). */
function refresh(node: Node): void {
  if (node.state === CLEAN && (isLive(node) || node.seen === globalVersion)) return;
  if (node.state !== DIRTY && !sourcesChanged(node)) {
    node.state = CLEAN;
    node.seen = globalVersion;
    return;
  }
  const prev = node.value;
  const first = node.version === 0;
  let next: unknown;
  let failed = false;
  try {
    next = execute(node, null);
  } catch (err) {
    failed = true;
    next = err;
  }
  node.seen = globalVersion;
  if (failed || node.hasError || first || !node.equals(prev, next)) {
    node.value = next;
    node.hasError = failed;
    node.version++;
  }
}

/**
 * Runs `node.fn` while tracking what it reads, then commits the new source list. The run is a
 * batch: effects triggered by writes inside it run after it, never re-entrantly.
 */
function execute(node: Node, runOwner: OwnerNode | null): unknown {
  const prevObserver = observer;
  const prevOwner = owner;
  const sources: Node[] = (node.nextSources = []);
  const versions: number[] = (node.nextVersions = []);
  const id = (node.runId = ++runCounter);
  observer = node;
  owner = runOwner;
  node.running = true;
  node.state = CLEAN;
  batchDepth++;
  try {
    return node.fn!();
  } finally {
    node.running = false;
    observer = prevObserver;
    owner = prevOwner;
    commitSources(node, sources, versions, id);
    if (--batchDepth === 0) flushEffects();
  }
}

function commitSources(node: Node, sources: Node[], versions: number[], id: number): void {
  const old = node.sources;
  node.sources = sources;
  node.sourceVersions = versions;
  if (!isLive(node)) return;
  for (const s of sources) s.mark = id;
  for (const s of old) if (s.mark !== id) unlink(s, node);
  for (const s of sources) link(s, node);
  // A source written after this run read it (e.g. an effect writing what it reads) was not
  // linked yet when it notified: re-mark so the node does not settle on a stale read.
  for (let i = 0; i < sources.length; i++) {
    if (sources[i]!.version !== versions[i]) {
      mark(node, DIRTY);
      return;
    }
  }
}

function read(node: Node): unknown {
  if (node.running) throw new ReactiveCycleError('computed reads itself');
  if (node.fn) refresh(node);
  const obs = observer;
  if (obs && node.trackedIn !== obs.runId) {
    node.trackedIn = obs.runId;
    obs.nextSources.push(node);
    obs.nextVersions.push(node.version);
  }
  if (node.hasError) throw node.value;
  return node.value;
}

function write(node: Node, value: unknown): void {
  if (node.equals(node.value, value)) return;
  node.value = value;
  node.version++;
  globalVersion++;
  for (const o of node.observers) mark(o, DIRTY);
  if (batchDepth === 0) flushEffects();
}

function flushEffects(): void {
  if (flushing) return;
  flushing = true;
  let runs = 0;
  let error: unknown;
  let failed = false;
  try {
    for (let i = 0; i < pending.length; i++) {
      if (++runs > MAX_EFFECT_RUNS) {
        // Leave the remaining effects re-triggerable instead of stuck in CHECK/DIRTY.
        for (const p of pending) p.node.state = CLEAN;
        throw new ReactiveCycleError('effects keep re-triggering');
      }
      const e = pending[i]!;
      try {
        if (e.scheduler) e.scheduler(e.run);
        else e.run();
      } catch (err) {
        if (!failed) error = err;
        failed = true;
      }
    }
  } finally {
    pending.length = 0;
    flushing = false;
  }
  if (failed) throw error;
}

function disposeChildren(o: OwnerNode): void {
  const owned = o.owned;
  const cleanups = o.cleanups;
  o.owned = null;
  o.cleanups = null;
  if (owned) for (const child of owned) child.dispose();
  if (cleanups) for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!();
}

function adopt(child: OwnerNode): void {
  const parent = owner;
  child.parent = parent;
  if (!parent) return;
  if (parent.disposed) {
    child.dispose();
    return;
  }
  (parent.owned ??= new Set()).add(child);
}

function detach(child: OwnerNode): void {
  child.parent?.owned?.delete(child);
  child.parent = null;
}

// ── Public API ───────────────────────────────────────────────

export function signal<T>(value: T, options?: SignalOptions<T>): WritableSignal<T> {
  const node = createNode(undefined, value, toEquals(options));
  const s = (() => read(node)) as WritableSignal<T>;
  s.peek = () => node.value as T;
  s.set = (v: T) => write(node, v);
  s.update = (fn: (v: T) => T) => write(node, fn(node.value as T));
  return s;
}

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const node = createNode(fn, undefined, toEquals(options));
  const c = (() => read(node)) as ReadonlySignal<T>;
  c.peek = () => untracked(c);
  return c;
}

export function effect(fn: () => void, options?: EffectOptions): () => void {
  const node = createNode(fn, undefined, notifyAll);
  const e: EffectNode = {
    ...ownerFields(),
    node,
    scheduler: options?.scheduler,
    run: () => {
      if (e.disposed || node.state === CLEAN) return;
      if (node.state === CHECK && !sourcesChanged(node)) {
        node.state = CLEAN;
        return;
      }
      disposeChildren(e);
      execute(node, e);
    },
    dispose: () => {
      if (e.disposed) return;
      e.disposed = true;
      disposeChildren(e);
      for (const s of node.sources) unlink(s, node);
      node.sources = [];
      node.sourceVersions = [];
      detach(e);
    },
  };
  node.effect = e;
  adopt(e);
  if (!e.disposed) {
    if (e.scheduler) e.scheduler(e.run);
    else e.run();
  }
  return e.dispose;
}

/** Defers synchronous effects until the outermost batch ends. Returns `fn`'s result. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    if (--batchDepth === 0) flushEffects();
  }
}

/** Runs `fn` without recording what it reads. */
export function untracked<T>(fn: () => T): T {
  const prev = observer;
  observer = null;
  try {
    return fn();
  } finally {
    observer = prev;
  }
}

/** Creates a dispose scope, owned by the current owner (if any). */
export function createOwner(): Owner {
  const o: OwnerNode = {
    ...ownerFields(),
    dispose: () => {
      if (o.disposed) return;
      o.disposed = true;
      disposeChildren(o);
      detach(o);
    },
  };
  adopt(o);
  return o;
}

/**
 * An owner with no parent: it is disposed only through its own `dispose()`, never by whatever owner is
 * current when it is created. Use it for scopes that outlive the code creating them — an element's
 * connection may start inside an effect (an event handler that appends a chart), and must not be
 * torn down when that effect re-runs.
 */
export function createRoot(): Owner {
  const prev = owner;
  owner = null;
  try {
    return createOwner();
  } finally {
    owner = prev;
  }
}

/** Runs `fn` with `scope` as the current owner and without tracking. */
export function runWithOwner<T>(scope: Owner, fn: () => T): T {
  const prevOwner = owner;
  const prevObserver = observer;
  owner = scope as OwnerNode;
  observer = null;
  try {
    return fn();
  } finally {
    owner = prevOwner;
    observer = prevObserver;
  }
}

/** Registers `fn` to run when the current owner is disposed, or before the current effect re-runs. */
export function onCleanup(fn: () => void): void {
  if (owner) (owner.cleanups ??= []).push(fn);
}
