// Default styles by kind, parent, level and rule (`options.styles`), under each task's own `style`.
// Field by field the later layer wins; the legend lists the layers in the order they apply.
import { useState } from 'react';
import { Gantry } from '@gantryjs/react';
import { STYLES_OPTIONS, STYLES_PRECEDENCE, stylesTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function StylesExample() {
  const darkMode = useDarkMode();
  // The tree, one task with a `style` of its own (the last layer)
  const [tasks] = useState(() => stylesTasks(new Date()));

  return (
    <div className="gs-case">
      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={STYLES_OPTIONS} darkMode={darkMode} />
      <p className="gs-case-hint">Field by field, a later layer wins over an earlier one; class names add up.</p>
      <ol className="gs-case-legend" aria-label="Style layers, first to last">
        {STYLES_PRECEDENCE.map(({ layer, option, color }) => (
          <li key={layer}>
            {/* No colour: the layer keeps the colour it inherits (a neutral swatch) */}
            <span
              className="gs-case-swatch"
              style={color ? { backgroundColor: color } : undefined}
              aria-hidden="true"
            />
            {layer} <code className="gs-code-inline">{option}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
