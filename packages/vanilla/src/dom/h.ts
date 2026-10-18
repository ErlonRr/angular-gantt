/**
 * @file h.ts
 * Tiny element builders: `h()` for HTML, `s()` for SVG. They build nodes with
 * `createElement(NS)`, attributes, text nodes and listeners only: no HTML parsing, no markup
 * strings, no `style=` attribute (CSP: style through `setStyleProp` / stylesheets).
 *
 * Attributes go through `setAttr`, so the patch cache starts in sync with what was built and
 * a later identical `setAttr` is skipped.
 *
 * Module top level stays SSR-safe: `document` is only touched when a builder is called.
 */
import { type AttrValue, setAttr, setText } from './patch';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** A child: a node, text (strings and numbers), nothing (`null` / `undefined` / `false`), or a list. */
export type Child = Node | string | number | false | null | undefined | readonly Child[];

/** A listener, or a listener with its `addEventListener` options (e.g. `{ passive: true }`). */
export type Listener<E extends Event> = ((ev: E) => void) | readonly [(ev: E) => void, AddEventListenerOptions];

/** Listeners by event name. */
export type Listeners<M> = { readonly [K in keyof M]?: M[K] extends Event ? Listener<M[K]> : never };

export interface HProps<M = HTMLElementEventMap> {
  /** Class names: a space-separated string or a list (falsy entries are skipped). */
  readonly class?: string | readonly (string | false | null | undefined)[] | undefined;
  /** `data-*` values, by camel-cased dataset key. */
  readonly dataset?: Readonly<Record<string, string | number>> | undefined;
  /** Attributes (`null` / `undefined` / `false` skip, `true` is `''`). `style` and `on*` are refused. */
  readonly attrs?: Readonly<Record<string, AttrValue>> | undefined;
  /** Text content (set before the children are appended). */
  readonly text?: string | number | undefined;
  /** Event listeners. */
  readonly on?: Listeners<M> | undefined;
}

function applyClass(el: Element, cls: HProps['class']): void {
  if (cls == null) return;
  const value = typeof cls === 'string' ? cls : cls.filter(Boolean).join(' ');
  if (value) el.setAttribute('class', value);
}

function appendChildren(el: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child as readonly Child[]);
    else if (typeof child === 'string' || typeof child === 'number')
      el.appendChild(document.createTextNode(String(child)));
    else el.appendChild(child as Node);
  }
}

function applyProps<M>(el: Element, props: HProps<M>): void {
  applyClass(el, props.class);
  if (props.dataset) {
    const dataset = (el as HTMLElement | SVGElement).dataset;
    for (const [k, v] of Object.entries(props.dataset)) dataset[k] = String(v);
  }
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) setAttr(el, k, v);
  if (props.text != null) setText(el, props.text);
  if (props.on) {
    for (const [type, listener] of Object.entries(props.on) as [string, Listener<Event> | undefined][]) {
      if (!listener) continue;
      if (typeof listener === 'function') el.addEventListener(type, listener);
      else el.addEventListener(type, listener[0], listener[1]);
    }
  }
}

/** Builds an HTML element. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HProps | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** SVG attributes: plain attribute names (`class`, `data-*`, `aria-*` included). */
export type SAttrs = Readonly<Record<string, AttrValue>>;

/** Builds an SVG element. `style` and `on*` attributes are refused, as in `h()`. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: SAttrs | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) setAttr(el, k, v);
  }
  appendChildren(el, children);
  return el;
}
