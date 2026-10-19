// ─────────────────────────────────────────────────────────────
//  gantry · export/extent.ts
//  How far a bar reaches along the timeline (Phase 12): its body, its
//  baseline and its label. The timeline part leaves out the bars a
//  range doesn't reach (`buildTimelinePart`: no custom bar is rendered
//  for them), and a printed page the ones far off it (`renderExportSvg`).
//  Internal: not exported from the package root.
// ─────────────────────────────────────────────────────────────

import { estimateTextWidth, type BarVisual } from '../render/bars';

/**
 * Slack (px) around a bar or a link when testing whether it reaches a range or a page: what may
 * be drawn past its computed extent (a custom bar's flag or own label, a lag label).
 */
export const EXPORT_REACH_SLACK = 64;

/** Left and right timeline px of a bar's body, baseline and label (`fontPx`: the label's estimated width). */
export function barExtent(v: BarVisual, fontPx: number): { lo: number; hi: number } {
  let lo = v.x;
  let hi = v.x + v.width;
  if (v.baseline) {
    lo = Math.min(lo, v.baseline.x);
    hi = Math.max(hi, v.baseline.x + v.baseline.width);
  }
  if (v.label) {
    const tw = estimateTextWidth(v.label.text, fontPx);
    const from =
      v.label.anchor === 'start' ? v.label.x : v.label.anchor === 'end' ? v.label.x - tw : v.label.x - tw / 2;
    lo = Math.min(lo, from);
    hi = Math.max(hi, from + tw);
  }
  return { lo, hi };
}

/** A bar reaches timeline px `x0…x1` (with `EXPORT_REACH_SLACK`). */
export function barReaches(v: BarVisual, fontPx: number, x0: number, x1: number): boolean {
  const { lo, hi } = barExtent(v, fontPx);
  return hi + EXPORT_REACH_SLACK > x0 && lo - EXPORT_REACH_SLACK < x1;
}
