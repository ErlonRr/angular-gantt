import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { getTheme, initTheme, onThemeChange, toggleTheme, type SiteTheme } from 'demo-kit/theme';

/**
 * The site's light/dark theme (`demo-kit/theme`: stored choice, else the system preference) as
 * signals. Every chart binds `[darkMode]="theme.isDark()"`, so the header toggle themes the
 * page and the charts together.
 */
@Injectable({ providedIn: 'root' })
export class AppThemeService {
  private readonly _theme = signal<SiteTheme>(initTheme());

  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    const off = onThemeChange(t => this._theme.set(t));
    inject(DestroyRef).onDestroy(off);
    this._theme.set(getTheme());
  }

  toggle(): void {
    toggleTheme();
  }
}
