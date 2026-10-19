// ─────────────────────────────────────────────────────────────
//  gantry · render/links.ts
//  The preview of a link being created (`path.gantt-link-preview`, the
//  last child of the timeline SVG while a link session shows one): a
//  straight line with a small head, routed like `arrows.routing:
//  'straight'`. One path: the line (an open subpath) and the head (a
//  closed triangle), so a fill in the stroke's colour gives a solid head
//  under the dashed stroke while the line itself fills nothing.
// ─────────────────────────────────────────────────────────────

/** Length (px) of the link preview's head, from its base to its tip; it is 1.6 × as wide. */
export const LINK_PREVIEW_HEAD = 6;

/** Rounded to 1/100 px, never `-0`. */
const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;

/**
 * The `d` of the link preview from `from` (the source connector's centre) to `to` (the target
 * connector's centre, or the pointer): `M from L base M tip L wing L wing Z`. The line stops at
 * the base of the head, whose tip is on `to`; a preview shorter than its head is all head, and
 * one of no length points right.
 */
export function linkPreviewPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const [ux, uy] = len > 0 ? [dx / len, dy / len] : [1, 0];
  const hs = LINK_PREVIEW_HEAD;
  const bx = to.x - ux * hs;
  const by = to.y - uy * hs;
  const [lx, ly] = len > hs ? [bx, by] : [from.x, from.y];
  const nx = -uy * hs * 0.8;
  const ny = ux * hs * 0.8;
  return (
    `M${r2(from.x)},${r2(from.y)}L${r2(lx)},${r2(ly)}` +
    `M${r2(to.x)},${r2(to.y)}L${r2(bx - nx)},${r2(by - ny)}L${r2(bx + nx)},${r2(by + ny)}Z`
  );
}
