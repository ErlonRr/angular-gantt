/**
 * @file gantt-theme.service.ts
 * Vanilla JS theme service: resolves light/dark + overrides (palettes live in
 * @gantry/core) and mirrors the result as CSS custom properties on the host.
 */

import { GanttTheme, LightTheme, DarkTheme, THEME_CSS_VARS, resolveTheme } from '@gantry/core';
import { createState } from '../core/state';

export { LightTheme, DarkTheme };

export class GanttThemeService {
  private readonly _darkMode = createState<boolean | 'auto'>(false);
  private readonly _prefersDark = createState<boolean>(false);
  /** From `options.theme` — replaced on every options assignment */
  private readonly _optionsTheme = createState<Partial<GanttTheme>>({});
  /** From `setTheme()` / `patchTheme()` — survives options changes */
  private readonly _apiTheme = createState<Partial<GanttTheme>>({});

  private _hostEl?: HTMLElement;
  private _mql?: MediaQueryList;
  private _mqlCb?: (e: MediaQueryListEvent) => void;
  private _unsubscribe: Array<() => void> = [];

  get resolvedTheme(): Required<GanttTheme> {
    return resolveTheme(this.isDark, { ...this._optionsTheme(), ...this._apiTheme() });
  }

  get isDark(): boolean {
    const mode = this._darkMode();
    return mode === 'auto' ? this._prefersDark() : mode === true;
  }

  /** Bind to the host element (call once connected). */
  init(hostEl: HTMLElement, initialDarkMode: boolean | 'auto' = false): void {
    this._hostEl = hostEl;
    this.setDarkMode(initialDarkMode);
    const update = () => this.apply();
    this._unsubscribe = [this._darkMode, this._prefersDark, this._optionsTheme, this._apiTheme].map(s =>
      (s as typeof this._darkMode).subscribe(update as never),
    );
  }

  setDarkMode(mode: boolean | 'auto'): void {
    this._darkMode.set(mode);
    if (mode === 'auto') this._setupMQL();
    else this._teardownMQL();
  }

  setOptionsTheme(theme: Partial<GanttTheme> | undefined): void {
    this._optionsTheme.set(theme ?? {});
  }

  patchTheme(patch: Partial<GanttTheme>): void {
    this._apiTheme.update(cur => ({ ...cur, ...patch }));
  }

  /** Replace the API overrides (`setTheme`). */
  setTheme(theme: Partial<GanttTheme>): void {
    this._apiTheme.set({ ...theme });
  }

  resetTheme(): void {
    this._apiTheme.set({});
  }

  private apply(): void {
    const el = this._hostEl;
    if (!el) return;
    const theme = this.resolvedTheme;
    for (const [key, cssVar] of THEME_CSS_VARS) el.style.setProperty(cssVar, String(theme[key]));
    el.dataset['theme'] = this.isDark ? 'dark' : 'light';
  }

  private _setupMQL(): void {
    if (typeof window === 'undefined' || !window.matchMedia || this._mql) return;
    this._mql = window.matchMedia('(prefers-color-scheme: dark)');
    this._prefersDark.set(this._mql.matches);
    this._mqlCb = e => this._prefersDark.set(e.matches);
    this._mql.addEventListener('change', this._mqlCb);
  }

  private _teardownMQL(): void {
    if (!this._mql || !this._mqlCb) return;
    this._mql.removeEventListener('change', this._mqlCb);
    this._mql = undefined;
    this._mqlCb = undefined;
  }

  destroy(): void {
    this._teardownMQL();
    this._unsubscribe.forEach(fn => fn());
    this._unsubscribe = [];
  }
}
