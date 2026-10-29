// ─────────────────────────────────────────────────────────────
//  gantry · state/tooltip.ts
//  Renderer-agnostic task tooltip: its content (`buildTooltipModel`),
//  where it goes (`placeTooltip`) and when it opens and closes
//  (`reduceTooltip`). Both painters (one popover per chart) only turn
//  the model into markup, write the placement and run the timer the
//  machine asks for, so they show the same rows in the same order,
//  at the same place, at the same moments.
// ─────────────────────────────────────────────────────────────

import {
  DEFAULT_LABELS,
  DependencyType,
  TaskType,
  type GanttLabels,
  type GanttTask,
  type ResolvedTaskStyle,
  type TaskStatus,
} from '../types';
import { clamp, formatDate } from '../gantt-math';
import { formatFloat, measureVariance } from '../calendar/durations';
import { round1 } from '../calendar/time';
import { taskDependencies, taskDurationLabel, taskStatus } from '../render/columns';
import type { DateReading, ResolvedGanttConfig } from '../render/config';
import { themeVar, type Paint } from '../render/paint';
import { taskOwnStyle } from '../render/task-style';

// ─── Timing ───────────────────────────────────────────────────

/** How long the pointer rests on a bar before the tooltip opens (ms), in every binding. */
export const TOOLTIP_SHOW_DELAY = 320;
/** How long the tooltip stays open after the pointer left the bars (ms), in every binding. */
export const TOOLTIP_HIDE_DELAY = 120;

// ─── Placement ────────────────────────────────────────────────

/** Space between the bar and the tooltip (px), in every binding. */
export const TOOLTIP_GAP = 8;
/** Smallest distance kept to the viewport edges (px), in every binding. */
export const TOOLTIP_EDGE = 8;

/** A box in viewport (client) px. A `DOMRect` from `getBoundingClientRect()` fits as is. */
export interface TooltipAnchorRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TooltipPlacementInput {
  /** The bar's box in client px: the tooltip goes below it, or above when there is no room below */
  anchor: TooltipAnchorRect;
  /**
   * Pointer x in client px while hovering: the tooltip centres on it (kept within the anchor).
   * Omitted (focus, tap): it centres on the part of the anchor inside the viewport.
   */
  pointerX?: number | undefined;
  /** The tooltip's border-box size (one measurement per opening) */
  size: { readonly width: number; readonly height: number };
  /** Viewport size in px (`innerWidth` / `innerHeight`) */
  viewport: { readonly width: number; readonly height: number };
  /** Space between anchor and tooltip (default `TOOLTIP_GAP`) */
  gap?: number | undefined;
  /** Smallest distance to the viewport edges (default `TOOLTIP_EDGE`) */
  edge?: number | undefined;
}

export interface TooltipPlacement {
  /** Left edge in client px (the popover's `translate` x), rounded */
  x: number;
  /** Top edge in client px (the popover's `translate` y), rounded */
  y: number;
  /** `'below'` the anchor (preferred) or `'above'` it (no room below) */
  side: 'below' | 'above';
}

/**
 * Where the tooltip of a bar goes, in client px: centred under the bar (on the pointer while
 * hovering), flipped above it when it would cross the bottom edge, never closer than `edge` to
 * the viewport's sides, rounded to whole pixels. A tooltip that fits on neither side takes the
 * roomier one and is clamped; one larger than the viewport sticks to the top-left `edge`.
 */
export function placeTooltip(input: TooltipPlacementInput): TooltipPlacement {
  const { anchor, size, viewport } = input;
  const gap = input.gap ?? TOOLTIP_GAP;
  const edge = input.edge ?? TOOLTIP_EDGE;
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;

  let cx: number;
  if (input.pointerX !== undefined && Number.isFinite(input.pointerX)) {
    cx = clamp(input.pointerX, anchor.left, right);
  } else {
    // A long bar may reach past the viewport: centre on the part that shows
    const l = Math.max(anchor.left, 0);
    const r = Math.min(right, viewport.width);
    cx = l <= r ? (l + r) / 2 : clamp(anchor.left + anchor.width / 2, 0, viewport.width);
  }
  const x = withinEdges(cx - size.width / 2, edge, viewport.width - edge - size.width);

  const maxY = viewport.height - edge - size.height;
  const below = bottom + gap;
  const above = anchor.top - gap - size.height;
  let side: TooltipPlacement['side'];
  if (below <= maxY) side = 'below';
  else if (above >= edge) side = 'above';
  else side = viewport.height - bottom >= anchor.top ? 'below' : 'above';
  const y = withinEdges(side === 'below' ? below : above, edge, maxY);
  return { x: Math.round(x), y: Math.round(y), side };
}

/** `value` kept in `[min, max]`; `min` wins when the range is empty (too big to fit). */
function withinEdges(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// ─── Open / close machine ─────────────────────────────────────

/** What may open the tooltip (`config.tooltip.trigger`). */
export type TooltipTrigger = ResolvedGanttConfig['tooltip']['trigger'];
/** `opening` waits for the show delay, `closing` for the hide delay; only `open` and `closing` show the tooltip. */
export type TooltipPhase = 'closed' | 'opening' | 'open' | 'closing';
/** What opened the tooltip that shows */
export type TooltipSource = 'hover' | 'focus' | 'tap';

/** State of the chart's tooltip (one per chart). Plain data: bindings keep it and feed it back. */
export interface TooltipState {
  readonly phase: TooltipPhase;
  /** Task whose tooltip shows (`open` / `closing`) or is about to (`opening`); `null` while closed */
  readonly id: string | null;
  readonly source: TooltipSource | null;
  /** Task whose bar the pointer is over */
  readonly hovered: string | null;
  /** Task whose bar has keyboard focus */
  readonly focused: string | null;
  /** The pointer rests on the tooltip itself: it stays open (WCAG 1.4.13) */
  readonly onTooltip: boolean;
  /** Closed with `dismiss` (Esc, drag start): it stays closed until pointer or focus leaves that bar */
  readonly dismissed: string | null;
}

/**
 * What happened, as a binding sees it:
 * - `hover(id)` on every pointer move over a bar (mouse or pen hovering), `unhover` when the
 *   pointer is over no bar (moves off the bars, leaves the chart);
 * - `focus(id)` when a bar gets keyboard focus (focus moving from bar to bar needs no `blur`),
 *   `blur` when focus leaves the bars;
 * - `tap(id)` for a touch tap on a bar (toggles its tooltip);
 * - `dismiss` closes now: Esc, drag or move-mode start, a tap elsewhere, the row going away,
 *   `tooltipEnabled` or the tooltip options changing;
 * - `enterTooltip` / `leaveTooltip`: the pointer enters / leaves the tooltip;
 * - `timer`: the timer the last transition asked for ran out.
 */
export type TooltipEvent =
  | { readonly type: 'hover'; readonly id: string }
  | { readonly type: 'unhover' }
  | { readonly type: 'focus'; readonly id: string }
  | { readonly type: 'blur' }
  | { readonly type: 'tap'; readonly id: string }
  | { readonly type: 'dismiss' }
  | { readonly type: 'enterTooltip' }
  | { readonly type: 'leaveTooltip' }
  | { readonly type: 'timer' };

/** The resolved `config.tooltip` fits as is. */
export type TooltipMachineOptions = Pick<ResolvedGanttConfig['tooltip'], 'trigger' | 'showDelay' | 'hideDelay'>;

export interface TooltipTransition {
  /** The next state; the same object when nothing changed */
  readonly state: TooltipState;
  /**
   * A number: (re)start the chart's single tooltip timer with this delay in ms, replacing any
   * pending one, and send `timer` when it runs out. `null`: leave the timer alone. A timer the
   * state no longer waits for is harmless — `timer` only acts in `opening` and `closing` — so a
   * binding may also clear it whenever the next phase is `open` or `closed`.
   */
  readonly timer: number | null;
}

const CLOSED: TooltipState = Object.freeze({
  phase: 'closed',
  id: null,
  source: null,
  hovered: null,
  focused: null,
  onTooltip: false,
  dismissed: null,
});

/** The closed tooltip. */
export function initialTooltipState(): TooltipState {
  return CLOSED;
}

/** Task whose tooltip shows now (`open` or `closing`), or `null`. Esc closes it before clearing the selection (D24). */
export function tooltipVisibleId(state: TooltipState): string | null {
  return state.phase === 'open' || state.phase === 'closing' ? state.id : null;
}

/**
 * The tooltip's open / close rules, as a pure reducer.
 *
 * - **Hover** (`trigger` `'auto'` / `'hover'`): opens after `showDelay`, which restarts while
 *   the pointer keeps moving over the same bar (hover intent). Once a tooltip shows, hovering
 *   another bar switches to it at once. Leaving the bars closes it after `hideDelay`; the pointer
 *   can cross the gap and rest on the tooltip, which keeps it open.
 * - **Focus** (`'auto'` / `'focus'`): opens at once and stays while the bar has focus; `blur`
 *   closes it at once unless the pointer still holds it.
 * - **Tap** (`'auto'` only): toggles the tapped bar's tooltip, which then stays until another
 *   tap, `dismiss` or another bar's hover / focus.
 * - **Dismiss**: closes at once (pending opening included); the same bar does not reopen it
 *   until the pointer or focus has left it.
 *
 * A delay that is not a positive finite number means "at once". Bindings keep one timer and
 * follow `timer` (see `TooltipTransition`).
 */
export function reduceTooltip(
  state: TooltipState,
  event: TooltipEvent,
  options: TooltipMachineOptions,
): TooltipTransition {
  const rules: Rules = {
    hover: options.trigger !== 'focus',
    focus: options.trigger !== 'hover',
    tap: options.trigger === 'auto',
  };
  const showDelay = delayOf(options.showDelay);
  const hideDelay = delayOf(options.hideDelay);
  const visible = tooltipVisibleId(state) !== null;

  switch (event.type) {
    case 'hover': {
      if (!rules.hover) return stay(state);
      const id = event.id;
      if (visible) {
        // Same bar: cancels a pending hide; another bar: switches at once
        return state.id === id
          ? stay(patch(state, { phase: 'open', hovered: id }))
          : stay(patch(state, { phase: 'open', id, source: 'hover', hovered: id, onTooltip: false, dismissed: null }));
      }
      if (state.phase === 'opening' && state.id === id) {
        // Hover intent: the delay restarts while the pointer moves on the bar
        return showDelay ? { state, timer: showDelay } : stay(patch(state, { phase: 'open' }));
      }
      if (state.dismissed === id) return stay(patch(state, { hovered: id }));
      const next = patch(state, { id, source: 'hover', hovered: id, onTooltip: false, dismissed: null });
      return showDelay
        ? { state: patch(next, { phase: 'opening' }), timer: showDelay }
        : stay(patch(next, { phase: 'open' }));
    }

    case 'unhover': {
      if (!rules.hover) return stay(state);
      const next = patch(state, {
        hovered: null,
        dismissed: state.dismissed === state.hovered ? null : state.dismissed,
      });
      if (state.phase === 'opening') return stay(closed(next));
      if (state.phase === 'open' && !holds(next, rules)) return close(next, hideDelay);
      return stay(next);
    }

    case 'focus': {
      if (!rules.focus) return stay(state);
      const id = event.id;
      if (state.dismissed === id) return stay(patch(state, { focused: id }));
      if (visible && state.id === id) return stay(patch(state, { phase: 'open', focused: id }));
      return stay(patch(state, { phase: 'open', id, source: 'focus', focused: id, onTooltip: false, dismissed: null }));
    }

    case 'blur': {
      if (!rules.focus) return stay(state);
      const next = patch(state, {
        focused: null,
        dismissed: state.dismissed === state.focused ? null : state.dismissed,
      });
      if (state.phase !== 'open') return stay(next);
      if (!holds(next, rules)) return stay(closed(next));
      // Still held by the pointer: from now on the pointer's rules close it
      return stay(state.source === 'focus' ? patch(next, { source: 'hover' }) : next);
    }

    case 'tap': {
      if (!rules.tap) return stay(state);
      if (visible && state.id === event.id) return stay(closed(state));
      return stay(patch(state, { phase: 'open', id: event.id, source: 'tap', onTooltip: false, dismissed: null }));
    }

    case 'dismiss':
      return state.phase === 'closed' ? stay(state) : stay(patch(closed(state), { dismissed: state.id }));

    case 'enterTooltip':
      return visible ? stay(patch(state, { phase: 'open', onTooltip: true })) : stay(state);

    case 'leaveTooltip': {
      const next = patch(state, { onTooltip: false });
      if (state.phase === 'open' && !holds(next, rules)) return close(next, hideDelay);
      return stay(next);
    }

    case 'timer':
      if (state.phase === 'opening') return stay(patch(state, { phase: 'open' }));
      if (state.phase === 'closing') return stay(closed(state));
      return stay(state);
  }
}

/** Which inputs the trigger listens to */
interface Rules {
  readonly hover: boolean;
  readonly focus: boolean;
  readonly tap: boolean;
}

/** Something still wants the tooltip of `state.id`: the pointer (on the bar or the tooltip), focus, or a tap. */
function holds(state: TooltipState, rules: Rules): boolean {
  const id = state.id;
  if (id === null) return false;
  return (
    (rules.hover && (state.hovered === id || state.onTooltip)) ||
    (rules.focus && state.focused === id) ||
    (rules.tap && state.source === 'tap')
  );
}

function stay(state: TooltipState): TooltipTransition {
  return { state, timer: null };
}

/** Closing after `hideDelay` (at once when it is 0); an already pending hide keeps its deadline. */
function close(state: TooltipState, hideDelay: number): TooltipTransition {
  if (!hideDelay) return stay(closed(state));
  return { state: patch(state, { phase: 'closing' }), timer: hideDelay };
}

/** Closed, still knowing what the pointer and focus are on. */
function closed(state: TooltipState): TooltipState {
  return patch(state, { phase: 'closed', id: null, source: null, onTooltip: false });
}

/** `state` with `changes` applied; the same object when they change nothing. */
function patch(state: TooltipState, changes: Partial<TooltipState>): TooltipState {
  for (const key of Object.keys(changes) as (keyof TooltipState)[]) {
    if (changes[key] !== state[key]) return { ...state, ...changes };
  }
  return state;
}

/** A positive finite delay in ms, else 0 ("at once"). */
function delayOf(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

// ─── Labels ───────────────────────────────────────────────────

/** Tooltip-only strings (part of `GanttLabels`). */
export type TooltipExtraLabels = Pick<
  GanttLabels,
  'ttCritical' | 'ttCriticalValue' | 'ttFloat' | 'ttFloatDays' | 'ttFloatHours' | 'ttSuccessors'
>;

export const DEFAULT_TOOLTIP_LABELS: TooltipExtraLabels = {
  ttCritical: DEFAULT_LABELS.ttCritical,
  ttCriticalValue: DEFAULT_LABELS.ttCriticalValue,
  ttFloat: DEFAULT_LABELS.ttFloat,
  ttFloatDays: DEFAULT_LABELS.ttFloatDays,
  ttFloatHours: DEFAULT_LABELS.ttFloatHours,
  ttSuccessors: DEFAULT_LABELS.ttSuccessors,
};

/** Labels the tooltip reads (the chart labels, tooltip-only strings included). */
export type TooltipLabels = GanttLabels;

// ─── Model ────────────────────────────────────────────────────

export type TooltipRowKind = 'date' | 'duration' | 'progress' | 'status' | 'critical' | 'float' | 'baseline' | 'deps';

export interface TooltipRow {
  label: string;
  value: string;
  /** What the row shows; a painter may style a kind (e.g. draw a bar under `progress`) */
  kind?: TooltipRowKind | undefined;
}

export interface TooltipModel {
  /** Task name */
  title: string;
  kind: 'task' | 'milestone' | 'group' | 'resource';
  /** Label / value rows, in display order */
  rows: TooltipRow[];
  /** Progress 0–100 for the progress bar; `null` for a milestone (no bar) */
  progress: number | null;
  /** Status at `now` (explicit `task.status` wins), as the `status` column derives it */
  status: TaskStatus | (string & {});
  /** On the critical path (`criticalIds` contains the task) */
  critical: boolean;
  /** Finish variance against the baseline (`labels.varianceDays`); `null` without a baseline or with `config.baseline` off */
  baselineVariance: string | null;
  /** Predecessors as `labels.dependency` renders them, e.g. "Design (SS+2d)" */
  predecessors: string[];
  /** Tasks that depend on this one (needs `tasksById`) */
  successors: string[];
  /** Paints (theme tokens or the row's style colour); the chrome uses the `--gantt-tooltip-*` tokens */
  paint: TooltipPaint;
}

export interface TooltipPaint {
  /**
   * Fill of the progress bar, like the bar's body: `var(--gantt-critical)` on the critical path,
   * else the style's `color`, else `var(--gantt-bar)`
   */
  progress: Paint;
}

export interface TooltipInput {
  task: GanttTask;
  /**
   * How dates are read and measured (the chart's config: the working calendar changes the
   * duration, float and variance) and whether baseline rows are shown (`baseline`, like the bars)
   */
  config: Pick<ResolvedGanttConfig, 'baseline'> & DateReading;
  labels: TooltipLabels;
  locale?: string | undefined;
  /** Format of the dates (`formats.dateFormat`) */
  dateFormat: string;
  /** Clock for the status (pass the same `now` as the timeline) */
  now: Date;
  /** Critical task ids (`computeCriticalPath(...).criticalIds`) — omit when the critical path is off */
  criticalIds?: ReadonlySet<string> | undefined;
  /**
   * Total float per task id in measured days (`computeCriticalPath(...).floatMap`: working days
   * with a working calendar); not shown for a group
   */
  floatDays?: ReadonlyMap<string, number> | undefined;
  /** All tasks by id: resolves predecessor names and finds successors */
  tasksById?: ReadonlyMap<string, GanttTask> | undefined;
  /** The row has children (a group even without `type: 'group'`) */
  hasChildren?: boolean | undefined;
  /** Resolved bar type of the row (`GanttFlatRow.barType`); falls back to `task.barType` */
  barType?: string | undefined;
  /** Add a status row (default false) */
  showStatus?: boolean | undefined;
  /**
   * The row's resolved style (`createStyleResolver`, the one its bar is painted with); default:
   * the task's own style (`taskOwnStyle`)
   */
  style?: ResolvedTaskStyle | undefined;
}

// ─── Builder ──────────────────────────────────────────────────

/**
 * Finish variance in measured days (actual end − baseline end; working days with a working
 * calendar), rounded to 0.1 — like the `variance` column.
 */
export function baselineVarianceDays(
  task: Pick<GanttTask, 'start' | 'end' | 'baseline'>,
  dates: DateReading,
): number | null {
  const days = measureVariance(task, dates);
  return days === null ? null : round1(days);
}

/** Everything the task tooltip shows, as plain data. Pure: same input, same model. */
export function buildTooltipModel(input: TooltipInput): TooltipModel {
  const { task, config, labels, locale, dateFormat, now, criticalIds, floatDays, tasksById } = input;
  const extra: TooltipExtraLabels = { ...DEFAULT_TOOLTIP_LABELS, ...definedOnly(labels) };
  const fmt = (d: Date) => formatDate(d, dateFormat, locale);
  // Same type rule as the `type` column and the accessible name
  const type = task.type ?? (input.hasChildren ? TaskType.Group : (input.barType ?? task.barType ?? TaskType.Task));
  const kind: TooltipModel['kind'] =
    type === TaskType.Milestone ? 'milestone' : type === TaskType.Group ? 'group' : 'task';

  const rows: TooltipRow[] = [];
  let progress: number | null = null;
  if (kind === 'milestone') {
    rows.push({ label: labels.ttMilestone, value: fmt(task.start), kind: 'date' });
  } else {
    progress = clamp(task.progress ?? 0, 0, 100);
    rows.push(
      { label: labels.ttStart, value: fmt(task.start), kind: 'date' },
      { label: labels.ttEnd, value: fmt(task.end ?? task.start), kind: 'date' },
      { label: labels.ttDuration, value: taskDurationLabel(task, config, labels), kind: 'duration' },
      { label: labels.ttProgress, value: `${progress}%`, kind: 'progress' },
    );
  }

  const status = taskStatus(task, now, config);
  if (input.showStatus) rows.push({ label: labels.colStatus, value: statusLabel(status, labels), kind: 'status' });

  const critical = criticalIds?.has(task.id) ?? false;
  if (critical) rows.push({ label: extra.ttCritical, value: extra.ttCriticalValue, kind: 'critical' });
  // A summary's float says little about the summary itself, so groups leave it out
  const float = kind === 'group' ? undefined : floatDays?.get(task.id);
  if (float !== undefined) {
    rows.push({ label: extra.ttFloat, value: formatFloat(float, config, extra), kind: 'float' });
  }

  let baselineVariance: string | null = null;
  if (task.baseline && config.baseline) {
    if (kind === 'milestone') {
      rows.push({ label: labels.colBaselineStart, value: fmt(task.baseline.start), kind: 'baseline' });
    } else {
      rows.push(
        { label: labels.colBaselineStart, value: fmt(task.baseline.start), kind: 'baseline' },
        { label: labels.colBaselineEnd, value: fmt(task.baseline.end), kind: 'baseline' },
      );
    }
    const days = baselineVarianceDays(task, config);
    if (days !== null) {
      baselineVariance = labels.varianceDays(days);
      rows.push({ label: labels.colVariance, value: baselineVariance, kind: 'baseline' });
    }
  }

  const nameOf = (id: string) => tasksById?.get(id)?.name ?? id;
  const predecessors = taskDependencies(task).map(d =>
    labels.dependency(nameOf(d.taskId), d.type ?? DependencyType.FS, d.lag ?? 0),
  );
  const successors: string[] = [];
  if (tasksById) {
    for (const other of tasksById.values()) {
      if (other.id === task.id) continue;
      for (const d of taskDependencies(other)) {
        if (d.taskId === task.id)
          successors.push(labels.dependency(other.name, d.type ?? DependencyType.FS, d.lag ?? 0));
      }
    }
  }
  if (predecessors.length) rows.push({ label: labels.colPredecessors, value: predecessors.join(', '), kind: 'deps' });
  if (successors.length) rows.push({ label: extra.ttSuccessors, value: successors.join(', '), kind: 'deps' });

  return {
    title: task.name,
    kind,
    rows,
    progress,
    status,
    critical,
    baselineVariance,
    predecessors,
    successors,
    paint: {
      progress: critical
        ? themeVar('criticalColor')
        : ((input.style ?? taskOwnStyle(task)).color ?? themeVar('barColor')),
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Same mapping as the `status` column (render/columns.ts) and a11y/describe.ts — to be shared. */

function statusLabel(status: string, labels: GanttLabels): string {
  switch (status) {
    case 'notStarted':
      return labels.statusNotStarted;
    case 'inProgress':
      return labels.statusInProgress;
    case 'overdue':
      return labels.statusOverdue;
    case 'done':
      return labels.statusDone;
    default:
      return status;
  }
}

/** The tooltip-only labels a caller set (an `undefined` key keeps the default). */
function definedOnly(labels: TooltipLabels): Partial<TooltipExtraLabels> {
  const out: Partial<Record<keyof TooltipExtraLabels, unknown>> = {};
  for (const key of Object.keys(DEFAULT_TOOLTIP_LABELS) as (keyof TooltipExtraLabels)[]) {
    if (labels[key] !== undefined) out[key] = labels[key];
  }
  return out as Partial<TooltipExtraLabels>;
}
