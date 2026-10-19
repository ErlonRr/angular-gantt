// Tooltip content of your own: `options.tooltip.render(ctx)` returns a DOM node (tooltip-card.ts),
// and `tooltip.trigger` opens it on hover, on keyboard focus or both.
import '@gantryjs/vanilla';
import type { GanttOptions } from '@gantryjs/vanilla';
import { TOOLTIP_INITIAL, TOOLTIP_TRIGGERS, tooltipOptions, tooltipTasks, type TooltipTrigger } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { tooltipCard } from './tooltip-card';

function options(trigger: TooltipTrigger): GanttOptions {
  const base = tooltipOptions(trigger);
  return { ...base, tooltip: { ...base.tooltip, render: tooltipCard } };
}

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = tooltipTasks(new Date());

  // "Trigger": a segmented control over the shared choices
  const label = document.createElement('span');
  label.id = 'tooltip-trigger-label';
  label.textContent = 'Trigger';
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = TOOLTIP_TRIGGERS.map(choice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = choice.label;
    button.addEventListener('click', () => pick(choice.value));
    return button;
  });
  group.append(...buttons);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(label, group);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(control);

  function pick(trigger: TooltipTrigger): void {
    chart.options = options(trigger);
    TOOLTIP_TRIGGERS.forEach(({ value }, i) => buttons[i].setAttribute('aria-pressed', String(value === trigger)));
  }
  pick(TOOLTIP_INITIAL);

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'Rest the pointer on a bar, or Tab to the bars and move with ↑ and ↓; Escape closes the tooltip.';

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}
