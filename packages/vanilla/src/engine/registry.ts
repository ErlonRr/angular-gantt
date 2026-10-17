/**
 * @file registry.ts
 * Element → engine. The engine stays private to the element: tests import `getEngine` from this
 * source path; the package index does not re-export it.
 */

import type { Engine } from './engine';

const engines = new WeakMap<HTMLElement, Engine>();

export function registerEngine(host: HTMLElement, engine: Engine): void {
  engines.set(host, engine);
}

export function getEngine(host: HTMLElement): Engine {
  const engine = engines.get(host);
  if (!engine) throw new Error('[gantry] not a <gantry-element>');
  return engine;
}
