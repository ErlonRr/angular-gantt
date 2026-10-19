// Week numbers in the header: the numbering rule (`weekNumbering`: ISO, US or the locale's), the first
// day of the week (`weekStart`) and the `locale`, on two zoom levels of its own (`WEEK_FORMATS`).
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  WEEK_LOCALES,
  WEEK_NUMBERINGS,
  WEEK_NUMBERING_INITIAL,
  WEEK_STARTS,
  weekNumberingOptions,
  weekNumberingTasks,
  type WeekNumberingChoice,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function WeekNumberingExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => weekNumberingTasks(new Date()));
  const [choice, setChoice] = useState<WeekNumberingChoice>(WEEK_NUMBERING_INITIAL);
  // Its own zoom levels, `weekNumbering`, `weekStart` (unless "From the rule") and `locale`
  const options = useMemo(() => weekNumberingOptions(choice), [choice]);
  const update = (patch: Partial<WeekNumberingChoice>) => setChoice(c => ({ ...c, ...patch }));

  return (
    <div className="gs-case">
      {/* Options are picked by index: the week starts are numbers (an option's value is a string) */}
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <label htmlFor="week-numbering-numbering">Numbering</label>
          <select
            id="week-numbering-numbering"
            className="gs-select"
            value={choice.numbering}
            onChange={e => update({ numbering: WEEK_NUMBERINGS[e.target.selectedIndex].value })}
          >
            {WEEK_NUMBERINGS.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gs-case-control">
          <label htmlFor="week-numbering-week-start">Week starts on</label>
          <select
            id="week-numbering-week-start"
            className="gs-select"
            value={String(choice.weekStart)}
            onChange={e => update({ weekStart: WEEK_STARTS[e.target.selectedIndex].value })}
          >
            {WEEK_STARTS.map(c => (
              <option key={c.value} value={String(c.value)}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gs-case-control">
          <label htmlFor="week-numbering-locale">Locale</label>
          <select
            id="week-numbering-locale"
            className="gs-select"
            value={choice.locale}
            onChange={e => update({ locale: WEEK_LOCALES[e.target.selectedIndex].value })}
          >
            {WEEK_LOCALES.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
    </div>
  );
}
