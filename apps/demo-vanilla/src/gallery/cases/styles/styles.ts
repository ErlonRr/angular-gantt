// Default styles by kind, parent, level and rule (`options.styles`), under each task's own `style`.
// Field by field the later layer wins; the legend lists the layers in the order they apply.
import '@gantryjs/vanilla';
import { STYLES_OPTIONS, STYLES_PRECEDENCE, stylesTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  // The tree, one task with a `style` of its own (the last layer)
  chart.tasks = stylesTasks(new Date());
  chart.options = STYLES_OPTIONS;

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'Field by field, a later layer wins over an earlier one; class names add up.';

  // The legend: each layer, its colour in this chart and the option that sets it
  const legend = document.createElement('ol');
  legend.className = 'gs-case-legend';
  legend.setAttribute('aria-label', 'Style layers, first to last');
  for (const { layer, option, color } of STYLES_PRECEDENCE) {
    // No colour: the layer keeps the colour it inherits (a neutral swatch)
    const swatch = document.createElement('span');
    swatch.className = 'gs-case-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    if (color) swatch.style.backgroundColor = color;
    const code = document.createElement('code');
    code.className = 'gs-code-inline';
    code.textContent = option;
    const item = document.createElement('li');
    item.append(swatch, `${layer} `, code);
    legend.append(item);
  }

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(chart, hint, legend);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}
