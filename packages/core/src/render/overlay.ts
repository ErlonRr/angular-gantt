// ─────────────────────────────────────────────────────────────
//  gantry · render/overlay.ts
//  The bar overlay (`g.gantt-bar-overlay`): every shape drawn over the
//  bars, computed once for both painters (D11). Per bar, in order: the
//  focus ring, the resize grips (left, right), the progress grip, the
//  link connectors (start, end). They show where the grips showed before
//  editing: the keyboard-focused bar, the hovered bar with a fine
//  pointer, the selected bars with a coarse pointer — plus the bar whose
//  progress is being dragged, and the source and target bars of a link
//  session (which hides the resize and progress grips).
//
//    rect.gantt-bar-focus-ring · rect.gantt-bar-grip · rect.gantt-progress-grip
//    rect.gantt-link-connector(.gantt-link-connector--source | --target | --invalid)
//
//  Without editing (no progress grip, no connectors, no session) the
//  list is the ring and the grips both bindings drew before, shape for
//  shape: same keys, classes, order and rects.
// ─────────────────────────────────────────────────────────────

import type { BarConnector, BarVisual, Rect } from './bars';

/** One `rect` of the bar overlay. */
export interface OverlayShape {
  /**
   * Stable key for keyed lists: the row's key (the task id; a repeated id gets `\u0000n`, n ≥ 2)
   * and the shape — `\u0001ring`, `\u0001left`, `\u0001right`, `\u0001progress`,
   * `\u0001link-start`, `\u0001link-end`
   */
  key: string;
  /** `class` of the rect: one class, or the connector's class and its modifiers */
  className: string;
  /** The visual's own rect (`focusRect`, `handles.*.grip`, `progressGrip.grip`, `connectors.*.dot`), not a copy */
  rect: Rect & { rx: number };
}

/** The link session the overlay shows (source connector, target connector, invalid target). */
export interface BarOverlayLink {
  sourceId: string;
  /** The connector the link starts from (`--source`) */
  sourceSide: 'start' | 'end';
  /** The hovered (keyboard: focused) target bar, or `null` */
  targetId: string | null;
  /** The target's side (`--target`, or `--invalid`), `null` while undecided */
  targetSide: 'start' | 'end' | null;
  /** A link to the target can be created */
  valid: boolean;
}

/** What `computeBarOverlay` reads. */
export interface BarOverlayInput {
  /** The mounted bars and their visuals, in row order */
  rows: readonly { id: string; visual: BarVisual }[];
  /** The bar with keyboard focus (focus-visible), or `null` */
  focusVisibleId: string | null;
  /** The bar under a fine pointer, or `null` */
  hoveredId: string | null;
  /** The selected bars (their grips show with a coarse pointer) */
  selected: ReadonlySet<string>;
  /** The last pointer was coarse (touch) */
  coarse: boolean;
  /** The active link session, or `null` */
  link: BarOverlayLink | null;
  /**
   * A progress drag's preview: that bar keeps its grips while the pointer is off it (its visual,
   * computed with `progress: preview`, places the grip)
   */
  progressPreview: { taskId: string; progress: number } | null;
}

/** Class of a link connector. */
const LINK_CONNECTOR_CLASS = 'gantt-link-connector';

/**
 * The overlay's shapes in paint order: for each row in order, the focus ring (focus-visible bar),
 * the left and right resize grips, the progress grip, the start and end link connectors. A bar
 * shows them when it is focus-visible, hovered, selected with a coarse pointer, or the bar of a
 * progress drag; while a link is being made, the resize and progress grips are hidden and the
 * connectors show on those bars and on the session's source and target bars, the source
 * connector `--source`, the target's `--target` (or `--invalid`).
 */
export function computeBarOverlay(input: BarOverlayInput): OverlayShape[] {
  const { focusVisibleId, hoveredId, selected, coarse, link, progressPreview } = input;
  const shapes: OverlayShape[] = [];
  const seen = new Set<string>();
  for (const { id, visual: v } of input.rows) {
    let key = id;
    for (let n = 2; seen.has(key); n++) key = `${id}\u0000${n}`;
    seen.add(key);

    const ring = id === focusVisibleId;
    const shown = ring || id === hoveredId || (coarse && selected.has(id)) || progressPreview?.taskId === id;
    const source = link?.sourceId === id;
    const target = link?.targetId === id;
    if (!shown && !source && !target) continue;

    if (ring) shapes.push({ key: `${key}\u0001ring`, className: 'gantt-bar-focus-ring', rect: v.focusRect });
    if (!link && shown) {
      if (v.handles) {
        shapes.push({ key: `${key}\u0001left`, className: 'gantt-bar-grip', rect: v.handles.left.grip });
        shapes.push({ key: `${key}\u0001right`, className: 'gantt-bar-grip', rect: v.handles.right.grip });
      }
      if (v.progressGrip) {
        shapes.push({ key: `${key}\u0001progress`, className: 'gantt-progress-grip', rect: v.progressGrip.grip });
      }
    }
    if (!v.connectors) continue;
    for (const c of [v.connectors.start, v.connectors.end]) {
      shapes.push({
        key: `${key}\u0001link-${c.side}`,
        className: connectorClass(c, link, source, target),
        rect: c.dot,
      });
    }
  }
  return shapes;
}

/** The connector's class with its link-session modifiers. */
function connectorClass(c: BarConnector, link: BarOverlayLink | null, source: boolean, target: boolean): string {
  let cls = LINK_CONNECTOR_CLASS;
  if (!link) return cls;
  if (source && link.sourceSide === c.side) cls += ` ${LINK_CONNECTOR_CLASS}--source`;
  if (target && link.targetSide === c.side) cls += ` ${LINK_CONNECTOR_CLASS}--${link.valid ? 'target' : 'invalid'}`;
  return cls;
}
