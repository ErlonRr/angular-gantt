/**
 * @file state.ts
 * Signal-like reactive state container for Vanilla JS components.
 */

export interface WritableState<T> {
  (): T;
  get(): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  subscribe(fn: (value: T) => void): () => void;
}

/**
 * Creates a signal-compatible reactive state container.
 */
export function createState<T>(initialValue: T): WritableState<T> {
  let currentValue = initialValue;
  const subscribers = new Set<(value: T) => void>();

  function read(): T {
    return currentValue;
  }

  read.get = () => currentValue;

  read.set = (newValue: T) => {
    if (!Object.is(currentValue, newValue)) {
      currentValue = newValue;
      subscribers.forEach(fn => fn(currentValue));
    }
  };

  read.update = (fn: (prev: T) => T) => {
    read.set(fn(currentValue));
  };

  read.subscribe = (fn: (value: T) => void) => {
    subscribers.add(fn);
    fn(currentValue);
    return () => subscribers.delete(fn);
  };

  return read;
}
