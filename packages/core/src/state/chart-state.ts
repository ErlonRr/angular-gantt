// ─────────────────────────────────────────────────────────────
//  gantry · state/chart-state.ts
//  Chart state (ready / loading / empty / error) and the loading
//  skeleton rows (step 2.6). Both bindings paint `resolveChartState()`
//  as is:
//
//    div.gantt-state.gantt-state--loading|--error|--empty   (attached while not 'ready')
//      loading → div.gantt-skeleton[aria-hidden] > div.gantt-skeleton-row
//                  > span.gantt-skeleton-name + span.gantt-skeleton-bar   (skeletonRows)
//      error   → div.gantt-state-box[role=alert]
//                  > p.gantt-state-title + p.gantt-state-message + button.gantt-state-retry
//      empty   → div.gantt-state-box > slot[name=empty] | [ganttEmpty] | p.gantt-state-message
// ─────────────────────────────────────────────────────────────

import { DEFAULT_LABELS, type GanttLabels } from '../types';
import type { LoadStateSnapshot } from '../interaction/announce';

/** Strings the chart states read (part of `GanttLabels`). */
export type ChartStateLabels = Pick<GanttLabels, 'loading' | 'loadError' | 'emptyState' | 'errorTitle'>;

const DEFAULT_CHART_STATE_LABELS: ChartStateLabels = {
  loading: DEFAULT_LABELS.loading,
  loadError: DEFAULT_LABELS.loadError,
  emptyState: DEFAULT_LABELS.emptyState,
  errorTitle: DEFAULT_LABELS.errorTitle,
};

/** Which state box covers the chart body (`'ready'`: none). */
export type ChartStateKind = 'ready' | 'loading' | 'empty' | 'error';

export interface ChartStateInput {
  /** The consumer's `loading` property / input */
  loading: boolean;
  /**
   * The consumer's `errorMessage` property / input: a non-blank string shows the error state with
   * that message; `null`, `undefined` and blank strings show none.
   */
  errorMessage: string | null | undefined;
  /** Rows the chart shows (visible rows after collapsing) */
  rowCount: number;
  /** The data source's load state, `null` without a data source */
  source: LoadStateSnapshot | null;
  labels?: Partial<ChartStateLabels> | undefined;
}

export interface ChartState {
  kind: ChartStateKind;
  /**
   * The chart's region is busy (`aria-busy="true"` on the host): in the loading state, and while
   * the consumer's `loading` is on over rows already shown. A data-source page loading under
   * shown rows is not busy here: the task-list footer carries its own `aria-busy`.
   */
  busy: boolean;
  /** `p.gantt-state-title`: `labels.errorTitle` in the error state, otherwise `null` */
  title: string | null;
  /**
   * The state's text: the `errorMessage` (or `labels.loadError` for a data-source failure),
   * `labels.emptyState` (fallback when no empty content is projected), `labels.loading`
   * (for assistive text; the skeleton is `aria-hidden`), or `null` when ready.
   */
  message: string | null;
  /**
   * What `button.gantt-state-retry` does in the error state: `'event'` emits `retry` with
   * `{ source: 'error' }`, `'dataSource'` emits `retry` with `{ source: 'dataSource' }` and calls
   * the data source's `retry()`. `null` (no button) in every other state.
   */
  retry: 'event' | 'dataSource' | null;
  /** Render the task-list footer (load more / loading / failed / all loaded) */
  footer: boolean;
}

const failed = (source: LoadStateSnapshot | null): boolean =>
  !!source && source.error !== undefined && source.error !== null && source.error !== false;

/**
 * What the chart shows, by precedence: the consumer's error > loading with no rows (the
 * consumer's `loading`, or the data source fetching its first page) > a data-source failure with
 * no rows (error with a data-source Retry) > empty (no rows and nothing more to load) > ready.
 * A data source with no rows that can still load more (`autoStart: false`) stays `'ready'`, so
 * its footer offers "Load more". With rows, data-source paging, failures included, stays in the
 * footer. Pure.
 */
export function resolveChartState(input: ChartStateInput): ChartState {
  const { loading, errorMessage, rowCount, source } = input;
  const l: ChartStateLabels = input.labels
    ? { ...DEFAULT_CHART_STATE_LABELS, ...input.labels }
    : DEFAULT_CHART_STATE_LABELS;
  const hasRows = rowCount > 0;

  if (typeof errorMessage === 'string' && errorMessage.trim() !== '') {
    return { kind: 'error', busy: false, title: l.errorTitle, message: errorMessage, retry: 'event', footer: false };
  }
  if (!hasRows && (loading || source?.isLoading)) {
    return { kind: 'loading', busy: true, title: null, message: l.loading, retry: null, footer: false };
  }
  if (!hasRows && failed(source)) {
    return {
      kind: 'error',
      busy: false,
      title: l.errorTitle,
      message: l.loadError,
      retry: 'dataSource',
      footer: false,
    };
  }
  if (!hasRows && !source?.hasMore) {
    return { kind: 'empty', busy: false, title: null, message: l.emptyState, retry: null, footer: false };
  }
  // Ready: rows are shown, or a data source with no rows can still load more (its footer is the content)
  return { kind: 'ready', busy: loading, title: null, message: null, retry: null, footer: source !== null };
}

// ─── Skeleton ─────────────────────────────────────────────────

/** A placeholder block, in px from the top-left of its skeleton row. */
export interface SkeletonBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One placeholder row of the loading state (`div.gantt-skeleton-row`). */
export interface SkeletonRow {
  /** Stable key: the row index */
  key: number;
  /** Top of the row in px from the top of the skeleton (the row's `top` / `translateY`) */
  y: number;
  height: number;
  /** `span.gantt-skeleton-name`: a name placeholder in the task-list part, `null` when the panel is too narrow (or hidden) */
  name: SkeletonBlock | null;
  /** `span.gantt-skeleton-bar`: a bar placeholder in the timeline part, `null` when there is no timeline */
  bar: SkeletonBlock | null;
}

export interface SkeletonInput {
  /** Height of the body under the header, px */
  viewportHeight: number;
  rowHeight: number;
  /** Width of the task-list part (0 in the chart view; the whole width in the table view), px */
  panelWidth: number;
  /** Width of the visible timeline part, right of the panel (0 in the table view), px */
  timelineWidth: number;
}

/** Inner padding of the name placeholder in the task-list part, px. */
export const SKELETON_INSET = 12;
/** The skeleton never draws more rows than this (very tall viewports). */
export const SKELETON_MAX_ROWS = 60;
/** Narrowest name / bar placeholder drawn, px: a part with less room gets `null`. */
const MIN_BLOCK = 8;

/** Name placeholder widths, as fractions of the room in the panel; cycled by row. */
const NAME_FRACTIONS = [0.72, 0.5, 0.64, 0.46, 0.68, 0.56, 0.42, 0.6] as const;
/** Bar placeholder [start, width] as fractions of the timeline width: a cascade, cycled by row. */
const BAR_SPANS = [
  [0.04, 0.22],
  [0.14, 0.18],
  [0.26, 0.3],
  [0.2, 0.14],
  [0.38, 0.24],
  [0.5, 0.2],
  [0.44, 0.32],
  [0.62, 0.22],
] as const;

/**
 * Placeholder rows that fill the body while the first rows load: as many rows as fit
 * `viewportHeight` (at most `SKELETON_MAX_ROWS`), each with a name block in the panel and a bar
 * block in the timeline. Widths follow fixed patterns, so the same input always gives the same
 * pixels (stable screenshots); every value is a whole pixel.
 */
export function skeletonRows(input: SkeletonInput): SkeletonRow[] {
  const rowHeight = Math.round(input.rowHeight);
  const panelWidth = Math.max(0, Math.round(input.panelWidth));
  const timelineWidth = Math.max(0, Math.round(input.timelineWidth));
  if (!(rowHeight > 0) || !(input.viewportHeight > 0)) return [];
  const count = Math.min(SKELETON_MAX_ROWS, Math.ceil(input.viewportHeight / rowHeight));
  const nameHeight = Math.max(4, Math.min(10, Math.round(rowHeight * 0.3)));
  const barHeight = Math.max(4, Math.round(rowHeight * 0.45));
  const nameRoom = panelWidth - 2 * SKELETON_INSET;
  const rows: SkeletonRow[] = [];
  for (let i = 0; i < count; i++) {
    const nameWidth = Math.round(nameRoom * NAME_FRACTIONS[i % NAME_FRACTIONS.length]!);
    const [start, span] = BAR_SPANS[i % BAR_SPANS.length]!;
    const barWidth = Math.round(timelineWidth * span);
    rows.push({
      key: i,
      y: i * rowHeight,
      height: rowHeight,
      name:
        nameWidth >= MIN_BLOCK
          ? { x: SKELETON_INSET, y: Math.round((rowHeight - nameHeight) / 2), width: nameWidth, height: nameHeight }
          : null,
      bar:
        barWidth >= MIN_BLOCK
          ? {
              x: panelWidth + Math.round(timelineWidth * start),
              y: Math.round((rowHeight - barHeight) / 2),
              width: barWidth,
              height: barHeight,
            }
          : null,
    });
  }
  return rows;
}
