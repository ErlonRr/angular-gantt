// ─────────────────────────────────────────────────────────────
//  gantry · datasource/gantt-datasource.ts
//
//  Signal-based lazy data source.
//
//  Two usage patterns:
//
//  ① Static array (no lazy load):
//     const ds = new GanttDataSource({ data: myTasks });
//
//  ② Paged fetcher (lazy load):
//     const ds = new GanttDataSource({
//       fetcher: (page, pageSize) => fetch(`/api/tasks?p=${page}&n=${pageSize}`)
//                                      .then(r => r.json()),
//       pageSize: 30,
//     });
//
//  The component binds to ds.items() — a Signal<GanttTask[]> that grows
//  as pages load. Paging, resets, errors and retries come from the
//  framework-free `PagedLoader` in @gantryjs/core (shared with the Web
//  Component); this class only exposes its state as signals.
//
//  `ɵsubscribe` (private API) hands the chart every load-state change as
//  it happens (previous → next snapshot), so the live-region announcement
//  never depends on when an effect gets to read the signals.
// ─────────────────────────────────────────────────────────────

import { signal, computed, untracked, type Signal } from '@angular/core';
import { PagedLoader, type LoadStateSnapshot } from '@gantryjs/core';

import { type GanttTask } from '../types';

// ─── Config ──────────────────────────────────────────────────

export interface GanttDataSourceConfig<T extends GanttTask = GanttTask> {
  /** Static data — bypasses paging entirely */
  data?: T[];

  /**
   * Async fetcher for paged data.
   * Receives the page (1-based) and pageSize.
   * Must resolve to an array of tasks (fewer than `pageSize` = last page).
   */
  fetcher?: (page: number, pageSize: number) => Promise<T[]>;

  /** Number of items per page (default: 30) */
  pageSize?: number;

  /**
   * First page to load (1-based, default 1). `0` loads nothing until
   * `loadNext()` is called; paging then starts at page 1.
   */
  initialPage?: number;

  /** Automatic retries of a failed page before `error()` is set (default 2) */
  retries?: number;

  /** Delay before the first automatic retry in ms, doubled on each attempt (default 500) */
  retryDelay?: number;
}

// ─── GanttDataSource ─────────────────────────────────────────

export class GanttDataSource<T extends GanttTask = GanttTask> {
  private readonly _loader?: PagedLoader<T>;
  /** Bumped on every loader change — the signals below re-read the loader */
  private readonly _version = signal(0);
  /** Static items (`data`, or `setStatic()` without a fetcher) */
  private readonly _static = signal<T[]>([]);
  /** `ɵsubscribe` listeners */
  private readonly _listeners = new Set<(prev: LoadStateSnapshot, next: LoadStateSnapshot) => void>();
  /** Load state after the last change (`ɵsubscribe`'s previous snapshot) */
  private _state: LoadStateSnapshot;

  // ── Public API signals ──────────────────────────────────────

  /** All loaded tasks — use this as input to GantryComponent */
  readonly items: Signal<T[]>;

  /** True while a fetch (or one of its automatic retries) is in progress */
  readonly isLoading: Signal<boolean>;

  /** True while more pages may be available */
  readonly hasMore: Signal<boolean>;

  /** Total loaded count */
  readonly loadedCount: Signal<number>;

  /** Last page loaded (0 before the first one) */
  readonly page: Signal<number>;

  /** Page the next load requests (the failed page while `error()` is set) */
  readonly nextPage: Signal<number>;

  /** The last fetch failed after its retries (`null` otherwise) — call `retry()` */
  readonly error: Signal<unknown>;

  // ── Constructor ────────────────────────────────────────────

  constructor(config: GanttDataSourceConfig<T> = {}) {
    if (config.data || !config.fetcher) {
      this._static.set(config.data ?? []);
      this.items = this._static.asReadonly();
      this.isLoading = signal(false).asReadonly();
      this.hasMore = signal(false).asReadonly();
      this.loadedCount = computed(() => this._static().length);
      this.page = signal(0).asReadonly();
      this.nextPage = signal(1).asReadonly();
      this.error = signal<unknown>(null).asReadonly();
      this._state = this._snapshot();
      return;
    }

    const loader = new PagedLoader<T>({
      fetcher: config.fetcher,
      pageSize: config.pageSize,
      initialPage: config.initialPage,
      retries: config.retries,
      retryDelay: config.retryDelay,
    });
    this._loader = loader;
    this._state = this._snapshot();
    loader.subscribe(() => {
      this._version.update(v => v + 1);
      this._notify();
    });

    const read = <R>(get: () => R): Signal<R> =>
      computed(() => {
        this._version();
        return get();
      });
    this.items = read(() => loader.items);
    this.isLoading = read(() => loader.isLoading);
    this.hasMore = read(() => loader.hasMore);
    this.loadedCount = read(() => loader.loadedCount);
    this.page = read(() => loader.page);
    this.nextPage = read(() => loader.nextPage);
    this.error = read(() => loader.error);

    if (loader.autoStart) void loader.loadNext();
  }

  // ── Public methods ─────────────────────────────────────────

  /**
   * Load the next page.
   * No-op while loading, when there is no more data, or while `error()` is set.
   */
  loadNext(): Promise<void> {
    return this._loader?.loadNext() ?? Promise.resolve();
  }

  /** Fetch the page that failed again. */
  retry(): Promise<void> {
    return this._loader?.retry() ?? Promise.resolve();
  }

  /** Drop the loaded pages (cancelling a load in flight) and load from the first page again. */
  reset(): Promise<void> {
    return this._loader?.reset() ?? Promise.resolve();
  }

  /**
   * Cancel a load in flight and stop paging for good (as the Web Component's `destroy()`): call it
   * when the source is no longer used. The items stay; `hasMore()` turns false.
   */
  destroy(): void {
    if (!this._loader) return;
    this._loader.destroy();
    this._version.update(v => v + 1);
    this._notify();
    this._listeners.clear();
  }

  /**
   * Replace items with a static array (useful for search/filter results).
   * Disables paging until reset() is called.
   */
  setStatic(items: T[]): void {
    if (this._loader) this._loader.replace(items);
    else {
      this._static.set(items);
      this._notify();
    }
  }

  /**
   * ɵ — private API, not covered by semver: the chart's load-state announcement. `listener` runs
   * synchronously on every change of the items, the loading flag, `hasMore` or the error, with the
   * load state before and after that change. Returns the function that unsubscribes it.
   */
  ɵsubscribe(listener: (prev: LoadStateSnapshot, next: LoadStateSnapshot) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /** The load state now, read from the loader (or the static items) without tracking any signal. */
  private _snapshot(): LoadStateSnapshot {
    const loader = this._loader;
    if (!loader) {
      return { isLoading: false, hasMore: false, error: null, loadedCount: untracked(this._static).length };
    }
    return {
      isLoading: loader.isLoading,
      hasMore: loader.hasMore,
      error: loader.error,
      loadedCount: loader.loadedCount,
    };
  }

  /** Hands the change from the last known state to the current one to every listener. */
  private _notify(): void {
    const prev = this._state;
    const next = this._snapshot();
    this._state = next;
    for (const listener of [...this._listeners]) listener(prev, next);
  }
}

// ─── Factory function ────────────────────────────────────────

/**
 * Create a GanttDataSource. Equivalent to `new GanttDataSource(config)`;
 * kept for code written against earlier versions.
 */
export function createGanttDataSource<T extends GanttTask>(config: GanttDataSourceConfig<T>): GanttDataSource<T> {
  return new GanttDataSource(config);
}
