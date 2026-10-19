/**
 * Case `keyboard`: the chart from the keyboard alone, with the key map next to it and an echo of
 * what the chart announces to screen readers (its `aria-live` region).
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData } from '../types';

export const KEYBOARD_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  multiSelect: true,
  labels: { ariaChart: 'Launch plan' },
};

/** The key map card: where the focus is, the keys and what they do. */
export const KEYBOARD_KEYS: readonly { area: string; keys: readonly string[]; action: string }[] = [
  { area: 'Everywhere', keys: ['Tab'], action: 'Toolbar → task list → splitter → bars' },
  { area: 'Toolbar', keys: ['←', '→', 'Home', 'End'], action: 'Move between the controls' },
  { area: 'Task list', keys: ['↑', '↓', 'PgUp', 'PgDn'], action: 'Previous / next row, one page' },
  { area: 'Task list', keys: ['→', '←'], action: 'Expand / collapse a group, or enter / leave the cells' },
  { area: 'Task list', keys: ['Space', 'Shift+Space'], action: 'Select a row · extend the selection' },
  { area: 'Bars', keys: ['↑', '↓'], action: 'The bar of the previous / next row' },
  { area: 'Bars', keys: ['←', '→'], action: 'Pan the timeline by one header cell' },
  { area: 'Bars', keys: ['Enter', 'F2'], action: 'Move mode: ← → move, Shift / Alt resize, Enter commits' },
  { area: 'Everywhere', keys: ['+', '-', 'T', 'F'], action: 'Zoom in · zoom out · today · fit to screen' },
  { area: 'Everywhere', keys: ['Escape'], action: 'Cancel, close the tooltip, clear the selection' },
];

/** The chart's polite live region, whose text the case echoes on the page */
export const KEYBOARD_LIVE_SELECTOR = '.gantt-sr-live';

export function keyboardTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const keyboardCase: GalleryCaseData = {
  charts: now => [{ tasks: keyboardTasks(now), options: KEYBOARD_OPTIONS }],
};
