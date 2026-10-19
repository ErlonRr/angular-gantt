// Responsive: the chart measures its own width. Below `responsive.breakpoint` it shows
// `responsive.view`, and the toolbar moves what doesn't fit into a More menu or wraps
// (`toolbar.overflow`); `toolbar.panelToggle` shows or hides the task list.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  RESPONSIVE_BREAKPOINT,
  RESPONSIVE_INITIAL,
  RESPONSIVE_OVERFLOWS,
  RESPONSIVE_VIEWS,
  RESPONSIVE_WIDTH,
  responsiveOptions,
  responsiveTasks,
  type GalleryChoice,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

function Segmented<T extends string>(props: {
  id: string;
  label: string;
  choices: readonly GalleryChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="gs-case-control">
      <span id={`${props.id}-label`}>{props.label}</span>
      <div className="gs-seg" role="group" aria-labelledby={`${props.id}-label`}>
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

export default function ResponsiveExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => responsiveTasks(new Date()));
  const [width, setWidth] = useState<number>(RESPONSIVE_WIDTH.initial);
  const [overflow, setOverflow] = useState(RESPONSIVE_INITIAL.overflow);
  const [narrowView, setNarrowView] = useState(RESPONSIVE_INITIAL.narrowView);
  const options = useMemo(() => responsiveOptions(overflow, narrowView), [overflow, narrowView]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <label htmlFor="responsive-width">Container width</label>
          <input
            id="responsive-width"
            type="range"
            className="gs-range"
            style={{ width: 200 }}
            min={RESPONSIVE_WIDTH.min}
            max={RESPONSIVE_WIDTH.max}
            step={RESPONSIVE_WIDTH.step}
            value={width}
            aria-valuetext={`${width} px`}
            onChange={e => setWidth(e.currentTarget.valueAsNumber)}
          />
          <span className="gs-value" aria-hidden="true">
            {width} px
          </span>
        </div>
        <Segmented
          id="responsive-overflow"
          label="Toolbar overflow"
          choices={RESPONSIVE_OVERFLOWS}
          value={overflow}
          onChange={setOverflow}
        />
        <Segmented
          id="responsive-view"
          label="Narrow view"
          choices={RESPONSIVE_VIEWS}
          value={narrowView}
          onChange={setNarrowView}
        />
      </div>
      {/* The chart follows its container, not the window */}
      <div className="gs-case-frame" style={{ width }}>
        <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
      </div>
      <p className="gs-case-hint">Below {RESPONSIVE_BREAKPOINT} px the chart switches to the narrow view.</p>
    </div>
  );
}
