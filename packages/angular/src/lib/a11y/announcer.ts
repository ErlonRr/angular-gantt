// ─────────────────────────────────────────────────────────────
//  gantry · a11y/announcer.ts
//
//  What the chart's polite live region (`.gantt-sr-live`, role=status)
//  reads out, in the words of the @gantry/core announcements and labels
//  (the Web Component's `engine/announce.ts`):
//
//   - a change of the number of selected tasks (`announceSelection`:
//     "3 tasks selected", "Selection cleared"), reported by the
//     selection service;
//   - the data source's load state (`announceLoadState`): `labels.loading`
//     when a page starts loading, then `labels.announceLoaded(n)` while
//     more pages remain or `labels.allLoaded(n)` after the last one.
//     GantryComponent feeds it; the state found at the first render is
//     the baseline and is not announced.
//
//  Nothing is announced before the chart's first render in the browser
//  (`start()`, never on the server): what the chart starts with is the
//  baseline. A failed page is not announced here: it goes to the
//  assertive `.gantt-sr-alert` (GantryComponent). One announcer per
//  chart (provided by GantryComponent); it holds text only, the
//  template renders it.
// ─────────────────────────────────────────────────────────────

import { Injectable, inject, signal, untracked } from '@angular/core';
import { announceLoadState, announceSelection, type LoadStateSnapshot } from '@gantry/core';

import { GanttI18nService } from '../services/gantt-i18n.service';
import { type GanttDataSource } from '../datasource/gantt-datasource';

/** Appended to a sentence equal to the one on display, so assistive technologies read it again */
const REPEAT_MARK = '\u00A0';

@Injectable()
export class GanttAnnouncer {
  private readonly i18n = inject(GanttI18nService);
  private readonly _live = signal('');
  /** The chart rendered once in the browser: changes are announced from now on */
  private started = false;

  /** Text of the polite live region (`.gantt-sr-live`) */
  readonly live = this._live.asReadonly();

  /** Announce from now on (after the chart's first render; the state until then is the baseline). */
  start(): void {
    this.started = true;
  }

  /**
   * Puts `text` into the live region (once started); the same sentence twice is still a change (a
   * trailing no-break space).
   */
  announce(text: string): void {
    if (!this.started) return;
    this._live.update(current => (current === text ? `${text}${REPEAT_MARK}` : text));
  }

  /** The number of selected tasks changed. */
  selection(count: number): void {
    this.announce(announceSelection(count, untracked(this.i18n.labels)));
  }

  /** The data source's load state changed from `prev` to `next` (`null`: no data source). */
  loadState(prev: LoadStateSnapshot | null, next: LoadStateSnapshot | null): void {
    const text = announceLoadState(prev, next, untracked(this.i18n.labels));
    if (text !== null) this.announce(text);
  }
}

/** The load state of `ds` as the core announcement reads it (`null` without a data source). Reads its signals. */
export function loadStateOf(ds: GanttDataSource | null): LoadStateSnapshot | null {
  if (!ds) return null;
  return {
    isLoading: ds.isLoading(),
    hasMore: ds.hasMore(),
    error: ds.error(),
    loadedCount: ds.loadedCount(),
  };
}
