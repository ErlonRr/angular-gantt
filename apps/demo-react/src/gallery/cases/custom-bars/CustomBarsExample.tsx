// Bars drawn by your own code: `renderBar` returns the SVG of every epic (`barType: 'epic'`, see
// epicBar.ts) and `null` for the other bars, which keep the built-in look. Page CSS restyles the
// epic's `part`s in forced colours (custom-bars.css). The renderer is a module-level function, so it
// stays the same on every render (a new function would re-render every bar).
import { useState } from 'react';
import { Gantry } from '@gantryjs/react';
import { CUSTOM_BARS_OPTIONS, RISKS, RISK_COLORS, RISK_LABELS, customBarsTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { renderEpicBar } from './epicBar';
import './custom-bars.css';

export default function CustomBarsExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => customBarsTasks(new Date()));

  return (
    <div className="gs-case">
      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={CUSTOM_BARS_OPTIONS}
        renderBar={renderEpicBar}
        darkMode={darkMode}
      />
      <p className="gs-case-hint">An epic underlines its progress; its badge shows its risk (L, M or H).</p>
      <ul className="gs-case-legend" aria-label="Risk badges">
        {RISKS.map(risk => (
          <li key={risk}>
            <span className="gs-case-swatch" style={{ backgroundColor: RISK_COLORS[risk] }} />
            {RISK_LABELS[risk]}
          </li>
        ))}
      </ul>
    </div>
  );
}
