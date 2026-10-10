// ─────────────────────────────────────────────────────────────
//  gantry · services/gantt-i18n.service.ts
//
//  Per-instance i18n / formatting config. Resolves the effective
//  locale, UI labels and date/header formats by merging, in order:
//    DEFAULT_*  ←  provideGanttLib({ ... }) (global)  ←  [options] (instance)
//  Presentational components inject this; the pure functions in
//  gantt-math.ts receive `{ locale, labels, formats }` as params.
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
import { GANTT_GLOBAL_CONFIG } from './gantt-theme.service';

@Injectable()
export class GanttI18nService {
  private readonly globalConfig = inject(GANTT_GLOBAL_CONFIG);

  private readonly _locale = signal<string | undefined>(undefined);
  private readonly _labels = signal<Partial<GanttLabels>>({});
  private readonly _formats = signal<Partial<GanttFormats>>({});

  /** Effective BCP 47 locale (undefined → 'en'). */
  readonly locale = computed<string | undefined>(() => this._locale() ?? this.globalConfig.locale);

  /** Effective, fully-populated UI labels. */
  readonly labels = computed<GanttLabels>(() => ({
    ...DEFAULT_LABELS,
    ...this.globalConfig.labels,
    ...this._labels(),
    // nested record — merge instead of replace
    viewModes: {
      ...DEFAULT_LABELS.viewModes,
      ...this.globalConfig.labels?.viewModes,
      ...this._labels().viewModes,
    },
  }));

  /** Effective date / header formats. */
  readonly formats = computed<GanttFormats>(() => ({
    ...DEFAULT_FORMATS,
    ...this.globalConfig.formats,
    ...this._formats(),
    header: {
      ...this.globalConfig.formats?.header,
      ...this._formats().header,
    },
  }));

  /** Convenience bundle for the pure formatters. */
  readonly bundle = computed<GanttI18n>(() => ({
    locale: this.locale(),
    labels: this.labels(),
    formats: this.formats(),
  }));

  /** Apply the per-instance overrides coming from `[options]`. */
  apply(opts: GanttOptions): void {
    this._locale.set(opts.locale);
    this._labels.set(opts.labels ?? {});
    this._formats.set(opts.formats ?? {});
  }
}
