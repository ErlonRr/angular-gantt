/**
 * Case `print`: `print(options)` prints every row of a 60-row schedule, not only the rows on
 * screen, on as many pages as it takes: the paper and its orientation (`paper`, `orientation`),
 * scaled to the page width, onto one page or at actual size (`fit`), with the header on every page
 * and the task list on every column of pages (`repeatTable`). The `export` event reports the
 * pages printed.
 */

import { DependencyType, TaskType, type GanttOptions, type GanttPrintOptions, type GanttTask } from '@gantryjs/core';
import { dayAt } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const PRINT_OPTIONS: GanttOptions = {
  viewMode: 'Day',
  labels: { ariaChart: 'Construction schedule' },
};

export type PrintPaper = 'a4' | 'letter' | 'a3';
export type PrintOrientation = 'landscape' | 'portrait';
export type PrintFit = 'width' | 'page' | 'none';

export const PRINT_PAPERS: readonly GalleryChoice<PrintPaper>[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'a3', label: 'A3' },
];

export const PRINT_ORIENTATIONS: readonly GalleryChoice<PrintOrientation>[] = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
];

export const PRINT_FITS: readonly GalleryChoice<PrintFit>[] = [
  { value: 'width', label: 'Page width' },
  { value: 'page', label: 'One page' },
  { value: 'none', label: 'Actual size' },
];

/** The controls' state: the paper, its orientation, the fit and the task list on every page */
export interface PrintState {
  readonly paper: PrintPaper;
  readonly orientation: PrintOrientation;
  readonly fit: PrintFit;
  readonly repeatTable: boolean;
}

/** The controls' first values */
export const PRINT_INITIAL: PrintState = { paper: 'a4', orientation: 'landscape', fit: 'width', repeatTable: true };

/** The options of `print()` for the controls' state. */
export function printOptionsOf(state: PrintState): GanttPrintOptions {
  return { paper: state.paper, orientation: state.orientation, fit: state.fit, repeatTable: state.repeatTable };
}

export const PRINT_HINT =
  'Ctrl+P prints the page as you see it; Print… prints every row, on as many pages as it takes.';

/** The six phases of the schedule, nine tasks each (the last task of the plan is the Handover milestone) */
const PHASES: readonly { id: string; name: string; tasks: readonly string[] }[] = [
  {
    id: 'site',
    name: 'Site preparation',
    tasks: [
      'Site survey',
      'Hoarding and gates',
      'Welfare cabins',
      'Site clearance',
      'Temporary power',
      'Access road',
      'Topsoil strip',
      'Setting out',
      'Ground tests',
    ],
  },
  {
    id: 'foundations',
    name: 'Foundations',
    tasks: [
      'Excavation',
      'Piling',
      'Pile caps',
      'Ground beams',
      'Under-slab drainage',
      'Damp-proof membrane',
      'Slab reinforcement',
      'Slab pour',
      'Slab curing',
    ],
  },
  {
    id: 'structure',
    name: 'Structure',
    tasks: [
      'Steel delivery',
      'Steel erection',
      'Floor decks',
      'Upper slab pour',
      'Stair cores',
      'Roof steel',
      'Bracing',
      'Fire protection',
      'Structural sign-off',
    ],
  },
  {
    id: 'envelope',
    name: 'Envelope',
    tasks: [
      'Roof membrane',
      'Roof insulation',
      'Wall framing',
      'Cladding rails',
      'Cladding panels',
      'Windows',
      'Entrance doors',
      'Sealants',
      'Watertight',
    ],
  },
  {
    id: 'services',
    name: 'Services',
    tasks: [
      'Drainage stacks',
      'Water supply',
      'Heating pipework',
      'Ventilation ducts',
      'Electrical first fix',
      'Data cabling',
      'Fire alarm',
      'Lifts',
      'Commissioning',
    ],
  },
  {
    id: 'finishes',
    name: 'Finishes',
    tasks: [
      'Partitions',
      'Plastering',
      'Ceilings',
      'Second fix',
      'Flooring',
      'Painting',
      'Kitchens and washrooms',
      'Snagging',
      'Handover',
    ],
  },
];

/** Progress from the dates at `now`: 100 once ended, 0 before the start, else the elapsed share */
function progressAt(start: Date, end: Date, now: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return end <= now ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - start.getTime()) / total) * 100)));
}

/**
 * A ten-week construction schedule of 60 rows: six phases (groups) that overlap, each with nine
 * tasks of 3 to 6 days, the last one the Handover milestone. Each phase starts after the third
 * task of the one before (finish to start), and its last task waits for its sixth. Ids: the phase
 * ids (`site`, `foundations`, `structure`, `envelope`, `services`, `finishes`) and `<phase>-<n>`
 * (n = 1 to 9; `finishes-9` is Handover).
 */
export function printTasks(now: Date = new Date()): GanttTask[] {
  const tasks: GanttTask[] = [];
  PHASES.forEach((phase, p) => {
    const base = -14 + p * 10;
    const children: GanttTask[] = phase.tasks.map((name, i) => {
      const last = i === phase.tasks.length - 1;
      const milestone = last && p === PHASES.length - 1;
      const from = base + 2 * i;
      const start = dayAt(now, from);
      const end = milestone ? start : dayAt(now, from + 3 + ((i * 7 + p * 3) % 4));
      const dependency =
        i === 0 && p > 0
          ? { taskId: `${PHASES[p - 1].id}-3`, type: DependencyType.FS }
          : last
            ? { taskId: `${phase.id}-6`, type: DependencyType.FS }
            : undefined;
      return {
        id: `${phase.id}-${i + 1}`,
        name,
        parentId: phase.id,
        ...(milestone ? { type: TaskType.Milestone } : {}),
        start,
        end,
        progress: progressAt(start, end, now),
        ...(dependency ? { dependency } : {}),
      };
    });
    const start = children[0].start;
    const end = children.reduce((max, c) => (c.end > max ? c.end : max), children[0].end);
    tasks.push(
      { id: phase.id, name: phase.name, type: TaskType.Group, start, end, progress: progressAt(start, end, now) },
      ...children,
    );
  });
  return tasks;
}

export const printCase: GalleryCaseData = {
  charts: now => [{ tasks: printTasks(now), options: PRINT_OPTIONS }],
};
