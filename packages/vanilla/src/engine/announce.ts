/**
 * @file announce.ts
 * The polite live region (`.gantt-sr-live`, `role=status`) and what it reads out, in the words of
 * the core announcements and labels. Every sentence goes through one core `createAnnouncer` per
 * element (`ctx.announce`, D17): `say()` waits `ANNOUNCE_DEBOUNCE` (250 ms) and the last
 * message of a burst wins, so a run of changes is read once; a sentence equal to the last one is
 * marked (`REPEAT_MARK`) so it is read again.
 *
 * - The number of selected tasks (`announceSelection`: "3 tasks selected", "Selection cleared")
 *   and the zoom level shown (`announceZoom`: "Zoom: Week"), from the state found when the
 *   element connects on (`announceEffects`, effects of the connection).
 * - The data source's load state (core `announceLoadState`): `labels.loading` when a page starts
 *   loading, then `labels.announceLoaded(n)` or `labels.allLoaded(n)`. The engine says it from
 *   the data-source subscription (`engine.ts`, previous → next snapshot), not from an effect, so
 *   it does not depend on when effects run; the catch-up when the element connects is the
 *   baseline and is not announced.
 *
 * A failed page is not announced here: it goes once, undebounced, to the assertive
 * `.gantt-sr-alert` (see `engine.ts`).
 */

import { announceSelection, announceZoom, createAnnouncer, zoomLevelLabel, type Announcer } from '@gantryjs/core';
import { effect, untracked } from '../reactive';
import type { Graph } from './engine';
import type { Inputs } from './inputs';

/** The element's polite announcer: core `createAnnouncer` writing `region` (the page's timers). */
export function createLiveAnnouncer(region: HTMLElement): Announcer {
  return createAnnouncer(
    text => {
      region.textContent = text;
    },
    {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: handle => clearTimeout(handle),
    },
  );
}

/** A zoom level's name as the toolbar shows it (core's `zoomLevelLabel`, also used by `buildToolbar`). */
export { zoomLevelLabel };

/**
 * Creates the announcement effects (call inside the connection's owner: disconnecting disposes
 * them). What they find when they start is the baseline and is not announced.
 */
export function announceEffects(I: Inputs, G: Pick<Graph, 'i18n' | 'config' | 'viewMode'>, announcer: Announcer): void {
  const labels = () => untracked(G.i18n).labels;

  let selected: number | null = null;
  effect(() => {
    const count = I.selection().selected.size;
    const prev = selected;
    selected = count;
    if (prev !== null && prev !== count) announcer.say(announceSelection(count, labels()));
  });

  // Re-runs only when the level shown changes (`viewMode` compares by name)
  let level: string | undefined;
  effect(() => {
    let name: string;
    try {
      name = G.viewMode();
    } catch {
      return; // invalid options: the render reports the error
    }
    const prev = level;
    level = name;
    if (prev === undefined || prev === name) return;
    announcer.say(announceZoom(zoomLevelLabel(untracked(G.config).level, labels()), labels()));
  });
}
