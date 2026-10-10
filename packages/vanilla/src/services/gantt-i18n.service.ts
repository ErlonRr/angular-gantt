/**
 * @file gantt-i18n.service.ts
 * Vanilla JS i18n & localization service.
 */

import {
  type GanttLabels,
  type GanttFormats,
  type GanttOptions,
  type GanttI18n,
  DEFAULT_LABELS,
  DEFAULT_FORMATS,
} from '@gantry/core';
import { createState } from '../core/state';

export class GanttI18nService {
  private readonly _locale = createState<string | undefined>(undefined);
  private readonly _labels = createState<Partial<GanttLabels>>({});
  private readonly _formats = createState<Partial<GanttFormats>>({});

  get locale(): string | undefined {
    return this._locale();
  }

  get labels(): GanttLabels {
    const custom = this._labels();
    return {
      ...DEFAULT_LABELS,
      ...custom,
      viewModes: {
        ...DEFAULT_LABELS.viewModes,
        ...custom.viewModes,
      },
    };
  }

  get formats(): GanttFormats {
    const custom = this._formats();
    return {
      ...DEFAULT_FORMATS,
      ...custom,
      header: {
        ...DEFAULT_FORMATS.header,
        ...custom.header,
      },
    };
  }

  get bundle(): GanttI18n {
    return {
      locale: this.locale,
      labels: this.labels,
      formats: this.formats,
    };
  }

  setLocale(locale: string | undefined): void {
    this._locale.set(locale);
  }

  apply(opts: GanttOptions): void {
    this._locale.set(opts.locale);
    this._labels.set(opts.labels ?? {});
    this._formats.set(opts.formats ?? {});
  }
}
