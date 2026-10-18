// Small DOM helpers for the playground: elements from tag + attributes + children, and the site
// icons (demo-kit/icons) drawn into SVG elements. No HTML strings anywhere.
import { ICONS, type IconName, type SiteIcon } from 'demo-kit/icons';

type AttrValue = string | number | boolean | null | undefined;

/**
 * `<tag attr…>children</tag>`. `class` sets the class list; `true` adds an empty attribute;
 * `false`, `null` and `undefined` leave the attribute out. Strings become text nodes.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  el.append(...children);
  return el;
}

/** The element with `id`, typed; throws when the page markup lacks it. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function isIconName(name: string | undefined): name is IconName {
  return !!name && Object.hasOwn(ICONS, name);
}

/** Draws icon `name` into `svg` (decorative: hidden from assistive technology). */
export function drawIcon(svg: SVGSVGElement, name: IconName): SVGSVGElement {
  const icon: SiteIcon = ICONS[name];
  svg.setAttribute('viewBox', icon.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (icon.fill) {
    svg.setAttribute('fill', 'currentColor');
    for (const attr of ['stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) svg.removeAttribute(attr);
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  svg.replaceChildren(
    ...icon.paths.map(d => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      return path;
    }),
  );
  svg.dataset['icon'] = name;
  return svg;
}

/** A new decorative icon. */
export function icon(name: IconName): SVGSVGElement {
  return drawIcon(document.createElementNS(SVG_NS, 'svg'), name);
}

/** Fills every `<svg data-icon="name">` placeholder of the static markup under `root`. */
export function drawIcons(root: ParentNode): void {
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg[data-icon]')) {
    const name = svg.dataset['icon'];
    if (isIconName(name)) drawIcon(svg, name);
  }
}
