// ─────────────────────────────────────────────────────────────
//  gantry · export/table.ts
//  The task-list part of the export model (Phase 12, D3): the column
//  headers and one row of cells per shown row, at the widths painted
//  (the user's widths; the flex column fills the panel in the split
//  view, `max(sum, tableWidth)` in the table view), with the tree
//  indent, the collapse chevron, the task icon, the status dot and
//  fitted cell texts (ellipsis) — the task list's look
//  (`EXPORT_TABLE`, from the Web Component's task-list CSS).
//
//  Layout of a column (both painters: a grid cell with 8 px inline
//  padding and a 1 px right border; `COLUMN_CELL_INSET`):
//
//    x ─ 8 ─┬──────── content ────────┬─ 8 ─ 1 ─ x + width
//           start        middle      end         (the column's `align`)
//
//  Name cell (always laid out from the start, as the painters' full-width
//  `span.gantt-tl-name`):
//
//    x + 8 ─ indent ─ toggle 24 ─ 4 ─ icon 10 ─ 4 ─ name …
//                    (chevron or the leaf indent)
//
//  Text cell with a status dot (the dot and the text are one centred /
//  end-aligned group, as in the painters' flex cell):
//
//    dot 8 ─ 6 ─ text
// ─────────────────────────────────────────────────────────────

import type { ColumnDef, GanttFlatRow, GanttTheme } from '../types';
import { estimateTextWidth, fitText, type BarKind } from '../render/bars';
import { computeCellVisual } from '../render/columns';
import { resolvePaint } from '../render/paint';
import type { ChartExportSource } from './source';
import type { ExportLabel, Stroke } from './timeline';

/**
 * The task list's metrics (the Web Component's `styles/tasklist.css.ts`, the same in Angular):
 * cell padding, the header and group-name weight, the 24 px collapse toggle / leaf indent, the
 * gap inside the name cell, the chevron and icon glyph sizes, the status dot and its gap, the
 * cell borders. Texts: header labels and group names in `textPrimary`, other cells in
 * `textSecondary`, icons in `textMuted`.
 */
export const EXPORT_TABLE = Object.freeze({
  /** Inline padding of every cell and header cell (px) */
  cellPadX: 8,
  /** `font-weight` of the header labels */
  headerFontWeight: 600,
  /** `font-weight` of a group's name */
  groupFontWeight: 600,
  /** Width of the collapse toggle, and of the indent in its place on a leaf row (px) */
  toggle: 24,
  /** Gap between the toggle / indent, the icon and the name (px) */
  nameGap: 4,
  /** Size of the collapse chevron glyph (px) */
  chevronPx: 10,
  /** Size of the task icon glyph (px) */
  iconPx: 10,
  /** Diameter of the status dot (px) */
  statusDot: 8,
  /** Gap after the status dot (px) */
  statusDotGap: 6,
  /** Cell and row borders (px) */
  border: 1,
});

/**
 * One cell of a table row. Vertical placement is the row's (texts, chevron, icon and dot are
 * centred on its middle). In the name cell the leading parts sit at fixed offsets from the
 * column's left edge `colX` (the header cell's `x`): the toggle box (`EXPORT_TABLE.toggle` wide,
 * the chevron centred in it) at `colX + cellPadX + indent`, the icon box (`iconPx`) `nameGap`
 * after it, and the name `nameGap` after that, at `x` — so `x = colX + cellPadX + indent + toggle
 * + iconPx + 2 × nameGap`.
 */
export interface ExportCell {
  /** The cell text, fitted to the cell with an ellipsis */
  text: string;
  /** The full text (`<title>` of a fitted cell) */
  title: string;
  /** Text position by `anchor` (the column's `align`) */
  x: number;
  anchor: 'start' | 'middle' | 'end';
  /**
   * Text colour: `textSecondary`; a group's name (`chevron` set) `textPrimary` at
   * `EXPORT_TABLE.groupFontWeight`; a custom template cell's text `textPrimary`
   */
  fill: string;
  /** Tree indent before the name (px), 0 in other columns */
  indent: number;
  /** The name cell's collapse chevron (rows with children), else `null` */
  chevron: 'open' | 'closed' | null;
  /** The name cell's task icon, else `null` */
  icon: { kind: BarKind; fill: string } | null;
  /** The status cell's dot, else `null` */
  dot: { cx: number; r: number; fill: string } | null;
}

/** The task list: column headers and the shown rows, table-relative (`x` 0 = its left edge). */
export interface ExportTable {
  /**
   * Width of the task list: the `width` asked for, or the columns' total when wider (the painted
   * list is `max-content` wide with `min-width: 100%`)
   */
  width: number;
  header: {
    /** Header background */
    fill: string;
    /** One per column: its left edge, its width (the flex column's included) and its fitted label */
    cells: { key: string; x: number; width: number; label: ExportLabel }[];
    /** Column and bottom borders */
    border: Stroke;
  };
  /** One per row, cells in column order (the header cells give their `x` / `width`) */
  rows: { id: string; cells: ExportCell[] }[];
  /** Cell borders */
  border: Stroke;
}

/** Sizes and colours `buildTablePart` draws with. */
export interface ExportTableOptions {
  /**
   * The table's width (the split panel, or the table view's width): the flex column — the first
   * `flex` one, else the last (`columnsGridTemplate`) — grows to fill it; columns wider in total
   * make the table wider (`ExportTable.width`)
   */
  width: number;
  /** Height of the header row (the timeline header's, so both line up) */
  headerHeight: number;
  /** The export theme */
  theme: Required<GanttTheme>;
  /** Chart font size in px */
  fontPx: number;
}

type Anchor = ExportCell['anchor'];

const ANCHORS: Readonly<Record<NonNullable<ColumnDef['align']>, Anchor>> = {
  start: 'start',
  center: 'middle',
  end: 'end',
};

/** A finite, non-negative number (bad widths count as 0, as an unreadable grid track). */
const size = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/** Column widths as the painted grid lays them out (`columnsGridTemplate`): the grow column takes the rest. */
function columnWidths(columns: readonly ColumnDef[], width: number): number[] {
  const widths = columns.map(c => size(c.width));
  const rest = width - widths.reduce((a, b) => a + b, 0);
  if (rest > 0 && widths.length > 0) {
    const flex = columns.findIndex(c => c.flex);
    const grow = flex >= 0 ? flex : widths.length - 1;
    widths[grow] = (widths[grow] ?? 0) + rest;
  }
  return widths;
}

/** The content box of a column: inside the inline padding and the right border. */
function contentBox(x: number, width: number): { left: number; right: number; width: number } {
  const { cellPadX, border } = EXPORT_TABLE;
  const left = x + cellPadX;
  const right = Math.max(left, x + width - border - cellPadX);
  return { left, right, width: right - left };
}

/** x of a text by its anchor in a content box. */
function anchorX(anchor: Anchor, box: { left: number; right: number }): number {
  return anchor === 'start' ? box.left : anchor === 'end' ? box.right : (box.left + box.right) / 2;
}

/** The painters' task icon: by the row's children first (`▤`), then its bar type (`◆` / `▬`). */
function iconKind(row: GanttFlatRow): BarKind {
  return row.hasChildren ? 'group' : row.barType === 'milestone' ? 'milestone' : 'task';
}

/** The table part of the export model: `columns` (with their widths) over `rows`. Pure. */
export function buildTablePart(
  source: ChartExportSource,
  rows: readonly GanttFlatRow[],
  columns: readonly ColumnDef[],
  opts: ExportTableOptions,
): ExportTable {
  const { theme, fontPx } = opts;
  const T = EXPORT_TABLE;
  const ctx = source.columnCtx;
  const indentSize = source.config.indentSize;
  const minWidth = size(opts.width);
  const widths = columnWidths(columns, minWidth);

  // Left to right; `left` ends as the columns' total width
  let left = 0;
  const layout = columns.map((col, i) => {
    const width = widths[i] ?? 0;
    const x = left;
    left += width;
    return { col, x, width, box: contentBox(x, width), anchor: ANCHORS[col.align ?? 'start'] };
  });

  const border: Stroke = { stroke: theme.borderColor, width: T.border, dash: null };

  const headerCells = layout.map(({ col, x, width, box, anchor }) => ({
    key: col.key,
    x,
    width,
    label: { text: fitText(col.label, box.width, fontPx), x: anchorX(anchor, box), anchor },
  }));

  const cellOf = (c: (typeof layout)[number], row: GanttFlatRow): ExportCell => {
    const { col, box, anchor } = c;
    const empty = { indent: 0, chevron: null, icon: null, dot: null } as const;

    // A framework template can't be drawn here: its text (`exportValue`, else `render` / the field)
    if (col.cellTemplate != null) {
      const full = col.exportValue ? col.exportValue(row, ctx) : computeCellVisual(col, row, ctx).text;
      const text = fitText(full, box.width, fontPx);
      return { ...empty, text, title: full, x: anchorX(anchor, box), anchor, fill: theme.textPrimary };
    }

    // The name cell: indent, toggle (chevron) or leaf indent, icon, name — from the start
    if (col.key === 'name') {
      const full = !col.builtin && col.render ? col.render(row, ctx) : row.task.name;
      const indent = row.level * indentSize;
      const x = box.left + indent + T.toggle + T.nameGap + T.iconPx + T.nameGap;
      const color = source.rowStyle(row).color;
      return {
        text: fitText(full, Math.max(0, box.right - x), fontPx),
        title: full,
        x,
        anchor: 'start',
        fill: row.hasChildren ? theme.textPrimary : theme.textSecondary,
        indent,
        chevron: row.hasChildren ? (row.isCollapsed ? 'closed' : 'open') : null,
        icon: { kind: iconKind(row), fill: color ? resolvePaint(color, theme) : theme.textMuted },
        dot: null,
      };
    }

    // Other cells: the cell text, after the status dot (built-in `status`) as one aligned group
    const v = computeCellVisual(col, row, ctx);
    const lead = v.status ? T.statusDot + T.statusDotGap : 0;
    const text = fitText(v.text, Math.max(0, box.width - lead), fontPx);
    const textWidth = estimateTextWidth(text, fontPx);
    const start =
      anchor === 'start'
        ? box.left
        : anchor === 'end'
          ? box.right - lead - textWidth
          : box.left + (box.width - lead - textWidth) / 2;
    const x = anchor === 'start' ? box.left + lead : anchor === 'end' ? box.right : start + lead + textWidth / 2;
    const dot =
      v.status && v.dotPaint
        ? { cx: start + T.statusDot / 2, r: T.statusDot / 2, fill: resolvePaint(v.dotPaint, theme) }
        : null;
    return { ...empty, text, title: v.title ?? v.text, x, anchor, fill: theme.textSecondary, dot };
  };

  return {
    width: Math.max(minWidth, left),
    header: { fill: theme.headerBackground, cells: headerCells, border },
    rows: rows.map(row => ({ id: row.task.id, cells: layout.map(c => cellOf(c, row)) })),
    border,
  };
}
