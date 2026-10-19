import { useSyncExternalStore } from 'react';
import { getTheme, onThemeChange } from 'demo-kit/theme';

/**
 * Whether the site shows its dark theme (the header switch, else the system preference): pass it
 * to every chart's `darkMode` so the gallery's charts follow the page.
 */
export function useDarkMode(): boolean {
  return useSyncExternalStore(onThemeChange, getTheme) === 'dark';
}
