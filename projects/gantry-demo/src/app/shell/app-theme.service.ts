// ─────────────────────────────────────────────────────────────
//  gantry-demo · shell/app-theme.service.ts
//
//  Single source of truth for the app's light/dark/auto mode.
//  Drives BOTH the shell tokens (`data-theme` on <html>) and the
//  `[darkMode]` input of every <gantry> — so the toolbar toggle
//  themes the shell and the chart in one shot.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, effect, DestroyRef, inject } from '@angular/core';

/** `true` = dark, `false` = light, `'auto'` = follow OS preference */
export type ThemeMode = boolean | 'auto';

const STORAGE_KEY = 'gantry-theme';

@Injectable({ providedIn: 'root' })
export class AppThemeService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _mode = signal<ThemeMode>(this._load());
  /** Bind this to `<gantry [darkMode]>`. */
  readonly mode = this._mode.asReadonly();

  private readonly _systemDark = signal<boolean>(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
  );

  /** Resolved boolean — what the UI actually shows right now. */
  readonly isDark = computed<boolean>(() => {
    const m = this._mode();
    return m === 'auto' ? this._systemDark() : m;
  });

  /** Short label for the toggle button. */
  readonly label = computed<string>(() => {
    const m = this._mode();
    return m === 'auto' ? 'Auto' : m ? 'Dark' : 'Light';
  });

  constructor() {
    // Follow the OS preference while in 'auto'
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => this._systemDark.set(e.matches);
      mq.addEventListener('change', handler);
      this.destroyRef.onDestroy(() => mq.removeEventListener('change', handler));
    }

    // Reflect the resolved theme onto <html> for the shell tokens
    effect(() => {
      if (typeof document === 'undefined') return;
      document.documentElement.dataset['theme'] = this.isDark() ? 'dark' : 'light';
    });
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this._save(mode);
  }

  /** Cycle Light → Dark → Auto → Light. */
  cycle(): void {
    const m = this._mode();
    this.setMode(m === false ? true : m === true ? 'auto' : false);
  }

  private _load(): ThemeMode {
    if (typeof localStorage === 'undefined') return 'auto';
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark') return true;
    if (v === 'light') return false;
    return 'auto';
  }

  private _save(mode: ThemeMode): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, mode === 'auto' ? 'auto' : mode ? 'dark' : 'light');
  }
}
