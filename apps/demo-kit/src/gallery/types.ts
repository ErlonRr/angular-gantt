/**
 * What a case module gives the generic renderer: the charts of the case in their first state, as
 * props every binding understands. Each framework app draws them with its own chart until its
 * idiomatic case file exists (and the e2e smoke test reads the same `ready` either way).
 */

import type { GanttAnnotation, GanttOptions, GanttResource, GanttSyncOptions, GanttTask } from '@gantryjs/core';

/** A paged source: each binding wraps it in its own `GanttDataSource`. */
export interface GalleryDataSourceConfig {
  fetcher: (page: number, pageSize: number) => Promise<GanttTask[]>;
  pageSize: number;
}

/** One chart of a case. Unset props keep the chart's defaults. */
export interface GalleryChart {
  /** Caption above the chart when a case has several (the accessible name is `options.labels.ariaChart`) */
  caption?: string;
  tasks: GanttTask[];
  options: GanttOptions;
  annotations?: GanttAnnotation[];
  /** The `resources` property of a resource case (what the tasks' `resources` assignments refer to) */
  resources?: GanttResource[];
  /** Instead of `tasks` */
  dataSource?: GalleryDataSourceConfig;
  showToolbar?: boolean;
  showLegend?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
}

export interface GalleryCaseData {
  /** The charts of the case in their first state, for `now` */
  charts(now?: Date): GalleryChart[];
  /** The charts share one `createGanttSyncGroup(sync)` (`true` = every part) */
  sync?: true | GanttSyncOptions;
}

/** A choice of a case control (a select, a segmented control or radios). */
export interface GalleryChoice<T extends string | number = string> {
  value: T;
  label: string;
}
