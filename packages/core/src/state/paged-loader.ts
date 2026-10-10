// ─────────────────────────────────────────────────────────────
//  gantry · state/paged-loader.ts
//  Framework-free paged loader behind every binding's `GanttDataSource`:
//  pages, resets (generations), errors and retries with exponential backoff.
// ─────────────────────────────────────────────────────────────

export interface PagedLoaderConfig<T> {
  /** Async fetcher for page `page` (1-based). Fewer than `pageSize` items = last page. */
  fetcher: (page: number, pageSize: number) => Promise<T[]>;
  /** Items per page (default 30) */
  pageSize?: number;
  /**
   * First page to load (1-based, default 1). `0` loads nothing until `loadNext()`
   * is called; paging then starts at page 1.
   */
  initialPage?: number;
  /** Automatic retries of a failed page before `error` is set (default 2) */
  retries?: number;
  /** Delay before the first automatic retry in ms, doubled on each attempt (default 500) */
  retryDelay?: number;
}

export const DEFAULT_PAGE_SIZE = 30;

export class PagedLoader<T> {
  readonly pageSize: number;
  /** Whether the first page loads without an explicit `loadNext()` (`initialPage !== 0`) */
  readonly autoStart: boolean;

  private readonly startPage: number;
  private _nextPage: number;
  private _page = 0;
  private generation = 0;
  private inflight: Promise<void> | null = null;
  private _items: T[] = [];
  private _isLoading = false;
  private _hasMore = true;
  private _error: unknown = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly config: PagedLoaderConfig<T>) {
    this.pageSize = Math.max(1, Math.floor(config.pageSize ?? DEFAULT_PAGE_SIZE));
    this.autoStart = config.initialPage !== 0;
    this.startPage = Math.max(1, Math.floor(config.initialPage || 1));
    this._nextPage = this.startPage;
  }

  get items(): T[] {
    return this._items;
  }
  get isLoading(): boolean {
    return this._isLoading;
  }
  get hasMore(): boolean {
    return this._hasMore;
  }
  get loadedCount(): number {
    return this._items.length;
  }
  /** Last failure once the automatic retries are exhausted; `null` otherwise. */
  get error(): unknown {
    return this._error;
  }
  /** Page the next `loadNext()` requests (also the page that failed while `error` is set). */
  get nextPage(): number {
    return this._nextPage;
  }
  /** Last page loaded, 0 before the first one. */
  get page(): number {
    return this._page;
  }

  /** Listen to every change of items, loading, `hasMore` or error. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Fetch the next page. No-op (resolving with the in-flight load, if any) while
   * loading, when exhausted, or while `error` is set — use `retry()` then.
   */
  loadNext(): Promise<void> {
    if (this.inflight) return this.inflight;
    if (!this._hasMore || this._error !== null) return Promise.resolve();
    const run = this.fetchPage().finally(() => {
      if (this.inflight === run) this.inflight = null;
    });
    this.inflight = run;
    return run;
  }

  /** Clear the error and fetch the failed page again. */
  retry(): Promise<void> {
    if (this._error === null) return this.inflight ?? Promise.resolve();
    this._error = null;
    return this.loadNext();
  }

  /** Drop every loaded page (cancelling any load in flight) and load from the first page again. */
  reset(): Promise<void> {
    this.restart(true);
    return this.loadNext();
  }

  /** Replace the items with a static list and stop paging until `reset()`. */
  replace(items: T[]): void {
    this.restart(false);
    this._items = items;
    this.notify();
  }

  /** Cancel any load in flight, stop paging and drop the listeners. */
  destroy(): void {
    this.generation++;
    this.inflight = null;
    this._hasMore = false;
    this.listeners.clear();
  }

  private restart(hasMore: boolean): void {
    this.generation++;
    this.inflight = null;
    this._items = [];
    this._nextPage = this.startPage;
    this._page = 0;
    this._hasMore = hasMore;
    this._isLoading = false;
    this._error = null;
  }

  private async fetchPage(): Promise<void> {
    const gen = this.generation;
    const page = this._nextPage;
    const retries = Math.max(0, this.config.retries ?? 2);
    const delay = Math.max(0, this.config.retryDelay ?? 500);
    this._isLoading = true;
    this.notify();

    for (let attempt = 0; ; attempt++) {
      try {
        const batch: unknown = await this.config.fetcher(page, this.pageSize);
        if (gen !== this.generation) return;
        if (!Array.isArray(batch)) throw new TypeError(`[gantry] fetcher must resolve to an array (page ${page})`);
        this._items = this._items.concat(batch);
        this._page = page;
        this._nextPage = page + 1;
        this._hasMore = batch.length >= this.pageSize;
        break;
      } catch (err) {
        if (gen !== this.generation) return;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay * 2 ** attempt));
          if (gen !== this.generation) return;
          continue;
        }
        this._error = err;
        break;
      }
    }
    this._isLoading = false;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
