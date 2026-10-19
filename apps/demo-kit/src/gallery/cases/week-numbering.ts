/**
 * Case `week-numbering`: how weeks are numbered in the header (`weekNumbering`: ISO, US or the
 * locale's rule) and the day they start on (`weekStart`: Monday, Sunday or Saturday, or the rule's
 * own). Two zoom levels of its own print the week numbers with their days.
 */

import {
  WEEK_FORMATS,
  type GanttOptions,
  type GanttTask,
  type GanttZoomLevel,
  type WeekNumbering,
  type WeekStart,
} from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const WEEK_NUMBERINGS: readonly GalleryChoice<WeekNumbering>[] = [
  { value: 'iso', label: 'ISO 8601 (Monday, 4-day first week)' },
  { value: 'us', label: 'US (Sunday, week 1 holds 1 January)' },
  { value: 'locale', label: 'The locale’s rule' },
];

/** `'rule'` = the numbering rule's own first day */
export type WeekStartChoice = 'rule' | WeekStart;

export const WEEK_STARTS: readonly GalleryChoice<WeekStartChoice>[] = [
  { value: 'rule', label: 'From the rule' },
  { value: 1, label: 'Monday' },
  { value: 0, label: 'Sunday' },
  { value: 6, label: 'Saturday' },
];

export const WEEK_LOCALES: readonly GalleryChoice[] = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'ar-EG', label: 'Arabic (Egypt)' },
];

export const WEEK_ZOOM_LEVELS: GanttZoomLevel[] = [
  {
    name: 'Weeks',
    pxPerDay: 26,
    scales: [
      { unit: 'month', format: 'MMMM YYYY', align: 'start' },
      { unit: 'week', format: WEEK_FORMATS.numberRange },
    ],
  },
  {
    name: 'Days',
    pxPerDay: 44,
    scales: [
      { unit: 'week', format: WEEK_FORMATS.label, align: 'start' },
      { unit: 'day', format: 'dd D' },
    ],
  },
];

export interface WeekNumberingChoice {
  numbering: WeekNumbering;
  weekStart: WeekStartChoice;
  locale: string;
}

export const WEEK_NUMBERING_INITIAL: WeekNumberingChoice = { numbering: 'iso', weekStart: 'rule', locale: 'en-GB' };

export function weekNumberingOptions({ numbering, weekStart, locale }: WeekNumberingChoice): GanttOptions {
  return {
    zoomLevels: WEEK_ZOOM_LEVELS,
    viewMode: 'Weeks',
    weekNumbering: numbering,
    ...(weekStart === 'rule' ? {} : { weekStart }),
    locale,
    nonWorkingTime: { weekends: true },
    labels: { ariaChart: 'Launch plan by week' },
  };
}

export const WEEK_NUMBERING_OPTIONS = weekNumberingOptions(WEEK_NUMBERING_INITIAL);

export function weekNumberingTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const weekNumberingCase: GalleryCaseData = {
  charts: now => [{ tasks: weekNumberingTasks(now), options: WEEK_NUMBERING_OPTIONS }],
};
