/**
 * @file node.ts
 * Graph nodes: computeds that count their runs per name, so tests (and the perf page) can check
 * which parts of the model a change recomputes.
 */

import { computed, type ReadonlySignal, type SignalOptions } from '../../reactive';

/** Recompute count per graph node name. */
export type Runs = Record<string, number>;

/** Creates a named computed that counts its runs in `runs`. */
export type NodeFactory = <T>(name: string, fn: () => T, options?: SignalOptions<T>) => ReadonlySignal<T>;

export function nodeFactory(runs: Runs): NodeFactory {
  return (name, fn, options) =>
    computed(() => {
      runs[name] = (runs[name] ?? 0) + 1;
      return fn();
    }, options);
}
