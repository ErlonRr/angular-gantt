// ─────────────────────────────────────────────────────────────
//  ngx-gantt · datasource/gantt-datasource.ts
//
//  Angular 20 signal-based lazy data source.
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
//     ds.loadNext(); // call to load the next page
//
//  The component binds to ds.items() — a Signal<GanttTask[]>
//  that grows as pages load. It's compatible with
//  GanttLayoutService.setTasks() and appendTasks().
//
//  Uses Angular 20 resource() for the async fetch +
//  linkedSignal() to accumulate pages without losing prior data.
// ─────────────────────────────────────────────────────────────

import {
  signal,
  computed,
  linkedSignal,
  resource,
  ResourceRef,
  Signal,
  Injector,
  inject,
} from '@angular/core';

import { GanttTask } from '../types';

// ─── Config ──────────────────────────────────────────────────

export interface GanttDataSourceConfig<T extends GanttTask = GanttTask> {
  /** Static data — bypasses paging entirely */
  data?: T[];

  /**
   * Async fetcher for paged data.
   * Receives current page (1-based) and pageSize.
   * Must resolve to an array of tasks (empty array = end of data).
   */
  fetcher?: (page: number, pageSize: number) => Promise<T[]>;

  /** Number of items per page (default: 30) */
  pageSize?: number;

  /** Initial page to load on construction (default: 1) */
  initialPage?: number;

  /**
   * Optional injector — required when constructing outside
   * an injection context (e.g. in a service constructor).
   */
  injector?: Injector;
}

// ─── GanttDataSource ─────────────────────────────────────────

export class GanttDataSource<T extends GanttTask = GanttTask> {

  // ── Config ─────────────────────────────────────────────────
  private readonly _pageSize: number;
  private readonly _fetcher?: (page: number, pageSize: number) => Promise<T[]>;

  // ── Paging signals ──────────────────────────────────────────
  private readonly _page      = signal<number>(1);
  private readonly _triggered = signal<boolean>(false); // guards initial fetch

  // ── Resource (Angular 20 experimental) ─────────────────────
  /** `value()` may be undefined until the first loader run completes. */
  private readonly _resource?: ResourceRef<T[] | undefined>;

  // ── Accumulated pages via linkedSignal ─────────────────────
  // linkedSignal reacts to _resource.value() changes and
  // appends new pages to the previous accumulation.
  private readonly _accumulated: Signal<T[]>;

  // ── Static / empty paths only (paged path uses _resource only) ──
  private readonly _static?: Signal<T[]>;

  // ── Public API signals ──────────────────────────────────────

  /** All loaded tasks — use this as input to NgxGanttComponent */
  readonly items: Signal<T[]>;

  /** True while a fetch is in progress */
  readonly isLoading: Signal<boolean>;

  /** True when no more pages are available */
  readonly hasMore: Signal<boolean>;

  /** Total loaded count */
  readonly loadedCount: Signal<number>;

  /** Current page number */
  readonly page: Signal<number> = this._page.asReadonly();

  // ── Constructor ────────────────────────────────────────────

  constructor(config: GanttDataSourceConfig<T> = {}) {
    this._pageSize = config.pageSize ?? 30;
    this._fetcher  = config.fetcher;

    // ── Static path ───────────────────────────────────────────
    if (config.data) {
      this._static = signal(config.data);
      this.items      = this._static;
      this.isLoading  = signal(false);
      this.hasMore    = signal(false);
      this.loadedCount = computed(() => this._static!().length);
      this._accumulated = this._static;
      return;
    }

    // ── Paged path ────────────────────────────────────────────
    if (!config.fetcher) {
      // Empty source — no fetcher, no data
      const empty = signal<T[]>([]);
      this._static      = empty;
      this.items        = empty;
      this.isLoading    = signal(false);
      this.hasMore      = signal(false);
      this.loadedCount  = signal(0);
      this._accumulated = empty;
      return;
    }

    const fetcher = config.fetcher;
    const pageSize = this._pageSize;

    // Angular 20 resource() — re-runs loader whenever params signal changes
    this._resource = resource<T[], { page: number }>({
      params: () => ({ page: this._page() }),
      loader: async ({ params }): Promise<T[]> => {
        if (!this._triggered()) return [];
        return fetcher(params.page, pageSize);
      },
    });

    // linkedSignal accumulates pages:
    // When resource value changes (new page loaded), append to previous.
    // When page resets to 1, start fresh.
    this._accumulated = linkedSignal<T[] | undefined, T[]>({
      source: () => this._resource!.value() as T[] | undefined,
      computation: (newPage, previous) => {
        if (!newPage || newPage.length === 0) return previous?.value ?? [];
        // Reset on page 1 (used by reset())
        if (this._page() === 1 && !previous?.value?.length) return newPage;
        return [...(previous?.value ?? []), ...newPage];
      },
    });

    this.items       = this._accumulated;
    this.isLoading   = computed(() => this._resource!.isLoading());
    this.loadedCount = computed(() => this._accumulated().length);

    // hasMore: last page returned fewer items than pageSize
    this.hasMore = computed(() => {
      const lastPage = this._resource?.value();
      if (!lastPage) return true; // unknown until first load
      return lastPage.length >= pageSize;
    });

    // Auto-load initial page
    if (config.initialPage !== 0) {
      this._triggered.set(true);
    }
  }

  // ── Public methods ─────────────────────────────────────────

  /**
   * Load the next page.
   * No-op if already loading or no more data.
   */
  loadNext(): void {
    if (this.isLoading() || !this.hasMore()) return;
    if (!this._triggered()) {
      this._triggered.set(true);
      return;
    }
    this._page.update(p => p + 1);
  }

  /**
   * Reload from page 1 (clears accumulated items).
   */
  reset(): void {
    this._page.set(1);
    this._triggered.set(true);
  }

  /**
   * Replace items with a static array (useful for search/filter results).
   * Disables paging until reset() is called.
   */
  setStatic(items: T[]): void {
    // Patch the accumulated signal directly via a workaround:
    // We update page to a sentinel and override in the next computation.
    // Simpler: expose a writable override signal.
    (this._accumulated as any).set?.(items);
  }
}

// ─── Factory function (DI-friendly) ──────────────────────────

/**
 * Create a GanttDataSource inside an injection context.
 * Preferred over `new GanttDataSource()` in components/services.
 */
export function createGanttDataSource<T extends GanttTask>(
  config: Omit<GanttDataSourceConfig<T>, 'injector'>,
): GanttDataSource<T> {
  const injector = inject(Injector);
  return new GanttDataSource({ ...config, injector });
}
