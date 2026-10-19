/**
 * @file styles.ts
 * Task styles: one resolver per chart (core `createStyleResolver`) that gives every row its
 * `ResolvedTaskStyle` — the cascade of `options.styles` (by kind, parents, levels, `rule`), the
 * rolled-up colour, the deprecated flat task fields and `task.style` — memoised per row object.
 * The bars (`computeBarVisual`), the row backgrounds and the task list (`rowPaint`), the tooltip
 * and custom bars (`GanttBarContext.style`) all read it.
 *
 * The resolver is rebuilt only when what it reads changes: the style options and how task dates
 * are read (compared by value, so a zoom keeps it), the critical path, the rollups and the day
 * (`nowDay`, for the status a `rule` sees — never the ticking clock). Without any `styles` layer
 * or rolled-up colour a row's style is its task's own (`taskOwnStyle`): the 1.x output.
 */

import { createStyleResolver, type ResolvedGanttConfig, type StyleResolver } from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import { structuralEqual } from '../inputs';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';
import type { RowsGraph } from './rows';

/** The part of the config the resolver reads. */
type StyleConfig = Pick<ResolvedGanttConfig, 'styles' | 'endDateMode' | 'normalizeDateOnly'>;

export interface StylesGraph {
  /** A row's resolved style (memoised per row object; a new resolver when its inputs change) */
  readonly rowStyle: ReadonlySignal<StyleResolver>;
}

export function stylesGraph(g: ConfigGraph & RowsGraph, node: NodeFactory): StylesGraph {
  const styleConfig = node(
    'styleConfig',
    (): StyleConfig => {
      const { styles, endDateMode, normalizeDateOnly } = g.config();
      return { styles, endDateMode, normalizeDateOnly };
    },
    // `styles.rule` compares by identity, everything else by value
    { equals: structuralEqual },
  );
  const rowStyle = node('rowStyle', () =>
    createStyleResolver({
      config: styleConfig(),
      critical: g.critical()?.criticalIds ?? null,
      rollups: g.rollups(),
      now: g.nowDay(),
    }),
  );
  return { rowStyle };
}
