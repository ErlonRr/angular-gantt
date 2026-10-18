/**
 * @file states.ts
 * The chart state (core `resolveChartState`): ready, loading, empty or error, from the `loading`
 * and `errorMessage` properties, the rows shown and the data source's load state. It compares by
 * value, so a task change that keeps the state (rows still shown) re-runs nothing that reads it.
 *
 * Readers: the host region (`aria-busy` on the host), the task list (its footer only while
 * `footer`) and the states region (the skeleton, error and empty boxes).
 */

import { resolveChartState, type ChartState } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import { structuralEqual, type Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { NodeFactory } from './node';
import type { RowsGraph } from './rows';

export interface StatesGraph {
  readonly chartState: ReadonlySignal<ChartState>;
}

export function statesGraph(I: Inputs, g: ChromeGraph & RowsGraph, node: NodeFactory): StatesGraph {
  const rowCount = node('rowCount', () => g.visibleRows().length);
  const chartState = node(
    'chartState',
    () =>
      resolveChartState({
        loading: I.loading(),
        errorMessage: I.errorMessage(),
        rowCount: rowCount(),
        source: I.loadState(),
        labels: g.i18n().labels,
      }),
    { equals: structuralEqual },
  );
  return { chartState };
}
