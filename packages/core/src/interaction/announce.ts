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
