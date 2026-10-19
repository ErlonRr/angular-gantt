import { computed, shallowRef, type ComputedRef } from 'vue';
import { getTheme, onThemeChange } from 'demo-kit/theme';

// One subscription for the whole app (the page lives as long as it)
const theme = shallowRef(getTheme());
onThemeChange(t => (theme.value = t));

/**
 * Whether the site shows its dark theme (the header switch, else the system preference): bind it
 * to every chart's `dark-mode` so the gallery's charts follow the page.
 */
export function useDarkMode(): ComputedRef<boolean> {
  return computed(() => theme.value === 'dark');
}
