import type { GantryElement } from '@gantryjs/vanilla';
import { getTheme, onThemeChange, type SiteTheme } from 'demo-kit/theme';

/**
 * Keeps the charts' `darkMode` on the site's theme (the header switch, else the system
 * preference), now and on every change. Returns the function that stops following.
 */
export function followSiteTheme(...charts: GantryElement[]): () => void {
  const apply = (theme: SiteTheme) => {
    for (const chart of charts) chart.darkMode = theme === 'dark';
  };
  apply(getTheme());
  const stop = onThemeChange(apply);
  return () => void stop();
}
