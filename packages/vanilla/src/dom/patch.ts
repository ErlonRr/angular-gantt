/**
 * @file patch.ts
 * Write-only DOM patching with a per-node last-value cache.
 *
 * Every helper compares the new value with the last value *it* wrote to that node and skips
 * the DOM call when nothing changed. Nothing is ever read back from the DOM: the cache lives
 * in one module `WeakMap<Node, …>`, so it is freed with the node. The first write of a given
 * attribute / property / class / text to a node always reaches the DOM, whatever the node
 * started with.
 *
 * Do not mix `setAttr(el, 'class', …)` with `toggleClass(el, …)` on the same node: they cache
 * independently. Code that mutates a patched node behind these helpers' back must call
 * `forgetPatches(node)` afterwards.
 */

/** An attribute value: `null`, `undefined` and `false` remove it, `true` sets it to `''`. */
export type AttrValue = string | number | boolean | null | undefined;

/** A node whose inline style can be patched (HTML and SVG elements). */
export type StylableElement = Element & ElementCSSInlineStyle;

const cache = new WeakMap<Node, Record<string, unknown>>();

function slot(node: Node): Record<string, unknown> {
  let entry = cache.get(node);
  if (!entry) {
    entry = Object.create(null) as Record<string, unknown>;
    cache.set(node, entry);
  }
  return entry;
}

/** True when `key` is cached on `entry` with exactly `value` (so the write can be skipped). */
function unchanged(entry: Record<string, unknown>, key: string, value: unknown): boolean {
  return key in entry && entry[key] === value;
}

/**
 * Attribute names that would bypass CSP: `style` (use `setStyleProp`) and inline event
 * handlers (`on*`, use `addEventListener`).
 */
export function assertSafeAttrName(name: string): void {
  if (name.length >= 2 && /^(?:style$|on)/i.test(name)) {
    throw new TypeError(`gantry: refusing to set the "${name}" attribute (CSP); use setStyleProp or addEventListener`);
  }
}

/** Sets (or removes, for `null` / `undefined` / `false`) one attribute. */
export function setAttr(el: Element, name: string, value: AttrValue): void {
  const entry = slot(el);
  const key = `a:${name}`;
  const next = value == null || value === false ? null : value === true ? '' : String(value);
  if (unchanged(entry, key, next)) return;
  assertSafeAttrName(name);
  entry[key] = next;
  if (next === null) el.removeAttribute(name);
  else el.setAttribute(name, next);
}

/**
 * A value the CSSOM must never see: a declaration separator or a block. Browsers reject them
 * already; the guard makes every environment (happy-dom included) behave the same.
 */
const UNSAFE_CSS_VALUE = /[;{}]/;

/**
 * Sets one inline style property through the CSSOM (`style.setProperty`), or removes it for
 * `null` / `undefined`. Never touches the `style` attribute text, so it is CSP-safe. A value
 * carrying `;`, `{` or `}` (an attempt to smuggle extra declarations) clears the property.
 */
export function setStyleProp(el: StylableElement, prop: string, value: string | number | null | undefined): void {
  const entry = slot(el);
  const key = `s:${prop}`;
  const next = value == null ? null : String(value);
  if (unchanged(entry, key, next)) return;
  entry[key] = next;
  if (next === null || UNSAFE_CSS_VALUE.test(next)) el.style.removeProperty(prop);
  else el.style.setProperty(prop, next);
}

/** Sets the text content of an element or text node. */
export function setText(node: Node, text: string | number): void {
  const entry = slot(node);
  const value = String(text);
  if (unchanged(entry, 't', value)) return;
  entry['t'] = value;
  node.textContent = value;
}

/** Adds (`on = true`) or removes one class. */
export function toggleClass(el: Element, className: string, on: boolean): void {
  const entry = slot(el);
  const key = `c:${className}`;
  if (unchanged(entry, key, on)) return;
  entry[key] = on;
  el.classList.toggle(className, on);
}

/** Drops the cached values of `node`, so the next write of each value reaches the DOM again. */
export function forgetPatches(node: Node): void {
  cache.delete(node);
}
