/**
 * The site's light/dark switch, shared by every demo app.
 *
 * The visitor's choice is stored; without one the system preference applies and is followed
 * live. The theme lands on `<html data-theme>`, which pins `color-scheme` (see `site.css`), and
 * listeners get it so each app can pass `darkMode` to its charts. Safe to import on a server:
 * nothing touches the DOM until a function runs.
 *
 * The header toggle is `<button class="gs-icon-btn" aria-label="Dark theme" aria-pressed>` with
 * the moon icon while light and the sun icon while dark.
 */

export type SiteTheme = 'light' | 'dark';

const STORAGE_KEY = 'gantry-site-theme';
const listeners = new Set<(theme: SiteTheme) => void>();
let current: SiteTheme | null = null;
let watching = false;

function systemQuery(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
}

function stored(): SiteTheme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function apply(theme: SiteTheme): void {
  current = theme;
  if (typeof document !== 'undefined') document.documentElement.dataset['theme'] = theme;
  for (const fn of listeners) fn(theme);
}

/** The theme on screen: the stored choice, else the system preference. */
export function getTheme(): SiteTheme {
  return current ?? stored() ?? (systemQuery()?.matches ? 'dark' : 'light');
}

/** Applies the theme to `<html>` and starts following the system preference (call once at startup). */
export function initTheme(): SiteTheme {
  const theme = getTheme();
  apply(theme);
  if (!watching) {
    watching = true;
    systemQuery()?.addEventListener('change', e => {
      if (!stored()) apply(e.matches ? 'dark' : 'light');
    });
  }
  return theme;
}

/** Sets and stores the visitor's choice. */
export function setTheme(theme: SiteTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only
  }
  apply(theme);
}

/** Flips light ↔ dark and returns the new theme. */
export function toggleTheme(): SiteTheme {
  const next: SiteTheme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Calls `fn` on every change; returns the unsubscribe function. */
export function onThemeChange(fn: (theme: SiteTheme) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
