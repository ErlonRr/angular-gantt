/**
 * Case `custom-bars`: the bars of `barType: 'epic'` are drawn by your own code: an Angular
 * component (`provideGanttBar`), or the SVG element `renderBar` returns in the other bindings. An
 * epic shows its progress as a thick underline and a badge in the colour and initial of its risk;
 * `epicBarLayout` places its parts, so the epic looks the same in every framework.
 */

import type { GanttBarContext, GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData } from '../types';

export const CUSTOM_BAR_TYPE = 'epic';

export type Risk = 'low' | 'medium' | 'high';

/** The risks, lowest first (the legend's order) */
export const RISKS: readonly Risk[] = ['low', 'medium', 'high'];

export const RISK_COLORS: Readonly<Record<Risk, string>> = { low: '#047857', medium: '#b45309', high: '#b91c1c' };
export const RISK_LABELS: Readonly<Record<Risk, string>> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

export const CUSTOM_BARS_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  bar: { height: '70%' },
  labels: { ariaChart: 'Launch plan with epics' },
};

const RISK: Readonly<Record<string, Risk>> = {
  interviews: 'low',
  survey: 'low',
  wireframes: 'medium',
  visual: 'low',
  api: 'high',
  web: 'medium',
  docs: 'low',
  tests: 'medium',
};

/** The plan with its leaf tasks as epics (`barType`) that carry a risk (`data.risk`). */
export function customBarsTasks(now?: Date): GanttTask[] {
  return planTasks(now).map(t => {
    const risk = RISK[t.id];
    return risk ? { ...t, barType: CUSTOM_BAR_TYPE, data: { ...t.data, risk } } : t;
  });
}

/** The risk of a task (`'low'` when it has none). */
export function riskOf(task: GanttTask): Risk {
  const risk = task.data?.['risk'];
  return risk === 'medium' || risk === 'high' ? risk : 'low';
}

/** Where an epic bar draws its parts, from the core bar visual (`ctx.visual`). */
export interface EpicBarLayout {
  /** The risk's colour, initial (L, M or H: the badge doesn't rely on colour alone) and label */
  color: string;
  initial: string;
  description: string;
  /** The progress as a thick underline below the body: the track spans the bar, `done` is the done width */
  underline: { x: number; y: number; width: number; done: number; height: number; rx: number };
  /** The risk badge at the start of the bar; `null` on a bar too short to hold it */
  badge: { cx: number; cy: number; r: number } | null;
  /** The label's shift (SVG `dx`): a label inside the bar moves clear of the badge */
  labelDx: number;
}

export function epicBarLayout({ row, visual: v }: Pick<GanttBarContext, 'row' | 'visual'>): EpicBarLayout {
  const risk = riskOf(row.task);
  const done = Math.min(100, Math.max(0, row.task.progress ?? 0)) / 100;
  const badge = v.width >= 28 ? { cx: v.x + 10, cy: v.cy, r: Math.min(7, v.height / 2 - 1) } : null;
  return {
    color: RISK_COLORS[risk],
    initial: RISK_LABELS[risk].charAt(0),
    description: RISK_LABELS[risk],
    underline: { x: v.x, y: v.y + v.height + 2, width: v.width, done: v.width * done, height: 3, rx: 1.5 },
    badge,
    labelDx: badge && v.label?.inside ? 8 : 0,
  };
}

export const customBarsCase: GalleryCaseData = {
  charts: now => [{ tasks: customBarsTasks(now), options: CUSTOM_BARS_OPTIONS }],
};
