// The tooltip content: `tooltip.render` returns a DOM node (or a string). It shows inside the
// chart's shadow root, out of reach of page CSS, so it is styled through the CSSOM with the chart's
// `--gantt-*` variables. Keep it free of side effects: the chart decides when to call it again.
import type { GanttTooltipRenderContext } from '@gantryjs/vanilla';
import { tooltipContent } from 'demo-kit/gallery';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  node.append(...children);
  return node;
}

/** The task name, its label/value lines, then a meter and the progress */
export function tooltipCard({ task }: GanttTooltipRenderContext): HTMLElement {
  const { title, lines, progress } = tooltipContent(task);
  const list = el('dl', { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: '0' });
  for (const { label, value } of lines) {
    list.append(
      el('dt', { opacity: '0.75' }, label),
      el('dd', { margin: '0', fontVariantNumeric: 'tabular-nums' }, value),
    );
  }
  const fill = el('span', { display: 'block', width: `${progress}%`, height: '100%', background: 'var(--gantt-bar)' });
  const meter = el(
    'span',
    { height: '6px', borderRadius: '3px', background: 'var(--gantt-grid-line)', overflow: 'hidden' },
    fill,
  );
  meter.setAttribute('aria-hidden', 'true'); // the text below says the same
  return el(
    'div',
    { display: 'grid', gap: '6px', minWidth: '180px' },
    el('strong', { fontSize: '13px' }, title),
    list,
    meter,
    el('span', {}, `${progress} % done`),
  );
}
