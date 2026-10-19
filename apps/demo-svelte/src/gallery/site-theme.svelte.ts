import { createSubscriber } from 'svelte/reactivity';
import { getTheme, onThemeChange } from 'demo-kit/theme';

const subscribe = createSubscriber(update => onThemeChange(update));

/**
 * The site's theme (the header switch, else the system preference), read reactively: pass
 * `siteTheme.dark` to every chart's `darkMode` so the gallery's charts follow the page.
 */
export const siteTheme = {
  get dark(): boolean {
    subscribe();
    return getTheme() === 'dark';
  },
};
