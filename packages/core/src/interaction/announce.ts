// ─────────────────────────────────────────────────────────────
//  gantry · interaction/announce.ts
//  Screen-reader announcements (aria-live text). Every sentence
//  comes from a translatable label; bindings only put the string
//  into their live region.
// ─────────────────────────────────────────────────────────────

import {
  DEFAULT_LABELS,
  type AnnounceUnit,
  type GanttLabels,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '../types';
import type { KeyboardEditEvent } from './keyboard-edit';

export type { AnnounceUnit };

/** Live-region sentences (part of `GanttLabels`). Interpolated ones are functions. */
export type AnnounceLabels = Pick<
  GanttLabels,
  | 'announceSelection'
  | 'announceMoved'
  | 'announceResized'
  | 'announceProgress'
  | 'announceZoom'
  | 'announceEditStart'
  | 'announceEditCancel'
  | 'announceEditNoChange'
  | 'announceExpanded'
  | 'announceCollapsed'
  | 'announceLinkStart'
  | 'announceLinkCreated'
  | 'announceLinkCancel'
>;

export const DEFAULT_ANNOUNCE_LABELS: AnnounceLabels = {
  announceSelection: DEFAULT_LABELS.announceSelection,
  announceMoved: DEFAULT_LABELS.announceMoved,
  announceResized: DEFAULT_LABELS.announceResized,
  announceProgress: DEFAULT_LABELS.announceProgress,
  announceZoom: DEFAULT_LABELS.announceZoom,
  announceEditStart: DEFAULT_LABELS.announceEditStart,
  announceEditCancel: DEFAULT_LABELS.announceEditCancel,
  announceEditNoChange: DEFAULT_LABELS.announceEditNoChange,
  announceExpanded: DEFAULT_LABELS.announceExpanded,
  announceCollapsed: DEFAULT_LABELS.announceCollapsed,
  announceLinkStart: DEFAULT_LABELS.announceLinkStart,
  announceLinkCreated: DEFAULT_LABELS.announceLinkCreated,
  announceLinkCancel: DEFAULT_LABELS.announceLinkCancel,
};

/** Defaults with any overrides applied. */
export function resolveAnnounceLabels(labels?: Partial<AnnounceLabels>): AnnounceLabels {
  return labels ? { ...DEFAULT_ANNOUNCE_LABELS, ...labels } : DEFAULT_ANNOUNCE_LABELS;
}

/**
 * Unit to read a set of day deltas in when the caller did not say: days when every delta is a
 * whole number of days, else hours. Pass the real unit (`DragTiming.snap`,
 * `KeyboardEditSession.unit`) instead whenever it is known — on hour scales a 24 h change is
 * otherwise read as "1 day".
 */
function guessUnit(...days: number[]): AnnounceUnit {
  return days.every(d => Math.abs(d - Math.round(d)) < 1e-9) ? 'day' : 'hour';
}

/**
 * A drag / resize delta in days as an amount + unit. `unit` is the snap unit of the scale
 * (`'hour'` on hour scales); omitted, it is guessed (whole days → days, else hours).
 */
export function announceAmount(days: number, unit?: AnnounceUnit): { amount: number; unit: AnnounceUnit } {
  const u = unit ?? guessUnit(days);
  // `+ 0` turns -0 into 0
  return { amount: Math.round(u === 'hour' ? days * 24 : days) + 0, unit: u };
}

export function announceSelection(count: number, labels?: Partial<AnnounceLabels>): string {
  return resolveAnnounceLabels(labels).announceSelection(count);
}

/** `unit`: the scale's snap unit (see `announceAmount`). */
export function announceMove(
  event: Pick<TaskDragEvent, 'daysMoved'>,
  name: string,
  labels?: Partial<AnnounceLabels>,
  unit?: AnnounceUnit,
): string {
  const { amount, unit: u } = announceAmount(event.daysMoved, unit);
  return resolveAnnounceLabels(labels).announceMoved(name, amount, u);
}

/** `unit`: the scale's snap unit (see `announceAmount`). */
export function announceResize(
  event: Pick<TaskResizeEvent, 'handle' | 'daysDelta'>,
  name: string,
  labels?: Partial<AnnounceLabels>,
  unit?: AnnounceUnit,
): string {
  const { amount, unit: u } = announceAmount(event.daysDelta, unit);
  return resolveAnnounceLabels(labels).announceResized(name, event.handle === 'left' ? 'start' : 'end', amount, u);
}

export function announceProgress(progress: number, name: string, labels?: Partial<AnnounceLabels>): string {
  return resolveAnnounceLabels(labels).announceProgress(name, Math.round(progress));
}

/** `level` is the label shown in the toolbar (e.g. `labels.viewModes[name] ?? zoomLevel.label ?? name`). */
export function announceZoom(level: string, labels?: Partial<AnnounceLabels>): string {
  return resolveAnnounceLabels(labels).announceZoom(level);
}

/**
 * One sentence for the events of a keyboard-edit commit (`KeyboardEditSession.commit()`).
 * A move followed by a resize is read as "start moved …, end moved …" so the listener hears
 * the net change of each edge. Every amount uses one unit: pass `session.unit`; omitted, it is
 * guessed once for the whole sentence.
 */
export function announceKeyboardEdit(
  events: readonly KeyboardEditEvent[],
  name: string,
  labels?: Partial<AnnounceLabels>,
  unit?: AnnounceUnit,
): string {
  const l = resolveAnnounceLabels(labels);
  if (events.length === 0) return l.announceEditNoChange(name);
  const drag = events.find(e => e.kind === 'drag');
  const resize = events.find(e => e.kind === 'resize');
  const progress = events.find(e => e.kind === 'progress');
  const u = unit ?? guessUnit(drag?.event.daysMoved ?? 0, resize?.event.daysDelta ?? 0);
  const parts: string[] = [];
  if (drag && resize && resize.event.handle === 'right') {
    // Net change per edge: start by the move, end by the move + the resize
    const start = announceAmount(drag.event.daysMoved, u);
    const end = announceAmount(drag.event.daysMoved + resize.event.daysDelta, u);
    parts.push(l.announceResized(name, 'start', start.amount, start.unit));
    if (end.amount !== 0) parts.push(l.announceResized(name, 'end', end.amount, end.unit));
  } else if (drag) {
    parts.push(announceMove(drag.event, name, l, u));
  } else if (resize) {
    parts.push(announceResize(resize.event, name, l, u));
  }
  if (progress) parts.push(l.announceProgress(name, Math.round(progress.event.newProgress)));
  return parts.join('. ');
}

// ─── Data-source load state ───────────────────────────────────

/** What a binding knows about its data source's paging when the load state changes. */
export interface LoadStateSnapshot {
  /** A page is being fetched */
  readonly isLoading: boolean;
  /** More pages remain after the loaded ones */
  readonly hasMore: boolean;
  /**
   * The last page failed: any value but `undefined`, `null` and `false` (the Web Component's
   * `error: true`, a `PagedLoader.error`). A failure is announced once by the binding's assertive
   * alert region, so the polite live region says nothing for it.
   */
  readonly error?: unknown;
  /** Tasks loaded so far */
  readonly loadedCount: number;
}

/** Labels `announceLoadState` reads (part of `GanttLabels`). */
export type LoadStateLabels = Pick<GanttLabels, 'loading' | 'announceLoaded' | 'allLoaded'>;

const DEFAULT_LOAD_STATE_LABELS: LoadStateLabels = {
  loading: DEFAULT_LABELS.loading,
  announceLoaded: DEFAULT_LABELS.announceLoaded,
  allLoaded: DEFAULT_LABELS.allLoaded,
};

/**
 * The polite live-region sentence for a change of the data source's load state, or `null` when
 * there is nothing to say: `labels.loading` when a page starts loading, then
 * `labels.announceLoaded(n)` when it loaded and more remain or `labels.allLoaded(n)` after the
 * last one. Nothing while the loading flag is unchanged, for a failed page, or when the data
 * source goes away (`next` null). `prev` is the previous snapshot (`null` without a data source);
 * a binding keeps the state found at its first render as the baseline and does not announce it.
 */
export function announceLoadState(
  prev: LoadStateSnapshot | null,
  next: LoadStateSnapshot | null,
  labels?: Partial<LoadStateLabels>,
): string | null {
  const wasLoading = prev?.isLoading ?? false;
  if (!next || next.isLoading === wasLoading) return null;
  const l: LoadStateLabels = labels ? { ...DEFAULT_LOAD_STATE_LABELS, ...labels } : DEFAULT_LOAD_STATE_LABELS;
  if (next.isLoading) return l.loading;
  if (next.error !== undefined && next.error !== null && next.error !== false) return null;
  return next.hasMore ? l.announceLoaded(next.loadedCount) : l.allLoaded(next.loadedCount);
}
