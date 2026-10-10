/**
 * @file gantt-datasource.ts
 * Paged lazy loader for `<gantry-element>` — the shared `@gantry/core` `PagedLoader`
 * (pages, reset, retries with backoff, `error`) with an `onChange` callback.
 * Angular's `GanttDataSource` wraps the same loader and accepts the same config.
 */

import { type GanttTask, PagedLoader } from '@gantry/core';
import type { GanttDataSourceConfig } from '../types';

export class GanttDataSource<T extends GanttTask = GanttTask> extends PagedLoader<T> {
  /** Called whenever items, loading, `hasMore` or error change. */
  onChange?: (() => void) | undefined;

  constructor(config: GanttDataSourceConfig<T>) {
    super(config);
    this.subscribe(() => this.onChange?.());
  }
}
