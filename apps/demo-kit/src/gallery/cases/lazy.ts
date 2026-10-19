/**
 * Case `lazy`: tasks that arrive page by page from a slow fake API. A switch makes the API fail:
 * the data source retries on its own, then the chart offers Retry (`dataSource.retry()`).
 */

import type { GanttOptions, GanttTask, PagedLoaderConfig } from '@gantryjs/core';
import { createFakeTaskApi, type FakeTaskApi } from '../data';
import type { GalleryCaseData } from '../types';

/** Tasks on the fake server */
export const LAZY_TOTAL = 200;
export const LAZY_PAGE_SIZE = 25;
/** Delay of every answer, in ms */
export const LAZY_LATENCY = 600;
/** Automatic retries of a failed page before the chart offers Retry */
export const LAZY_RETRIES = 2;

export const LAZY_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  labels: { ariaChart: 'Support tickets' },
};

/** A fresh fake API (`api.setFail(true)` makes the next requests fail). */
export function createLazyApi(now?: Date): FakeTaskApi {
  return createFakeTaskApi({ total: LAZY_TOTAL, latency: LAZY_LATENCY, ...(now ? { now } : {}) });
}

/**
 * The data-source config, the same in every binding: `new GanttDataSource(lazySource(api))` from
 * `@gantryjs/angular`, or from the Web Component (re-exported by React, Vue and Svelte).
 */
export function lazySource(api: FakeTaskApi): PagedLoaderConfig<GanttTask> {
  return { fetcher: api.fetcher, pageSize: LAZY_PAGE_SIZE, retries: LAZY_RETRIES, retryDelay: 400 };
}

/** What the status line reads from the data source: its getters, or Angular's signals. */
export interface LazyLoadState {
  readonly loadedCount: number;
  readonly isLoading: boolean;
  readonly hasMore: boolean;
  /** The failure once the retries are exhausted, `null` otherwise */
  readonly error: unknown;
  /** The page loading next (the failed one while `error` is set) */
  readonly nextPage: number;
}

/** The status line under the chart, the same in every binding. */
export function lazyStatus(state: LazyLoadState): string {
  const loaded = `${state.loadedCount} of ${LAZY_TOTAL} tasks loaded`;
  if (state.error !== null && state.error !== undefined) {
    const page = `Page ${state.nextPage} failed after ${LAZY_RETRIES} retries`;
    return `${loaded}. ${page}: turn off Fail requests, then press Retry.`;
  }
  if (state.isLoading) return `${loaded}, loading page ${state.nextPage}…`;
  return state.hasMore ? `${loaded}: scroll down for more.` : `${loaded}.`;
}

export const lazyCase: GalleryCaseData = {
  charts: now => {
    const api = createLazyApi(now);
    return [{ tasks: [], options: LAZY_OPTIONS, dataSource: { fetcher: api.fetcher, pageSize: LAZY_PAGE_SIZE } }];
  },
};
