// The `renderBar` of the case: a flag bar (`barType: 'flag'`) is the built-in bar (`renderDefault()`)
// with a pennant at its start (`FLAG_BAR.flagPath`); `null` keeps the built-in bar for every other
// task. The pennant's colour is a `fill` attribute resolved from the theme (`resolvePaint`), not a
// `var(--gantt-*)` style, so an export draws it as on screen; its `part` name lets page CSS restyle
// it in forced colours (the `<style>` of ExportToolbarExample.svelte).
import { resolvePaint, type GanttBarRenderer } from '@gantryjs/svelte';
import { FLAG_BAR } from 'demo-kit/gallery';

export const flagBar: GanttBarRenderer = (ctx, renderDefault) => {
  if (ctx.row.barType !== FLAG_BAR.type) return null;
  const bar = renderDefault();
  const pennant = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pennant.setAttribute('part', 'flag-pennant');
  pennant.setAttribute('d', FLAG_BAR.flagPath(ctx.visual));
  pennant.setAttribute('fill', resolvePaint(ctx.visual.paint.body, ctx.theme));
  bar.append(pennant);
  return bar;
};
