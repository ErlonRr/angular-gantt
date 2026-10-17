/**
 * @file tasklist.ts
 * Task-list nodes: the columns of the current view, the grid template the header row and every
 * row share, and the rows the list mounts (the virtual window plus the pinned rows, each pinned
 * one with its offset). Each compares by value, so a scroll that keeps the window, a zoom or an
 * option the task list does not show re-runs nothing that reads them.
 */

import { virtualIndexes, type GanttFlatRow } from '@gantry/core';
import type { ReadonlySignal } from '../../reactive';
import type { Columns } from '../../interaction/columns';
import type { VanillaColumnDef } from '../../types';
import type { CoreGraph } from '../engine';
import type { Inputs } from '../inputs';
import type { NodeFactory } from './node';

/** A row the task list mounts. */
export interface MountedRow {
  readonly row: GanttFlatRow;
  /**
   * Offset (px) of a row pinned outside the virtual window (the focused row): taken out of the
   * flow, since the spacers already cover it. `null` for the rows of the window.
   */
  readonly pinnedTop: number | null;
}

export interface TasklistGraph {
  /** Columns the task list shows in the current view (split panel or table view) */
  readonly tlColumns: ReadonlySignal<VanillaColumnDef[]>;
  /**
   * `grid-template-columns` of the header row and of every row: one column grows to fill a
   * panel wider than the columns, the `flex` one, else the last
   */
  readonly tlGridTemplate: ReadonlySignal<string>;
  /** Mounted rows in DOM order: pinned rows before the window, the window, pinned rows after it */
  readonly tlRows: ReadonlySignal<readonly MountedRow[]>;
}

const sameItems = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((v, i) => v === b[i]);

const sameRows = (a: readonly MountedRow[], b: readonly MountedRow[]) =>
  a.length === b.length && a.every((m, i) => m.row === b[i]?.row && m.pinnedTop === b[i]?.pinnedTop);

/** `grid-template-columns` for `cols` (see `TasklistGraph.tlGridTemplate`). */
export function gridTemplate(cols: readonly VanillaColumnDef[]): string {
  const flex = cols.findIndex(c => c.flex);
  const grow = flex >= 0 ? flex : cols.length - 1;
  return cols.map((c, i) => (i === grow ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(' ');
}

export function tasklistGraph(I: Inputs, g: CoreGraph, columns: Columns, node: NodeFactory): TasklistGraph {
  const tlColumns = node('tlColumns', () => columns.columnsFor(I.viewOverride(), g.config()), { equals: sameItems });
  const tlGridTemplate = node('tlGridTemplate', () => gridTemplate(tlColumns()));
  const tlRows = node(
    'tlRows',
    (): MountedRow[] => {
      const rows = g.visibleRows();
      const vw = g.vWindow();
      const rh = g.config().rowHeight;
      const out: MountedRow[] = [];
      for (const i of virtualIndexes(vw, rows.length)) {
        const row = rows[i];
        if (row) out.push({ row, pinnedTop: i < vw.first || i > vw.last ? row.visibleIndex * rh : null });
      }
      return out;
    },
    { equals: sameRows },
  );
  return { tlColumns, tlGridTemplate, tlRows };
}
