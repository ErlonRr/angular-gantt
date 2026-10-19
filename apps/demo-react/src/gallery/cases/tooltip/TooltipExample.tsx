// A custom tooltip: `options.tooltip.render` returns the content, a DOM node (tooltipCard.ts), not a
// React element; `tooltip.trigger` picks what opens it: hover, keyboard focus or both.
import { useMemo, useState } from 'react';
import { Gantry, type GanttOptions } from '@gantryjs/react';
import { TOOLTIP_INITIAL, TOOLTIP_TRIGGERS, tooltipOptions, tooltipTasks, type TooltipTrigger } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { tooltipCard } from './tooltipCard';

export default function TooltipExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => tooltipTasks(new Date()));
  const [trigger, setTrigger] = useState<TooltipTrigger>(TOOLTIP_INITIAL);

  const options = useMemo<GanttOptions>(() => {
    const base = tooltipOptions(trigger);
    return { ...base, tooltip: { ...base.tooltip, render: tooltipCard } };
  }, [trigger]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="tooltip-trigger-label">Trigger</span>
          <div className="gs-seg" role="group" aria-labelledby="tooltip-trigger-label">
            {TOOLTIP_TRIGGERS.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={choice.value === trigger}
                onClick={() => setTrigger(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
      <p className="gs-case-hint">
        Rest the pointer on a bar, or Tab to the bars and move with ↑ and ↓; Escape closes the tooltip.
      </p>
    </div>
  );
}
