// One chart in four languages: `locale` gives the month and day names (through Intl),
// `formats.dateFormat` the dates and `labels` every UI string. Task names stay as they are.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import { I18N_INITIAL, I18N_LOCALES, i18nOptions, i18nTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function I18nExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => i18nTasks(new Date()));
  const [locale, setLocale] = useState(I18N_INITIAL);
  const options = useMemo(() => i18nOptions(locale), [locale]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="i18n-language-label">Language</span>
          <div className="gs-seg" role="group" aria-labelledby="i18n-language-label">
            {I18N_LOCALES.map(l => (
              <button
                key={l.value}
                type="button"
                className="gs-seg-btn"
                lang={l.value}
                aria-pressed={l.value === locale}
                onClick={() => setLocale(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* `lang` tells screen readers which language the chart speaks */}
      <Gantry className="gs-chart gs-case-chart" lang={locale} tasks={tasks} options={options} darkMode={darkMode} />
      <p className="gs-case-hint">Task names are your data and stay as they are; every string of the chart changes.</p>
    </div>
  );
}
