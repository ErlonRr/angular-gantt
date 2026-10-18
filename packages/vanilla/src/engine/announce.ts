/**
 * @file announce.ts
 * What the polite live region (`.gantt-sr-live`, `role=status`) reads out while the element is
 * connected, in the words of the core announcements and labels:
 *
 * - a change of the number of selected tasks (`announceSelection`: "3 tasks selected",
 *   "Selection cleared");
 * - the data source's load state (core `announceLoadState`): `labels.loading` when a page starts
 *   loading, then `labels.announceLoaded(n)` when more pages remain or `labels.allLoaded(n)` after
 *   the last one.
 *
 * A failed page is not announced here: it goes once to the assertive `.gantt-sr-alert` (see
 * `engine.ts`). The state found when the element connects is the baseline and is not announced.
 */

import { announceLoadState, announceSelection, type GanttLabels } from '@gantry/core';
import { effect, untracked, type ReadonlySignal } from '../reactive';
import type { GanttLoadMoreState, Inputs } from './inputs';

/** Puts `text` into `region`; the same sentence twice is still a change (a trailing no-break space). */
export function announce(region: HTMLElement, text: string): void {
  region.textContent = region.textContent === text ? `${text}\u00A0` : text;
}

/** Creates the announcement effects (call inside the connection's owner: disconnecting disposes them). */
export function announceEffects(I: Inputs, i18n: ReadonlySignal<{ labels: GanttLabels }>, region: HTMLElement): void {
  const labels = () => untracked(i18n).labels;

  let selected: number | null = null;
  effect(() => {
    const count = I.selection().selected.size;
    const prev = selected;
    selected = count;
    if (prev !== null && prev !== count) announce(region, announceSelection(count, labels()));
  });

  let load: GanttLoadMoreState | null | undefined;
  effect(() => {
    const next = I.loadState();
    const prev = load;
    load = next;
    if (prev === undefined) return;
    const text = announceLoadState(prev, next, labels());
    if (text !== null) announce(region, text);
  });
}
