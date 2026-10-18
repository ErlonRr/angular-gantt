// ─────────────────────────────────────────────────────────────
//  gantry · services/gantt-theme.service.ts
//
//  The chart's theme as pure signals (no DOM writes, no effect):
//
//   GANTT_GLOBAL_CONFIG.theme ─┐
//   options.theme ─────────────┼─► resolvedTheme ─► style (every `--gantt-*` token)
//   setTheme() / patchTheme() ─┘        ▲
//   options.darkMode ?? [darkMode] ?? global darkMode ─► isDark
//                       ('auto' follows prefers-color-scheme)
//
//  GantryComponent binds its inputs once (`bind()`) and paints `style()`
//  and `isDark()` on its host (`[style]`, `.gantry-dark`), so the tokens
//  are rendered on the server too. Every instance has its own theme.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, inject, afterNextRender, DestroyRef, DOCUMENT } from '@angular/core';
import { type GanttTheme, type GanttThemeOverrides, type GanttOptions } from '../types';
import { resolveTheme, themeToCss } from '@gantryjs/core';
import { GANTT_GLOBAL_CONFIG } from '../global-config';

/** What GantryComponent binds once: its `options` and `darkMode` inputs. */
export interface GanttThemeSources {
  readonly options: () => Pick<GanttOptions, 'theme' | 'darkMode'>;
  readonly darkMode: () => boolean | 'auto' | undefined;
}

/** Two resolved themes with the same value for every key (a re-assigned equal `options.theme`). */
function sameTheme(a: Required<GanttTheme>, b: Required<GanttTheme>): boolean {
  const keys = Object.keys(a) as (keyof GanttTheme)[];
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
}

// ─── Service ─────────────────────────────────────────────────

@Injectable()
export class GanttThemeService {
  private readonly globalConfig = inject(GANTT_GLOBAL_CONFIG, { optional: true }) ?? {};
  private readonly sources = signal<GanttThemeSources | null>(null);
  /** From `setTheme()` / `patchTheme()`: on top of `options.theme`, survives options changes */
  private readonly apiTheme = signal<GanttThemeOverrides>({});

  /** `prefers-color-scheme: dark`, followed in the browser from the first render on */
  readonly prefersDark = signal(false);

  /** Effective mode: `options.darkMode`, else the `darkMode` input, else the global config, else light */
  readonly darkMode = computed<boolean | 'auto'>(() => {
    const src = this.sources();
    return src?.options().darkMode ?? src?.darkMode() ?? this.globalConfig.darkMode ?? false;
  });

  readonly isDark = computed(() => {
    const mode = this.darkMode();
    return mode === 'auto' ? this.prefersDark() : mode === true;
  });

  /** Light/dark base ← global config ← `options.theme` ← API overrides (equal values keep the object) */
  readonly resolvedTheme = computed<Required<GanttTheme>>(
    () =>
      resolveTheme(this.isDark(), {
        ...this.globalConfig.theme,
        ...this.sources()?.options().theme,
        ...this.apiTheme(),
      }),
    { equal: sameTheme },
  );

  /** Every `--gantt-*` token of the theme, the derived contrast tokens included (`themeToCss`), for a `[style]` binding */
  readonly style = computed<Record<string, string>>(() => Object.fromEntries(themeToCss(this.resolvedTheme())));

  constructor() {
    const doc = inject(DOCUMENT);
    const destroyRef = inject(DestroyRef);
    // Browser only (never on the server): follow the colour scheme while the chart lives
    afterNextRender(() => {
      const win = doc.defaultView;
      if (!win || !('matchMedia' in win)) return;
      const mql = win.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (e: { readonly matches: boolean }) => this.prefersDark.set(e.matches);
      onChange(mql);
      mql.addEventListener('change', onChange);
      destroyRef.onDestroy(() => mql.removeEventListener('change', onChange));
    });
  }

  /** Bind the chart's inputs (once, from GantryComponent's constructor). */
  bind(sources: GanttThemeSources): void {
    this.sources.set(sources);
  }

  // ── Public API ────────────────────────────────────────────

  patchTheme(patch: GanttThemeOverrides): void {
    this.apiTheme.update(cur => ({ ...cur, ...patch }));
  }

  setCustomTheme(override: GanttThemeOverrides): void {
    this.apiTheme.set(override);
  }

  /** Drop the `setTheme()` / `patchTheme()` overrides (`options.theme` and the global theme stay). */
  resetTheme(): void {
    this.apiTheme.set({});
  }

  token<K extends keyof GanttTheme>(key: K): GanttTheme[K] {
    return this.resolvedTheme()[key];
  }
}
