// Theming: a preset through the `theme` option (one set of overrides per mode), `darkMode` from the
// site or pinned, CSS custom properties in `style`, and the element's `::part` / `:state()` hooks
// in theming.css (the chart renders in a shadow root: page CSS reaches it only through these).
import { useMemo, useState, type CSSProperties } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  THEMING_CSS_VARIABLES,
  THEMING_INITIAL,
  THEMING_MODES,
  THEMING_PRESETS,
  themingDark,
  themingOptions,
  themingTasks,
  type GalleryChoice,
  type ThemingMode,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import './theming.css';

// Custom properties set on the element win over the theme (React sets `--*` keys as they are)
const CSS_VARIABLES = THEMING_CSS_VARIABLES as CSSProperties;

function Segmented<T extends string>(props: {
  id: string;
  label: string;
  choices: readonly GalleryChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="gs-case-control">
      <span id={props.id}>{props.label}</span>
      <div className="gs-seg" role="group" aria-labelledby={props.id}>
        {props.choices.map(choice => (
          <button
            key={choice.value}
            type="button"
            className="gs-seg-btn"
            aria-pressed={choice.value === props.value}
            onClick={() => props.onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ThemingExample() {
  const siteDark = useDarkMode();
  const [tasks] = useState(() => themingTasks(new Date()));
  const [preset, setPreset] = useState(THEMING_INITIAL.preset);
  const [mode, setMode] = useState<ThemingMode>(THEMING_INITIAL.mode);

  const darkMode = themingDark(mode, siteDark);
  // The preset's overrides for the mode the chart shows
  const options = useMemo(() => themingOptions(preset, darkMode), [preset, darkMode]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <Segmented
          id="theming-theme-label"
          label="Theme"
          choices={THEMING_PRESETS}
          value={preset}
          onChange={setPreset}
        />
        <Segmented id="theming-mode-label" label="Mode" choices={THEMING_MODES} value={mode} onChange={setMode} />
      </div>
      <Gantry
        className="gs-chart gs-case-chart themed-chart"
        style={CSS_VARIABLES}
        tasks={tasks}
        options={options}
        darkMode={darkMode}
      />
      <p className="gs-case-hint">
        The font, focus ring and row hover colour are CSS variables set on the element; page CSS draws the toolbar line
        and the dark-mode frame.
      </p>
    </div>
  );
}
