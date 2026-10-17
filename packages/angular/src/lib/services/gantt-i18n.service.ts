// ─────────────────────────────────────────────────────────────
//  gantry · services/gantt-i18n.service.ts
//
//  Per-instance i18n / formatting config. Resolves the effective
//  locale, UI labels and date/header formats by merging, in order:
//    DEFAULT_*  ←  provideGantt({ ... }) (merged along the injector levels)  ←  [options] (instance)
//  Pure signals: GantryComponent binds its `options` once (`bind()`).
//  Presentational components inject this; the pure functions in
//  @gantry/core receive `{ locale, labels, formats }` as params.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, inject } from '@angular/core';

import {
  type GanttLabels,
  type GanttFormats,
  type GanttOptions,
  type GanttI18n,
  DEFAULT_LABELS,
  DEFAULT_FORMATS,
} from '../types';
import { GANTT_GLOBAL_CONFIG } from '../global-config';

type I18nOptions = Pick<GanttOptions, 'locale' | 'labels' | 'formats'>;

@Injectable()
export class GanttI18nService {
  private readonly globalConfig = inject(GANTT_GLOBAL_CONFIG);
  private readonly options = signal<(() => I18nOptions) | null>(null);

  // The per-instance overrides, compared by reference: re-assigning `options` with the same
  // locale / labels / formats objects recomputes nothing downstream
  private readonly ownLocale = computed(() => this.options()?.().locale);
  private readonly ownLabels = computed(() => this.options()?.().labels);
  private readonly ownFormats = computed(() => this.options()?.().formats);

  /** Effective BCP 47 locale (undefined → 'en'). */
  readonly locale = computed<string | undefined>(() => this.ownLocale() ?? this.globalConfig.locale);

  /** Effective, fully-populated UI labels. */
  readonly labels = computed<GanttLabels>(() => {
    const own = this.ownLabels();
    return {
      ...DEFAULT_LABELS,
      ...this.globalConfig.labels,
      ...own,
      // nested record — merge instead of replace
      viewModes: {
        ...DEFAULT_LABELS.viewModes,
        ...this.globalConfig.labels?.viewModes,
        ...own?.viewModes,
      },
    };
  });

  /** Effective date / header formats. */
  readonly formats = computed<GanttFormats>(() => {
    const own = this.ownFormats();
    return {
      ...DEFAULT_FORMATS,
      ...this.globalConfig.formats,
      ...own,
      header: {
        ...this.globalConfig.formats?.header,
        ...own?.header,
      },
    };
  });

  /** Convenience bundle for the pure formatters. */
  readonly bundle = computed<GanttI18n>(() => ({
    locale: this.locale(),
    labels: this.labels(),
    formats: this.formats(),
  }));

  /** Bind the chart's `options` (once, from GantryComponent's constructor). */
  bind(options: () => I18nOptions): void {
    this.options.set(options);
  }
}
