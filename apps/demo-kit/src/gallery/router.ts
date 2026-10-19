/**
 * The gallery's hash router, shared by the Vite demo apps (no router dependency, works from any
 * subpath of a static host):
 *
 * - React, Vue and Svelte: `#/examples` (the index) and `#/examples/<id>` (a case); anything else
 *   is their home page, which stays at `/`.
 * - The Web Component's `examples.html`: `#/<id>` (a case); no hash is the index.
 *
 * Only hashes that start with `#/` are routes: an in-page anchor such as `#main` is not, and
 * `onHashChange` ignores it (skip links still call `preventDefault`).
 */

import { isCaseId, type CaseId } from './catalog';

export type GalleryRoute = { page: 'home' } | { page: 'index' } | { page: 'case'; id: CaseId };

const HOME: GalleryRoute = Object.freeze({ page: 'home' });
const INDEX: GalleryRoute = Object.freeze({ page: 'index' });

/** Whether `hash` is a gallery route (`''`, `'#'` or `#/…`), not an in-page anchor. */
export function isRouteHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash.startsWith('#/');
}

/**
 * The route of a location hash:
 * - `#/examples` → the index; `#/examples/<id>` → that case (an unknown id → the index);
 * - `#/<id>` → that case (the Web Component's `examples.html#/<id>`);
 * - anything else (`''`, `#/`, `#main`, `#/nope`) → home (`examples.html` shows its index there).
 *
 * Query strings and trailing slashes are ignored; ids are matched as written (lower case).
 */
export function parseGalleryHash(hash: string): GalleryRoute {
  if (!hash.startsWith('#/')) return HOME;
  const path = hash.slice(2).split(/[?#]/)[0] ?? '';
  const parts = path.split('/').filter(Boolean).map(safeDecode);
  if (parts[0] === 'examples') {
    const id = parts[1];
    return id !== undefined && isCaseId(id) ? { page: 'case', id } : INDEX;
  }
  return parts.length === 1 && isCaseId(parts[0]) ? { page: 'case', id: parts[0] } : HOME;
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * The hash of a gallery page: `#/examples` or `#/examples/<id>` (React, Vue, Svelte); with
 * `form: 'page'`, `''` or `#/<id>` (the Web Component's `examples.html`, which is the index itself).
 */
export function galleryHash(id?: CaseId, form: 'examples' | 'page' = 'examples'): string {
  if (form === 'page') return id ? `#/${id}` : '';
  return id ? `#/examples/${id}` : '#/examples';
}

/** The route of the current location (home on the server). */
export function currentGalleryRoute(): GalleryRoute {
  return typeof location === 'undefined' ? HOME : parseGalleryHash(location.hash);
}

/**
 * Calls `cb` with the new route whenever the hash changes to a route (in-page anchors are
 * ignored). Returns the unsubscribe function; a no-op on the server.
 */
export function onHashChange(cb: (route: GalleryRoute) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = () => {
    if (isRouteHash(location.hash)) cb(parseGalleryHash(location.hash));
  };
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
