// ─────────────────────────────────────────────────────────────
//  gantry · editing/sessions.ts
//  Pointer and keyboard sessions of the Phase 11 surfaces, framework-
//  free like `DragSession`: dragging the progress grip, and creating a
//  link by dragging from a connector, clicking a connector then a bar
//  (WCAG 2.5.7), or L then Enter. The link type comes from the ends:
//  end → start FS, start → start SS, end → end FF, start → end SF.
//
//  The source is always the predecessor and the target the successor
//  (`linkChange` patches the target's `dependency`). The sessions only
//  propose: the binding sends `finish()`'s change through its editor
//  (`prepareChange`, `before-change`, history), which validates again.
// ─────────────────────────────────────────────────────────────

import type { BarVisual } from '../render/bars';
import type { ResolvedGanttConfig } from '../render/config';
import { linkPreviewPath } from '../render/links';
import {
  DEFAULT_LABELS,
  type DependencyType,
  type GanttChange,
  type GanttLabels,
  type GanttTask,
  type TaskProgressEvent,
} from '../types';
import { linkChange } from './changes';
import { linkError } from './validate';

// ─── Progress grip ────────────────────────────────────────────

/** Where a progress drag is: the progress shown and the grip's x. */
export interface ProgressPreview {
  taskId: string;
  /** 0–100, snapped to the step */
  progress: number;
  /** x of the progress edge */
  x: number;
}

const clampPct = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * Dragging a bar's progress grip: the progress follows the pointer (`bar.x` = 0 %, `bar.x + width`
 * = 100 %), snapped to `step` and clamped to 0–100. A pointer within half a step of the task's own
 * progress keeps it, so a drag back to where it started changes nothing even when that progress
 * is off the step grid.
 */
export class ProgressSession {
  readonly taskId: string;
  /** The task's progress when the drag started (`oldProgress`) */
  private readonly original: number;
  private readonly bar: { x: number; width: number };
  private readonly step: number;

  constructor(task: Pick<GanttTask, 'id' | 'progress'>, bar: { x: number; width: number }, options: { step: number }) {
    this.taskId = task.id;
    this.original = task.progress ?? 0;
    this.bar = bar;
    // `ResolvedEditing.progress.step` is already positive; anything else snaps to whole percent
    this.step = Number.isFinite(options.step) && options.step > 0 ? options.step : 1;
  }

  /** The progress at content x `x`. */
  preview(x: number): ProgressPreview {
    const { x: bx, width } = this.bar;
    const progress = width > 0 && Number.isFinite(x) ? this.snap(((x - bx) / width) * 100) : clampPct(this.original);
    return { taskId: this.taskId, progress, x: bx + (Math.max(width, 0) * progress) / 100 };
  }

  /** Released at `x`: the event to emit, or `null` when the progress did not change. */
  finish(x: number): TaskProgressEvent | null {
    const { progress } = this.preview(x);
    if (progress === this.original) return null;
    return { taskId: this.taskId, oldProgress: this.original, newProgress: progress };
  }

  private snap(raw: number): number {
    const v = clampPct(raw);
    const own = clampPct(this.original);
    if (Math.abs(v - own) < this.step / 2) return this.original;
    // Rounded to 1e-6 so fractional steps (2.5, 0.1) give clean values
    return Math.round(clampPct(Math.round(v / this.step) * this.step) * 1e6) / 1e6;
  }
}

// ─── Links ────────────────────────────────────────────────────

/** A task edge a link starts or ends at. */
export type LinkSide = 'start' | 'end';

/** How a link is being made: dragging from a connector, clicking a connector then a bar, or L then Enter. */
export type LinkMode = 'drag' | 'click' | 'keyboard';

/**
 * What names a link session's target: the pointer over a bar (`'pointer'`: the side is the nearer
 * connector), or a key on a focused bar (`'key'`: its start, so FS from an end connector; keyboard
 * mode always, and Enter / F2 / L finishing a click-mode link).
 */
export type LinkHoverBy = 'pointer' | 'key';

/** Where a link starts: the task, its edge and the connector's centre (timeline coordinates). */
export interface LinkEndpoint {
  taskId: string;
  side: LinkSide;
  x: number;
  y: number;
}

/** A bar under the pointer (or focused, in keyboard mode) while linking. */
export interface LinkHoverTarget {
  taskId: string;
  visual: BarVisual;
  /**
   * The bar accepts links (`editRules(row).linkTo`); `false` makes it an invalid target with
   * `labels.errorReadOnly`. Default `true` (`linkError` rejects an `editable: false` task anyway).
   */
  linkTo?: boolean | undefined;
}

/** The preview of a link session: the path to draw and whether letting go would create a link. */
export interface LinkPreview {
  /** `path.gantt-link-preview`'s `d` (`linkPreviewPath`): to the target's connector, else to the pointer */
  d: string;
  /** A link to the current target can be created */
  valid: boolean;
  targetId: string | null;
  targetSide: LinkSide | null;
  /** The type inferred from the ends (`inferLinkType`), `null` without a target */
  type: DependencyType | null;
  /** Why the target is invalid (`linkError`'s message), else `null` */
  reason: string | null;
}

/** What a `LinkSession` reads besides its start. */
export interface LinkSessionContext {
  tasks: readonly GanttTask[];
  config: ResolvedGanttConfig;
  mode: LinkMode;
  /** The error messages of invalid targets (default `DEFAULT_LABELS`) */
  labels?: GanttLabels | undefined;
}

/**
 * Creating one link: hover targets, then finish (a change through the pipeline) or cancel. The
 * tasks are read once per target (the check is memoised by target id), so a pointer move costs
 * one lookup after the first.
 */
export class LinkSession {
  readonly from: LinkEndpoint;
  readonly mode: LinkMode;
  private readonly ctx: LinkSessionContext;
  /** Why each target seen so far is invalid (`null`: valid) */
  private readonly errors = new Map<string, string | null>();
  /** The last hovered target, when valid: what `finish()` links to */
  private target: { taskId: string; type: DependencyType } | null = null;
  private done = false;

  constructor(from: LinkEndpoint, ctx: LinkSessionContext) {
    this.from = from;
    this.mode = ctx.mode;
    this.ctx = ctx;
  }

  /** The session was finished or cancelled: hovers show no target and `finish()` returns `null`. */
  get finished(): boolean {
    return this.done;
  }

  /**
   * The pointer is at `pointer` over `target` (`null`: no bar). The target side is its nearest
   * connector, else the nearer half of the bar (`linkTargetSide`); a target named by a key (`by:
   * 'key'`, and always in keyboard mode) is linked at its start (FS from the end connector `L`
   * starts at), wherever the pointer was. The source's own bar is no target (the pointer starts
   * there). An invalid target still gets the path to its connector, with `valid: false` and the
   * reason.
   */
  hover(target: LinkHoverTarget | null, pointer: { x: number; y: number }, by: LinkHoverBy = 'pointer'): LinkPreview {
    this.target = null;
    if (this.done || target === null || target.taskId === this.from.taskId) {
      return {
        d: linkPreviewPath(this.from, pointer),
        valid: false,
        targetId: null,
        targetSide: null,
        type: null,
        reason: null,
      };
    }
    const side: LinkSide =
      this.mode === 'keyboard' || by === 'key' ? 'start' : linkTargetSide(target.visual, pointer.x);
    const type = inferLinkType(this.from.side, side);
    const reason = this.errorOf(target);
    if (reason === null) this.target = { taskId: target.taskId, type };
    return {
      d: linkPreviewPath(this.from, linkEndPoint(target.visual, side)),
      valid: reason === null,
      targetId: target.taskId,
      targetSide: side,
      type,
      reason,
    };
  }

  /** Ends the session on the last hovered target: the link's change (`linkChange`), or `null` (no valid target). */
  finish(): GanttChange | null {
    if (this.done) return null;
    this.done = true;
    const target = this.target;
    this.target = null;
    if (!target) return null;
    return linkChange(
      this.ctx.tasks,
      { fromId: this.from.taskId, toId: target.taskId, type: target.type },
      'link',
      'link',
    );
  }

  /** Ends the session without a link. */
  cancel(): void {
    this.done = true;
    this.target = null;
  }

  /**
   * Why `target` can't be the successor: a target that refuses links (`errorReadOnly`), else
   * `linkError` with the pipeline's rules (missing task, duplicate — a link of any type between the
   * two tasks —, parent–child unless `editing.dependencies.parentChild`, cycle, a read-only end).
   */
  private errorOf(target: LinkHoverTarget): string | null {
    const labels = this.ctx.labels ?? DEFAULT_LABELS;
    if (target.linkTo === false) return labels.errorReadOnly;
    const id = target.taskId;
    const known = this.errors.get(id);
    if (known !== undefined) return known;
    const parentChild = this.ctx.config.editing.dependencies.parentChild;
    const reason = linkError(this.ctx.tasks, this.from.taskId, id, { parentChild, labels })?.message ?? null;
    this.errors.set(id, reason);
    return reason;
  }
}

/** The dependency type of a link from `fromSide` of the predecessor to `toSide` of the successor. */
export function inferLinkType(fromSide: LinkSide, toSide: LinkSide): DependencyType {
  if (fromSide === 'end') return toSide === 'start' ? 'FS' : 'FF';
  return toSide === 'start' ? 'SS' : 'SF';
}

/**
 * The side of a target bar a link at content x `x` ends on: the connector whose centre is nearer
 * (ties: the end), else, for a bar without connectors, the nearer half of the bar.
 */
export function linkTargetSide(visual: Pick<BarVisual, 'x' | 'width' | 'connectors'>, x: number): LinkSide {
  const c = visual.connectors;
  if (c) return Math.abs(x - c.start.cx) < Math.abs(x - c.end.cx) ? 'start' : 'end';
  return x < visual.x + visual.width / 2 ? 'start' : 'end';
}

/**
 * Where a link meets a bar's `side`: its connector's centre, else the bar's edge at its centre
 * line (a bar that shows no connectors).
 */
export function linkEndPoint(
  visual: Pick<BarVisual, 'x' | 'width' | 'cy' | 'connectors'>,
  side: LinkSide,
): { x: number; y: number } {
  const c = visual.connectors?.[side];
  if (c) return { x: c.cx, y: c.cy };
  return { x: side === 'start' ? visual.x : visual.x + visual.width, y: visual.cy };
}

/**
 * The link preview's path (`LinkPreview.d`) with the bars as they are now: from the source bar's
 * `side` connector to `to` — a target bar's connector on its side, or a point (the pointer, content
 * px). A session's `hover` draws it from the bars as they were then; the painters draw the open
 * preview with this from the current bar visuals, so a zoom (or any re-layout) during a session
 * never leaves it behind the bars.
 */
export function linkPreviewPathOf(
  source: Pick<BarVisual, 'x' | 'width' | 'cy' | 'connectors'>,
  side: LinkSide,
  to: { visual: Pick<BarVisual, 'x' | 'width' | 'cy' | 'connectors'>; side: LinkSide } | { x: number; y: number },
): string {
  return linkPreviewPath(linkEndPoint(source, side), 'visual' in to ? linkEndPoint(to.visual, to.side) : to);
}
