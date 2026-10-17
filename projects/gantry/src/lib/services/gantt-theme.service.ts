// ─────────────────────────────────────────────────────────────
//  gantry · services/gantt-theme.service.ts  (v2 — complete)
//
//  Full theme pipeline:
//
//   GANTT_GLOBAL_CONFIG token
//         │
//         ▼
//   _darkMode + _prefersDark + _customOverride  (signals)
//         │
//         ▼
//   resolvedTheme (computed) ──► applyThemeToDom(hostEl) via effect()
//
//  CSS custom properties injected onto the gantt host element.
//  Multiple gantt instances can have different themes.
// ─────────────────────────────────────────────────────────────

import {
  Injectable,
  signal,
  computed,
  effect,
  DestroyRef,
  inject,
  Injector,
  runInInjectionContext,
  InjectionToken,
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { type GanttTheme, type GanttThemeOverrides, type GanttLabels, type GanttFormats } from '../types';
import { LightTheme, DarkTheme, LegacyLightTheme, LegacyDarkTheme, resolveTheme, themeToCss } from '@gantry/core';

// ─── Built-in themes (shared with the Web Component via @gantry/core) ──

export { LightTheme, DarkTheme, LegacyLightTheme, LegacyDarkTheme };

// ─── Config token ─────────────────────────────────────────────

export interface GanttGlobalConfig {
  theme?: GanttThemeOverrides;
  darkMode?: boolean | 'auto';
  /** Default BCP 47 locale (e.g. 'it'), formatted through Intl */
  locale?: string;
  /** Default UI string overrides (i18n) */
  labels?: Partial<GanttLabels>;
  /** Default date / header format overrides */
  formats?: Partial<GanttFormats>;
}

export const GANTT_GLOBAL_CONFIG = new InjectionToken<GanttGlobalConfig>('GANTT_GLOBAL_CONFIG', {
  factory: () => ({}),
});

export function provideGantt(config: GanttGlobalConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: GANTT_GLOBAL_CONFIG, useValue: config }]);
}

/** Every `--gantt-*` token of the theme, the bar-label contrast tokens included (`themeToCss`). */
function applyThemeToDom(el: HTMLElement, theme: Required<GanttTheme>): void {
  for (const [cssVar, value] of themeToCss(theme)) el.style.setProperty(cssVar, String(value));
}

// ─── Service ─────────────────────────────────────────────────

@Injectable()
export class GanttThemeService {
  private readonly globalConfig = inject(GANTT_GLOBAL_CONFIG, { optional: true }) ?? {};
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly _darkMode = signal<boolean | 'auto'>(this.globalConfig.darkMode ?? false);
  private readonly _prefersDark = signal<boolean>(false);
  /** From `[options].theme` — replaced whenever the options change */
  private readonly _optionsTheme = signal<GanttThemeOverrides>({});
  /** From `setTheme()` / `patchTheme()` — survives options changes */
  private readonly _customOverride = signal<GanttThemeOverrides>({});

  // ── Computed resolved theme ───────────────────────────────
  /** Light/dark base ← global config ← `options.theme` ← API overrides */
  readonly resolvedTheme = computed<Required<GanttTheme>>(() =>
    resolveTheme(this.isDark(), { ...this.globalConfig.theme, ...this._optionsTheme(), ...this._customOverride() }),
  );

  readonly isDark = computed(() => {
    const mode = this._darkMode();
    return mode === 'auto' ? this._prefersDark() : mode === true;
  });

  private _mql?: MediaQueryList;
  private _mqlCb?: (e: MediaQueryListEvent) => void;
  private _hostEl?: HTMLElement;

  // ── Init ─────────────────────────────────────────────────

  init(hostEl: HTMLElement): void {
    this._hostEl = hostEl;
    if (this._darkMode() === 'auto') this._setupMQL();

    // init() runs from ngOnInit — not an injection context; effect() requires one.
    runInInjectionContext(this.injector, () => {
      effect(() => {
        if (this._hostEl) {
          applyThemeToDom(this._hostEl, this.resolvedTheme());
          this._hostEl.dataset['theme'] = this.isDark() ? 'dark' : 'light';
        }
      });
    });

    this.destroyRef.onDestroy(() => this._teardownMQL());
  }

  // ── Public API ────────────────────────────────────────────

  setDarkMode(mode: boolean | 'auto'): void {
    this._darkMode.set(mode);
    if (mode === 'auto') this._setupMQL();
    else this._teardownMQL();
  }

  setOptionsTheme(theme: GanttThemeOverrides | undefined): void {
    this._optionsTheme.set(theme ?? {});
  }

  patchTheme(patch: GanttThemeOverrides): void {
    this._customOverride.update(cur => ({ ...cur, ...patch }));
  }

  setCustomTheme(override: GanttThemeOverrides): void {
    this._customOverride.set(override);
  }

  resetTheme(): void {
    this._customOverride.set({});
  }

  token<K extends keyof GanttTheme>(key: K): GanttTheme[K] {
    return this.resolvedTheme()[key];
  }

  // ── MQL ───────────────────────────────────────────────────

  private _setupMQL(): void {
    if (typeof window === 'undefined' || this._mql) return;
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
}
