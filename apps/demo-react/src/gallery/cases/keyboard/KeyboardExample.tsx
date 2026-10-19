// The chart from the keyboard alone: the key map, and an echo of what the chart announces to
// screen readers (its polite live region, read through the ref's shadow root).
import { Fragment, useEffect, useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import { KEYBOARD_KEYS, KEYBOARD_LIVE_SELECTOR, KEYBOARD_OPTIONS, keyboardTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function KeyboardExample() {
  const darkMode = useDarkMode();
  const chart = useRef<GantryElement>(null);
  const [tasks] = useState(() => keyboardTasks(new Date()));
  const [announced, setAnnounced] = useState('');

  useEffect(() => {
    const live = chart.current?.shadowRoot?.querySelector(KEYBOARD_LIVE_SELECTOR);
    if (!live) return;
    const observer = new MutationObserver(() => {
      const text = live.textContent?.trim();
      if (text) setAnnounced(text);
    });
    observer.observe(live, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="gs-case">
      <Gantry
        ref={chart}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={KEYBOARD_OPTIONS}
        darkMode={darkMode}
      />
      {/* A plain paragraph, not a live region: screen readers already hear the chart's own */}
      <p className="gs-case-hint">
        Announced: {announced || 'nothing yet. Tab into the chart, then select a row or zoom.'}
      </p>
      <dl className="gs-case-keys">
        {KEYBOARD_KEYS.map(({ area, keys, action }) => (
          <Fragment key={`${area} ${keys.join(' ')}`}>
            <dt>
              {keys.map(key => (
                <kbd key={key} className="gs-kbd">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>
              {area}: {action}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
