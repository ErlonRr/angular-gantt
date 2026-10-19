/**
 * Case `only-parents-styled`: collapsed parents painted from their children. `rollup.color` is
 * `'status'` (the summary status: overdue if any child is, done if all are…), or a callback (here,
 * the colour of the team with the most children); `rollup.segments` draws the children inside the
 * collapsed bar, each in its own colour.
 */

import type { GanttOptions, GanttRollupOptions, GanttTask } from '@gantryjs/core';
import { TEAM_COLORS, treeTasks, type Team } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type OnlyParentsColor = 'status' | 'team' | 'none';

export const ONLY_PARENTS_STYLED_COLORS: readonly GalleryChoice<OnlyParentsColor>[] = [
  { value: 'status', label: 'Status of the children' },
  { value: 'team', label: 'Callback: main team' },
  { value: 'none', label: 'None' },
];

/** `rollup.color` callback: the colour of the team with the most direct children. */
export function mainTeamColor(children: readonly GanttTask[]): string | null {
  const counts = new Map<Team, number>();
  for (const child of children) {
    const team = child.data?.['team'] as Team | undefined;
    if (team) counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  let best: Team | null = null;
  for (const [team, n] of counts) if (!best || n > counts.get(best)!) best = team;
  return best ? TEAM_COLORS[best] : null;
}

export function onlyParentsStyledOptions(color: OnlyParentsColor, segments: boolean): GanttOptions {
  const rollup: GanttRollupOptions = {
    color: color === 'status' ? 'status' : color === 'team' ? mainTeamColor : false,
    segments,
  };
  return {
    viewMode: 'Week',
    rollup,
    groupBar: { collapsed: true },
    panel: { width: 300, columns: ['name', 'progress'] },
    labels: { ariaChart: 'Programmes coloured by their children' },
  };
}

/** The controls' first values: the parent colour and the child-segments switch */
export const ONLY_PARENTS_STYLED_INITIAL: { readonly color: OnlyParentsColor; readonly segments: boolean } = {
  color: 'status',
  segments: true,
};

export const ONLY_PARENTS_STYLED_OPTIONS = onlyParentsStyledOptions(
  ONLY_PARENTS_STYLED_INITIAL.color,
  ONLY_PARENTS_STYLED_INITIAL.segments,
);

/** The legend under the chart: each team's colour (what the segments and the callback use). */
export const ONLY_PARENTS_STYLED_TEAMS = Object.entries(TEAM_COLORS).map(([team, color]) => ({
  label: team.charAt(0).toUpperCase() + team.slice(1),
  color,
}));

/** The tree with every task in its team's colour (what the segments show). */
export function onlyParentsStyledTasks(now?: Date): GanttTask[] {
  return treeTasks(now).map(t => {
    const team = t.data?.['team'] as Team | undefined;
    return team && t.type !== 'group' ? { ...t, style: { color: TEAM_COLORS[team] } } : t;
  });
}

export const onlyParentsStyledCase: GalleryCaseData = {
  charts: now => [{ tasks: onlyParentsStyledTasks(now), options: ONLY_PARENTS_STYLED_OPTIONS }],
};
