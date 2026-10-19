/**
 * @file visuals.ts
 * Bar visuals, memoised per row geometry, the edit rules of each row, and the drag state the bars
 * and the overlay paint. A new visual memo starts whenever an input of `computeBarVisual` changes
 * (config, timeline, critical path, row styles, theme metrics, the edit rules); scrolling,
 * selection, drag moves and colour-only theme changes reuse every visual. The memo serves any
 * visible row, mounted or not (`getBarVisual` of a row outside the virtual window).
 *
 * Each visual gets its row's resolved style (`graph/styles.ts`), and a collapsed rolled-up parent
 * gets its children as segments (`rollup.segments`, core `rollupSegments`), each in its child's
 * style colour.
 *
 * Phase 11: what a row allows is core `editRules` (`editRules` node, memoised per row): its resize
 * handles, its progress grip and its link connectors come from them (D9, D11), never from the
 * task's fields. While a progress is being edited (`inputs.progressPreview`), `barVisual` draws that
 * bar with the previewed progress; every other bar keeps its memoised visual, and
 * `barVisualBase` (what the arrows read: the progress moves no bar end) does not change.
 */

import {
  computeBarVisual,
  computeDragGhostVisual,
  editRules as rulesOf,
  rollupSegments,
  taskOwnStyle,
  type BarSegment,
  type BarVisual,
  type EditRules,
  type GanttFlatRow,
  type GanttTask,
  type GhostVisual,
  type ResolvedTaskStyle,
  type RowGeometry,
} from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { CoreGraph } from '../engine';
import type { Inputs } from '../inputs';
import type { NodeFactory } from './node';

/** Bar visual of a row geometry (computed once per geometry while the memo lives). */
export type BarVisualOf = (geo: RowGeometry) => BarVisual;

/** What the user may change on a row (core `editRules`, memoised per row object). */
export type EditRulesOf = (row: GanttFlatRow) => EditRules;

export interface VisualsGraph {
  /**
   * Edit rules per row (core `editRules` with the config, `enableDrag` and `enableResize`): move,
   * resize, progress, link ends, cells. Bindings never test `draggable` / `enableDrag` themselves.
   */
  readonly editRules: ReadonlySignal<EditRulesOf>;
  /** Bar visuals as painted: the progress being edited (`inputs.progressPreview`) included */
  readonly barVisual: ReadonlySignal<BarVisualOf>;
  /** Bar visuals without the progress preview: the same object for every bar during a progress edit (arrows) */
  readonly barVisualBase: ReadonlySignal<BarVisualOf>;
  /** Task whose bar is being dragged or resized (dimmed), `null` when idle: changes once per gesture */
  readonly draggedBarId: ReadonlySignal<string | null>;
  /** The drag / resize ghost (`computeDragGhostVisual` with the row's resolved style), `null` when idle or when its row is gone */
  readonly ghostVisual: ReadonlySignal<GhostVisual | null>;
}

/** The visual factory: the memoised visual of a geometry, and one drawn with another progress. */
interface VisualFactory {
  readonly of: BarVisualOf;
  readonly withProgress: (geo: RowGeometry, progress: number) => BarVisual;
}

export function visualsGraph(I: Inputs, g: CoreGraph, node: NodeFactory): VisualsGraph {
  const editRules = node('editRules', (): EditRulesOf => {
    const ctx = { config: g.config(), enableDrag: I.enableDrag(), enableResize: I.enableResize() };
    const memo = new WeakMap<GanttFlatRow, EditRules>();
    return row => {
      let rules = memo.get(row);
      if (!rules) {
        rules = rulesOf(row, ctx);
        memo.set(row, rules);
      }
      return rules;
    };
  });
  const factory = node('barVisualFactory', (): VisualFactory => {
    const config = g.config();
    const { toX } = g.timeline();
    const { fontPx, barTextColor } = g.metrics();
    const critical = g.critical()?.criticalIds;
    const styleOf = g.rowStyle();
    const rulesOfRow = editRules();
    // Segments: only with `rollup.segments` (the rows are read only then)
    const rollup = config.rollup;
    const segmentsOn = rollup !== false && rollup.segments;
    const rollups = segmentsOn ? g.rollups() : null;
    const allRows = segmentsOn ? g.allRows() : null;
    let rowById: Map<string, GanttFlatRow> | undefined;
    /** A child's style for its segment colour: its row's (collapsed rows are kept, flagged), else its own */
    const childStyle = (child: GanttTask): ResolvedTaskStyle => {
      rowById ??= new Map(allRows?.map(r => [r.task.id, r]));
      const row = rowById.get(child.id);
      return row ? styleOf(row) : taskOwnStyle(child);
    };
    const segmentsOf = (row: GanttFlatRow): BarSegment[] | null => {
      if (!rollups || !row.hasChildren || !row.isCollapsed) return null;
      const info = rollups.get(row.task.id);
      return info ? rollupSegments(info, { toX, cfg: config, styleOf: childStyle }) : null;
    };
    const compute = (geo: RowGeometry, progress?: number): BarVisual => {
      const task = geo.row.task;
      const rules = rulesOfRow(geo.row);
      return computeBarVisual({
        geo,
        cfg: config,
        toX,
        fontPx,
        barTextColor,
        isCritical: critical?.has(task.id) ?? false,
        resizable: rules.resize,
        progressEditable: rules.progress,
        linkable: rules.linkFrom,
        style: styleOf(geo.row),
        segments: segmentsOf(geo.row),
        progress,
      });
    };
    const memo = new WeakMap<RowGeometry, BarVisual>();
    return {
      of: geo => {
        let v = memo.get(geo);
        if (!v) {
          v = compute(geo);
          memo.set(geo, v);
        }
        return v;
      },
      withProgress: compute,
    };
  });
  const barVisualBase = node('barVisualBase', () => factory().of);
  const barVisual = node('barVisual', (): BarVisualOf => {
    const { of, withProgress } = factory();
    const preview = I.progressPreview();
    if (!preview) return of;
    const memo = new WeakMap<RowGeometry, BarVisual>();
    return geo => {
      if (geo.row.task.id !== preview.taskId) return of(geo);
      let v = memo.get(geo);
      if (!v) {
        v = withProgress(geo, preview.progress);
        memo.set(geo, v);
      }
      return v;
    };
  });
  const draggedBarId = node('draggedBarId', () => I.dragPreview()?.taskId ?? null);
  const ghostVisual = node('ghostVisual', (): GhostVisual | null => {
    const preview = I.dragPreview();
    const geo = preview && g.geoById().get(preview.taskId);
    if (!preview || !geo) return null;
    // At its bar's height and radius: the row's resolved style, as `barVisual` paints it
    const style = g.rowStyle()(geo.row);
    return computeDragGhostVisual(preview, geo, g.config(), g.timeline().toX, g.i18n(), g.metrics().fontPx, style);
  });
  return { editRules, barVisual, barVisualBase, draggedBarId, ghostVisual };
}
