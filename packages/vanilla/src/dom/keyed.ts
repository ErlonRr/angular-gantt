/**
 * @file keyed.ts
 * Keyed list rendering without a virtual DOM.
 *
 * - `reconcile()` keeps one element per key, in item order, and keeps node identity across
 *   reorders. Unchanged order is a fast path with no DOM moves; otherwise only the elements
 *   outside the longest run that kept its order are moved.
 * - `createPool()` recycles detached elements (pass its `release` to `reconcile()`).
 *
 * Contract: one list per `parent` (the state is remembered per parent),
 * the list's elements are contiguous and sit right before `anchor` (or at the end of `parent`
 * when `anchor` is `null`), and nothing else moves them. Static siblings before the list are
 * fine. `update` runs for every rendered element on every call (newly created ones included);
 * write the DOM from it with the `patch.ts` helpers so unchanged values cost nothing.
 *
 * Moves use `parent.moveBefore()` where the browser has it (state-preserving move: focus,
 * animations, iframes), otherwise `insertBefore()`.
 */

type MovableParent = Node & { moveBefore?: (node: Node, child: Node | null) => void };

function place(parent: Node, node: Node, ref: Node | null): void {
  const movable = parent as MovableParent;
  if (node.parentNode === parent && parent.isConnected && typeof movable.moveBefore === 'function') {
    try {
      movable.moveBefore(node, ref);
      return;
    } catch {
      // moveBefore refuses some moves (e.g. across shadow roots): a plain insert still works
    }
  }
  parent.insertBefore(node, ref);
}

function drop<E extends Element>(el: E, release: ((el: E) => void) | undefined): void {
  if (release) release(el);
  else el.remove();
}

/**
 * Marks the positions of a longest strictly increasing subsequence of `seq`, ignoring
 * negative entries (new items). Those elements already are in the right relative order.
 */
function longestIncreasing(seq: readonly number[]): Uint8Array {
  const n = seq.length;
  const keep = new Uint8Array(n);
  const prev = new Int32Array(n).fill(-1);
  const tails: number[] = []; // tails[k] = index in seq of the smallest tail of a run of length k + 1
  for (let i = 0; i < n; i++) {
    const v = seq[i]!;
    if (v < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = prev[i]!) keep[i] = 1;
  return keep;
}

const keyedState = new WeakMap<Node, Map<string, Element>>();
const NO_ELEMENTS: ReadonlyMap<string, Element> = new Map();

/**
 * Renders `items` as keyed children of `parent`, before `anchor`. Returns the elements by
 * key, in item order. `create` builds the element of a new key, `update` patches every
 * element (new or kept), stale keys are removed (or handed to `release`, e.g. a pool's).
 * Throws on duplicate keys.
 */
export function reconcile<T, E extends Element = Element>(
  parent: Node,
  items: readonly T[],
  key: (item: T, index: number) => string,
  create: (item: T, index: number) => E,
  update: (el: E, item: T, index: number) => void,
  anchor: Node | null = null,
  release?: (el: E) => void,
): Map<string, E> {
  const prev = (keyedState.get(parent) ?? NO_ELEMENTS) as ReadonlyMap<string, E>;
  const next = new Map<string, E>();
  const keys: string[] = [];

  items.forEach((item, i) => {
    const k = key(item, i);
    if (next.has(k)) throw new Error(`gantry: duplicate key "${k}" in a keyed list`);
    const el = prev.get(k) ?? create(item, i);
    update(el, item, i);
    next.set(k, el);
    keys.push(k);
  });

  // Survivors, in their current DOM order; stale elements leave first.
  const kept: string[] = [];
  for (const [k, el] of prev) {
    if (next.has(k)) kept.push(k);
    else drop(el, release);
  }

  // Fast path: a common prefix and suffix are already in place.
  let head = 0;
  while (head < keys.length && head < kept.length && keys[head] === kept[head]) head++;
  let tailNew = keys.length - 1;
  let tailOld = kept.length - 1;
  while (tailNew >= head && tailOld >= head && keys[tailNew] === kept[tailOld]) {
    tailNew--;
    tailOld--;
  }

  if (head <= tailNew) {
    const oldIndex = new Map<string, number>();
    for (let i = head; i <= tailOld; i++) oldIndex.set(kept[i]!, i);
    const middle = keys.slice(head, tailNew + 1);
    const stay = longestIncreasing(middle.map(k => oldIndex.get(k) ?? -1));
    let ref: Node | null = tailNew + 1 < keys.length ? next.get(keys[tailNew + 1]!)! : anchor;
    for (let j = middle.length - 1; j >= 0; j--) {
      const el = next.get(middle[j]!)!;
      if (!stay[j]) place(parent, el, ref);
      ref = el;
    }
  }

  keyedState.set(parent, next);
  return next;
}

/** A free list of detached elements of one kind. */
export interface Pool<E extends Element> {
  /** A recycled element, or a new one from `create`. */
  readonly acquire: () => E;
  /** Detaches `el` and keeps it for reuse (up to the pool's `max`). Safe to pass as `release`. */
  readonly release: (el: E) => void;
  /** Recycled elements waiting for reuse. */
  readonly size: () => number;
  /** Forgets every waiting element. */
  readonly clear: () => void;
}

/** Creates a pool. Recycled elements keep their listeners and their patch cache. */
export function createPool<E extends Element>(create: () => E, max = Infinity): Pool<E> {
  const free: E[] = [];
  return {
    acquire: () => free.pop() ?? create(),
    release: el => {
      el.remove();
      if (free.length < max) free.push(el);
    },
    size: () => free.length,
    clear: () => {
      free.length = 0;
    },
  };
}
