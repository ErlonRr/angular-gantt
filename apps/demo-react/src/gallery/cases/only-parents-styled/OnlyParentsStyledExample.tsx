// Collapsed parents painted from their children: `rollup.color` is `'status'` (the summary status of
// the children) or a callback (`mainTeamColor`), and `rollup.segments` draws each child inside the bar.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  ONLY_PARENTS_STYLED_COLORS,
  ONLY_PARENTS_STYLED_INITIAL,
  ONLY_PARENTS_STYLED_TEAMS,
  onlyParentsStyledOptions,
  onlyParentsStyledTasks,
  type OnlyParentsColor,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function OnlyParentsStyledExample() {
  const darkMode = useDarkMode();
  // The tree, every task in its team's colour (what the segments show)
  const [tasks] = useState(() => onlyParentsStyledTasks(new Date()));
  const [color, setColor] = useState<OnlyParentsColor>(ONLY_PARENTS_STYLED_INITIAL.color);
  const [segments, setSegments] = useState(ONLY_PARENTS_STYLED_INITIAL.segments);
  const options = useMemo(() => onlyParentsStyledOptions(color, segments), [color, segments]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <label htmlFor="only-parents-styled-color">Parent colour</label>
          <select
            id="only-parents-styled-color"
            className="gs-select"
            value={color}
            onChange={e => setColor(ONLY_PARENTS_STYLED_COLORS[e.target.selectedIndex].value)}
          >
            {ONLY_PARENTS_STYLED_COLORS.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Child segments</span>
          <input type="checkbox" role="switch" checked={segments} onChange={e => setSegments(e.target.checked)} />
        </label>
      </div>

      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
      <ul className="gs-case-legend" aria-label="Team colours">
        {ONLY_PARENTS_STYLED_TEAMS.map(team => (
          <li key={team.label}>
            <span className="gs-case-swatch" style={{ backgroundColor: team.color }} aria-hidden="true" />
            {team.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
