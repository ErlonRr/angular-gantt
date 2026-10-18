// ─────────────────────────────────────────────────────────────
//  gantry · a11y/announcer.ts
//
//  What the chart's polite live region (`.gantt-sr-live`, role=status)
//  reads out, in the words of the @gantryjs/core announcements and labels
//  (the Web Component's `engine/announce.ts`):
//
//   - a change of the number of selected tasks (`announceSelection`:
//     "3 tasks selected", "Selection cleared"), reported by the
//     selection service;
//   - the data source's load state (`announceLoadState`): `labels.loading`
//     when a page starts loading, then `labels.announceLoaded(n)` while
//     more pages remain or `labels.allLoaded(n)` after the last one.
//     GantryComponent feeds it from the data source's own change stream
//     (`ɵsubscribe`); the state found at the first render is the baseline
//     and is not announced;
//   - a change of the zoom level (`announceZoom`, with the level's toolbar
//     label), from GantryComponent's zoom effect and `fitToScreen()`.
//
//  Writes go through core `createAnnouncer`: `announce()` waits
//  `ANNOUNCE_DEBOUNCE` (250 ms) and the last message of a burst wins;
//  `announceNow()` writes at once; a sentence equal to the one on display
//  gets a trailing no-break space so it is read again. The timers are the
//  page's (`DOCUMENT.defaultView`), created by `start()` after the chart's
//  first render in the browser — never on the server — and cancelled when
//  the chart is destroyed. Nothing is announced before `start()`: what the
//  chart starts with is the baseline. A failed page is not announced here:
//  it goes to the assertive `.gantt-sr-alert` (GantryComponent), at once.
//  One announcer per chart (provided by GantryComponent); it holds text
//  only, the template renders it.
// ─────────────────────────────────────────────────────────────

import { DOCUMENT, DestroyRef, Injectable, inject, signal, untracked } from '@angular/core';
import {
  announceLoadState,
  announceSelection,
  announceZoom,
  createAnnouncer,
  type Announcer,
  type LoadStateSnapshot,
} from '@gantryjs/core';

import { GanttI18nService } from '../services/gantt-i18n.service';
import { type GanttDataSource } from '../datasource/gantt-datasource';

@Injectable()
export class GanttAnnouncer {
  private readonly i18n = inject(GanttI18nService);
  private readonly doc = inject(DOCUMENT);
  private readonly _live = signal('');
  /** The debounced writer, once started in the browser */
  private queue: Announcer | null = null;

  /** Text of the polite live region (`.gantt-sr-live`) */
  readonly live = this._live.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /**
   * Announce from now on (after the chart's first render, in the browser: the state until then is
   * the baseline). Uses the page's timers; without a window (server) nothing is ever announced.
   */
  start(): void {
    const win = this.doc.defaultView;
    if (this.queue || !win) return;
    this.queue = createAnnouncer<ReturnType<typeof win.setTimeout>>(text => this._live.set(text), {
      set: (fn, ms) => win.setTimeout(fn, ms),
      clear: handle => win.clearTimeout(handle),
    });
  }

  /** Drops a pending announcement and stops announcing (the chart is destroyed). */
  stop(): void {
    this.queue?.cancel();
    this.queue = null;
  }

  /** Puts `text` into the live region after the debounce (once started); a newer message replaces it. */
  announce(text: string): void {
    this.queue?.say(text);
  }

  /** Puts `text` into the live region at once (once started), dropping a pending announcement. */
  announceNow(text: string): void {
    this.queue?.now(text);
  }

  /** The number of selected tasks changed. */
  selection(count: number): void {
    this.announce(announceSelection(count, untracked(this.i18n.labels)));
  }

  /**
   * The data source's load state changed from `prev` to `next` (`null`: no data source). A new
   * failure drops a pending "Loading…": the alert region (or the error state) reads the failure.
   */
  loadState(prev: LoadStateSnapshot | null, next: LoadStateSnapshot | null): void {
    const text = announceLoadState(prev, next, untracked(this.i18n.labels));
    if (text !== null) this.announce(text);
    else if (failed(next) && !failed(prev)) this.queue?.cancel();
  }

  /** The zoom level changed; `label` is the level's toolbar label. */
  zoom(label: string): void {
    this.announce(announceZoom(label, untracked(this.i18n.labels)));
  }
}

/** The snapshot reports a failed page (any `error` but `undefined`, `null` and `false`, as core reads it). */
function failed(state: LoadStateSnapshot | null): boolean {
  const error = state?.error;
  return error !== undefined && error !== null && error !== false;
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
