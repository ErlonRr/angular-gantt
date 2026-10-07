/**
 * @file gantt-datasource.ts
 * Paged lazy loader for `<gantry-element>` — framework-free counterpart of
 * Angular's `GanttDataSource`, accepting the same `{ fetcher, pageSize }` config.
 */

import { GanttTask } from '@gantry/core';
import type { GanttDataSourceConfig } from '../types';

const DEFAULT_PAGE_SIZE = 30;

export class GanttDataSource<T extends GanttTask = GanttTask> {
  private readonly pageSize: number;
  private page = 0;
  private generation = 0;
  private _items: T[] = [];
  private _isLoading = false;
  private _hasMore = true;
  private _error: unknown = null;

  /** Called whenever items or loading state change. */
  onChange?: () => void;

  constructor(private readonly config: GanttDataSourceConfig<T>) {
    this.pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  get items(): T[] { return this._items; }
  get isLoading(): boolean { return this._isLoading; }
  get hasMore(): boolean { return this._hasMore; }
  get loadedCount(): number { return this._items.length; }
  get error(): unknown { return this._error; }

  /** Fetch the next page (no-op while loading or when exhausted). */
  async loadNext(): Promise<void> {
    if (this._isLoading || !this._hasMore) return;
    const gen = this.generation;
    this._isLoading = true;
    this._error = null;
    this.onChange?.();
    try {
      const batch = await this.config.fetcher(this.page + 1, this.pageSize);
      if (gen !== this.generation) return; // reset() while in flight
      this.page++;
      this._items = [...this._items, ...batch];
      this._hasMore = batch.length >= this.pageSize;
    } catch (err) {
      if (gen !== this.generation) return;
      this._error = err;
      console.error('[gantry] data source fetch failed:', err);
    } finally {
      if (gen === this.generation) {
        this._isLoading = false;
        this.onChange?.();
      }
    }
  }

  /** Drop loaded pages and start again from page 1. */
  reset(): Promise<void> {
    this.generation++;
    this.page = 0;
    this._items = [];
    this._hasMore = true;
    this._isLoading = false;
    this._error = null;
    return this.loadNext();
  }
}
