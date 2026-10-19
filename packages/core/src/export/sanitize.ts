// ─────────────────────────────────────────────────────────────
//  gantry · export/sanitize.ts
//  What a custom bar's markup keeps in an export (Phase 12, D5). One
//  rule set for core's `customBar` markup and the bindings' custom bar
//  nodes (their `serializeSvg` serializes the node, then calls
//  `sanitizeSvgMarkup`), so a headless and a browser export agree.
//
//  Kept: SVG drawing elements (`SVG_ELEMENTS`) in the SVG namespace,
//  their attributes and text. Dropped:
//    elements    any other element with its content: `script`, `style`,
//                `foreignObject`, SMIL animations (`set`, `animate`…,
//                meaningless in a static image), `metadata`, HTML,
//                elements of another or an undeclared namespace; an
//                unclosed one up to the end of the markup
//    attributes  `on*` handlers, `tabindex` and `autofocus`; a URL
//                attribute (`URL_ATTRIBUTES`) holding a `javascript:`,
//                `vbscript:` or `data:` URL
//                (alone or as an entry of a `;` list; `data:image/png`,
//                `jpeg`, `gif` and `webp` allowed), read with character
//                references decoded and whitespace and controls removed
//                (as URL parsers read a scheme); an `href` (any prefix)
//                other than a `#fragment` or such an image; a `url(…)`
//                other than `url(#…)` (or `image()`, `image-set()`,
//                `src()`): nothing in an export loads a remote resource
//                (a `style` keeps its other declarations)
//    nodes       comments, processing instructions, doctypes and other
//                declarations (a CDATA section is kept as text)
//  The output is rebuilt from what was read — attributes double-quoted
//  and escaped, text escaped, end tags balanced — so a reader (an XML
//  parser, or the HTML parser of a page the SVG is pasted into) sees
//  exactly what was checked.
// ─────────────────────────────────────────────────────────────

import { escapeXml, stripInvalidXml } from './xml';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** The elements a custom bar may draw with (compared in lower case): shapes, text, paint servers, structure, filters. */
const SVG_ELEMENTS: ReadonlySet<string> = new Set(
  [
    'a',
    'circle',
    'clipPath',
    'defs',
    'desc',
    'ellipse',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDistantLight',
    'feDropShadow',
    'feFlood',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feTile',
    'feTurbulence',
    'filter',
    'g',
    'image',
    'line',
    'linearGradient',
    'marker',
    'mask',
    'path',
    'pattern',
    'polygon',
    'polyline',
    'radialGradient',
    'rect',
    'stop',
    'svg',
    'switch',
    'symbol',
    'text',
    'textPath',
    'title',
    'tspan',
    'use',
    'view',
  ].map(name => name.toLowerCase()),
);

// ─── Attribute values ────────────────────────────────────────

/** ASCII whitespace, C0 controls and DEL: URL parsers skip them inside a scheme. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const IGNORED_IN_URL = /[\u0000- \u007f]+/g;

/** `value` as a URL parser reads its scheme: lower case, without whitespace or controls. */
const compact = (value: string): string => value.replace(IGNORED_IN_URL, '').toLowerCase();

/**
 * The attributes whose value a browser may read as a URL (`href` with any prefix, an animation's
 * targets): only these lose a script or data URL. Other attributes are text ("Data: 12 tasks").
 */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'values',
  'from',
  'to',
  'by',
]);

/** A script or data URL, alone or as an entry of a `;` list (an animation's `values`). */
const SCHEME = /(?:^|;)(javascript|vbscript|data):/g;

/** The data URLs an export keeps: raster images (after `data:`). */
const DATA_IMAGE = /^image\/(?:png|jpeg|gif|webp)[;,]/;

/** A compacted value holds a script URL, or a data URL that is not a raster image. */
function scriptOrDataUrl(compacted: string): boolean {
  for (const m of compacted.matchAll(SCHEME))
    if (m[1] !== 'data' || !DATA_IMAGE.test(compacted.slice(m.index + m[0].length))) return true;
  return false;
}

/** A CSS escape (`\75 rl(`): a hex code point (one optional whitespace after it) or an escaped character. */
const CSS_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([\s\S]))/g;

/** A CSS function that loads a resource. */
const RESOURCE_FUNCTION = /(url|src|image|image-set)\(/g;

/** CSS text (a declaration, a presentation attribute) loads something other than a `#fragment` of the image. */
function remoteCss(text: string): boolean {
  if (!text.includes('(')) return false;
  const css = compact(
    text.replace(CSS_ESCAPE, (_, hex: string | undefined, char: string | undefined) =>
      hex === undefined ? (char ?? '') : codePointText(parseInt(hex, 16)),
    ),
  );
  for (const m of css.matchAll(RESOURCE_FUNCTION))
    if (m[1] !== 'url' || !/^["']?#/.test(css.slice(m.index + m[0].length))) return true;
  return false;
}

/** A `style` value's declarations: split on `;` outside parentheses and quotes. */
function declarations(style: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < style.length; i++) {
    const c = style.charAt(i);
    if (c === '\\') i++;
    else if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      out.push(style.slice(from, i));
      from = i + 1;
    }
  }
  out.push(style.slice(from));
  return out;
}

/**
 * An attribute as an export keeps it (`value` with its character references decoded): the value
 * (a `style` without its remote declarations), or `null` to drop the attribute.
 */
export function sanitizeSvgAttribute(name: string, value: string): string | null {
  // Namespace declarations name a namespace: nothing is loaded from it
  if (name === 'xmlns' || name.startsWith('xmlns:')) return value;
  const local = name.slice(name.indexOf(':') + 1).toLowerCase();
  if (local.startsWith('on') || local === 'tabindex' || local === 'autofocus') return null;
  if (URL_ATTRIBUTES.has(local)) {
    const url = compact(value);
    if (scriptOrDataUrl(url)) return null;
    if (local === 'href')
      return url.startsWith('#') || /^data:image\/(?:png|jpeg|gif|webp)[;,]/.test(url) ? value : null;
  }
  if (local !== 'style') return remoteCss(value) ? null : value;
  const all = declarations(value);
  const kept = all.filter(d => !remoteCss(d));
  if (kept.length === all.length) return value;
  const style = kept.join(';');
  return style.trim() ? style : null;
}

// ─── Character references ────────────────────────────────────

/** Named references decoded besides XML's five: the HTML ones that spell URL syntax. */
const NAMED_REFS: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  sol: '/',
  bsol: '\\',
  lpar: '(',
  rpar: ')',
  num: '#',
  semi: ';',
  comma: ',',
  period: '.',
  excl: '!',
  quest: '?',
  equals: '=',
  plus: '+',
  percnt: '%',
  commat: '@',
  lowbar: '_',
  Tab: '\t',
  NewLine: '\n',
  nbsp: ' ',
};

const REFERENCE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g;

/** A code point as text: U+FFFD for one that is not a character. */
function codePointText(cp: number): string {
  return cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : '�';
}

/**
 * `text` with its character references decoded: numeric ones, XML's five and the HTML ones of
 * `NAMED_REFS`. Any other `&name;` stays as it is (and is written back as text, `&amp;name;`).
 */
function decodeReferences(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(REFERENCE, (all, dec: string | undefined, hex: string | undefined, named: string | undefined) => {
    if (named !== undefined) return Object.hasOwn(NAMED_REFS, named) ? NAMED_REFS[named]! : all;
    return codePointText(dec !== undefined ? parseInt(dec, 10) : parseInt(hex!, 16));
  });
}

/** Text content written back: `&`, `<` and `>` escaped. */
const textOf = (raw: string): string =>
  stripInvalidXml(decodeReferences(raw)).replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

// ─── Markup ──────────────────────────────────────────────────

/**
 * Comment · CDATA section (its text: 1) · declaration (a doctype) · processing instruction · end tag
 * (name: 2) · start or empty-element tag (name: 3, attributes: 4) · a tag cut off by the end.
 */
const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<![^>]*(?:>|$)|<\?[\s\S]*?(?:\?>|$)|<\/([A-Za-z_][\w:.-]*)[^>]*>|<([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<[A-Za-z_/!?][^>]*$/g;

/** An attribute of a start tag: name, then a double-quoted (2), single-quoted (3) or bare (4) value. */
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** A qualified XML name (`prefix:local`). */
const QNAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;

/** Namespace prefixes in scope (`''`: the default namespace). */
type Scope = ReadonlyMap<string, string>;

/** Inside the export's `<svg>`: SVG is the default namespace, `xml:` is predeclared. */
const ROOT_SCOPE: Scope = new Map([
  ['', SVG_NS],
  ['xml', XML_NS],
]);

const prefixOf = (name: string): string => {
  const colon = name.indexOf(':');
  return colon < 0 ? '' : name.slice(0, colon);
};

/**
 * A start tag rebuilt with the attributes an export keeps, without its closing `>` / `/>`, and the
 * namespace scope of its content; `null` when the element is dropped.
 */
function startTag(name: string, rest: string, parent: Scope): { tag: string; scope: Scope } | null {
  if (!QNAME.test(name)) return null;
  const attrs: [string, string][] = [];
  const seen = new Set<string>();
  for (const [, attr, dq, sq, bare] of rest.matchAll(ATTRIBUTE)) {
    // An XML name, the first of its name (as both parsers keep)
    if (!attr || !QNAME.test(attr) || seen.has(attr)) continue;
    seen.add(attr);
    attrs.push([attr, decodeReferences(dq ?? sq ?? bare ?? '')]);
  }
  // The element's own declarations count for its name
  let scope = parent;
  for (const [attr, value] of attrs) {
    if (attr !== 'xmlns' && !attr.startsWith('xmlns:')) continue;
    if (scope === parent) scope = new Map(parent);
    (scope as Map<string, string>).set(attr === 'xmlns' ? '' : attr.slice(6), value);
  }
  const local = name.slice(name.indexOf(':') + 1).toLowerCase();
  if (scope.get(prefixOf(name)) !== SVG_NS || !SVG_ELEMENTS.has(local)) return null;
  let tag = `<${name}`;
  let bindXlink = false;
  for (const [attr, value] of attrs) {
    const prefix = attr.startsWith('xmlns:') ? '' : prefixOf(attr);
    // An undeclared prefix: only `xlink:` (declared here), else the attribute goes
    if (prefix && !scope.has(prefix) && prefix !== 'xlink') continue;
    const kept = sanitizeSvgAttribute(attr, value);
    if (kept === null) continue;
    if (prefix === 'xlink' && !scope.has('xlink')) bindXlink = true;
    tag += ` ${attr}="${escapeXml(stripInvalidXml(kept))}"`;
  }
  if (bindXlink) {
    tag += ` xmlns:xlink="${XLINK_NS}"`;
    scope = new Map(scope).set('xlink', XLINK_NS);
  }
  return { tag, scope };
}

/**
 * Custom SVG markup as an export draws it (the rules at the top of this file): only SVG drawing
 * elements, no script, style, animation, event handler or remote resource, rebuilt well-formed.
 * `''` when nothing is left (the root was dropped). Pure.
 */
export function sanitizeSvgMarkup(markup: string): string {
  const source = stripInvalidXml(markup);
  let out = '';
  /** Kept elements still open: their names (end tags are balanced) and the scope around them */
  const open: { name: string; outer: Scope }[] = [];
  let scope = ROOT_SCOPE;
  /** Depth inside a dropped element (0: not in one) */
  let skip = 0;
  let at = 0;
  for (const m of source.matchAll(TOKEN)) {
    if (!skip) out += textOf(source.slice(at, m.index));
    at = m.index + m[0].length;
    const [, cdata, end, start, rest] = m;
    if (start !== undefined) {
      const empty = /\/\s*$/.test(rest ?? '');
      if (skip) {
        if (!empty) skip++;
        continue;
      }
      const kept = startTag(start, rest ?? '', scope);
      if (!kept) {
        if (!empty) skip = 1;
        continue;
      }
      out += kept.tag + (empty ? '/>' : '>');
      if (!empty) {
        open.push({ name: start, outer: scope });
        scope = kept.scope;
      }
    } else if (end !== undefined) {
      if (skip) {
        skip--;
        continue;
      }
      // Closes the innermost open element of that name (and what is still open in it); a stray one goes
      let i = open.length - 1;
      while (i >= 0 && open[i]!.name !== end) i--;
      while (i >= 0 && open.length > i) {
        const el = open.pop()!;
        out += `</${el.name}>`;
        scope = el.outer;
      }
    } else if (cdata !== undefined && !skip) out += textOf(cdata.replace(/&/g, '&amp;'));
    // Comments, declarations, processing instructions and cut-off tags: dropped
  }
  if (!skip) out += textOf(source.slice(at));
  while (open.length) out += `</${open.pop()!.name}>`;
  return out.trim();
}
