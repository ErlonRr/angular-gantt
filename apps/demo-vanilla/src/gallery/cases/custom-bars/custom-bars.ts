// Bars drawn by your own code: `renderBar` returns the SVG of every epic (`barType: 'epic'`, see
// epic-bar.ts) and `null` for the other bars, which keep the built-in look. Page CSS restyles the
// epic's `part`s in forced colours (custom-bars.css).
import '@gantryjs/vanilla';
import { CUSTOM_BARS_OPTIONS, RISKS, RISK_COLORS, RISK_LABELS, customBarsTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { renderEpicBar } from './epic-bar';
import './custom-bars.css';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = customBarsTasks(new Date());
  chart.options = CUSTOM_BARS_OPTIONS;
  chart.renderBar = renderEpicBar;

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'An epic underlines its progress; its badge shows its risk (L, M or H).';

  const legend = document.createElement('ul');
  legend.className = 'gs-case-legend';
  legend.setAttribute('aria-label', 'Risk badges');
  for (const risk of RISKS) {
    const swatch = document.createElement('span');
    swatch.className = 'gs-case-swatch';
    swatch.style.backgroundColor = RISK_COLORS[risk];
    const item = document.createElement('li');
    item.append(swatch, RISK_LABELS[risk]);
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
