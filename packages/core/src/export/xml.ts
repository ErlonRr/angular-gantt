// ─────────────────────────────────────────────────────────────
//  gantry · export/xml.ts
//  XML text helpers of the SVG serializer (Phase 12, D4 / D28): escaping,
//  stripping characters XML can't hold, deterministic numbers, and the
//  theme inlined into custom-bar markup (no `var(` in an export).
// ─────────────────────────────────────────────────────────────

import type { GanttTheme } from '../types';
import { resolvePaint } from '../render/paint';

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

const XML_SPECIAL = /[&<>"'\t\n\r]/g;
const NEEDS_ESCAPE = /[&<>"'\t\n\r]/;

/**
 * `text` with `&`, `<`, `>`, `"` and `'` escaped: safe in element content and attribute values.
 * Tab, LF and CR become character references too, so an attribute value keeps them on a round
 * trip (a parser turns literal ones into spaces).
 */
export function escapeXml(text: string): string {
  return NEEDS_ESCAPE.test(text) ? text.replace(XML_SPECIAL, c => XML_ESCAPES[c] ?? c) : text;
}

/** A character outside U+0020…U+D7FF and U+E000…U+FFFD (tab, LF and CR included: the loop keeps them). */
const OUTSIDE_PLAIN = /[^\x20-\uD7FF\uE000-\uFFFD]/;

/**
 * `text` without what XML 1.0 can't hold: C0 controls (tab, LF and CR are kept), lone surrogates,
 * U+FFFE and U+FFFF. User text goes through `escapeXml(stripInvalidXml(text))`.
 */
export function stripInvalidXml(text: string): string {
  // Only plain characters (no control, surrogate or non-character): nothing to look at
  if (!OUTSIDE_PLAIN.test(text)) return text;
  let out = '';
  /** Start of the run of valid characters not yet copied to `out` */
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    let invalid: boolean;
    if (c < 0x20) invalid = c !== 0x09 && c !== 0x0a && c !== 0x0d;
    else if (c < 0xd800) continue;
    else if (c <= 0xdbff) {
      // A high surrogate is valid only before a low one: keep the pair
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      invalid = true;
    } else invalid = c <= 0xdfff || c === 0xfffe || c === 0xffff;
    if (invalid) {
      out += text.slice(from, i);
      from = i + 1;
    }
  }
  return from === 0 ? text : out + text.slice(from);
}

/** A number as an attribute value: at most 2 decimals, no trailing zeros, never `-0`. Not finite: `0`. */
export function num(n: number): string {
  // Whole numbers as they are (`String(-0)` is `'0'`)
  if (Number.isInteger(n)) return String(n);
  if (!Number.isFinite(n)) return '0';
  // Rounded half away from zero, the same for both signs
  const r = Math.round(Math.abs(n) * 100) / 100;
  return r === 0 ? '0' : String(n < 0 ? -r : r);
}

/** A number token of a path, a point list, a dash array or a transform (exponents included). */
const NUMBER_TOKEN = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const LONG_OR_EXPONENT = /\.\d{3}|\d[eE]/;

/**
 * Every number of `list` (path data, points, a dash array, a transform) through `num`. A number
 * written right after another one (`1.5.5`, `2-3`) stays apart: a space is put between them when
 * the rounded text would merge them.
 */
export function nums(list: string): string {
  // Nothing to round: no third decimal, no exponent
  if (!LONG_OR_EXPONENT.test(list)) return list;
  return list.replace(NUMBER_TOKEN, (token: string, at: number) => {
    const dot = token.indexOf('.');
    // Short enough, and not a `.5` that could follow a number whose dot the rounding dropped
    if (dot !== 0 && (dot < 0 || token.length - dot <= 3) && !/[eE]/.test(token)) return token;
    const out = num(parseFloat(token));
    const before = at > 0 ? list.charAt(at - 1) : '';
    return /[\d.]/.test(before) && !out.startsWith('-') ? ` ${out}` : out;
  });
}

/** Index of the `)` closing the `(` at `open`, or -1. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x28 /* ( */) depth++;
    else if (c === 0x29 /* ) */ && --depth === 0) return i;
  }
  return -1;
}

/**
 * `markup` with every `var(--gantt-*)` (with or without a fallback) replaced by its colour under
 * `theme` (`resolvePaint`, contrast tokens included): custom-bar markup drawn with the export
 * theme. Any other `var(--name, fallback)` becomes its fallback (resolved the same way), and a
 * custom property nothing resolves becomes `inherit` (what CSS does with it: `unset`), so the
 * result holds no `var(` at all. Each value is escaped (`escapeXml`): a `fontFamily` with quotes
 * keeps an attribute well-formed.
 */
export function inlineThemeVars(markup: string, theme: GanttTheme): string {
  return inlineVars(markup, theme, true);
}

/** A value with its `var(…)` resolved as `inlineThemeVars` does, not escaped (an attribute writer escapes it). */
export function resolveThemeVars(value: string, theme: GanttTheme): string {
  return inlineVars(value, theme, false);
}

function inlineVars(markup: string, theme: GanttTheme, escape: boolean): string {
  let at = markup.indexOf('var(');
  if (at < 0) return markup;
  let out = '';
  let from = 0;
  while (at >= 0) {
    const end = closingParen(markup, at + 3);
    if (end < 0) break;
    // `myvar(` is not a `var(`
    if (at > 0 && /[\w-]/.test(markup.charAt(at - 1))) {
      at = markup.indexOf('var(', at + 4);
      continue;
    }
    const value = resolveVar(markup.slice(at, end + 1), theme);
    out += markup.slice(from, at) + (escape ? escapeXml(value) : value);
    from = end + 1;
    at = markup.indexOf('var(', from);
  }
  return out + markup.slice(from);
}

/** One `var(…)` expression as a value without `var(` (not escaped). */
function resolveVar(expr: string, theme: GanttTheme): string {
  const value = resolvePaint(expr, theme);
  // Unknown and no fallback: `resolvePaint` hands the expression back
  if (value === expr) return 'inherit';
  // A fallback may hold `var(` deeper (`color-mix(…, var(--gantt-bar) 40%, …)`)
  return value.includes('var(') ? inlineVars(value, theme, false) : value;
}
