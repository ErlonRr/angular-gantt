// The chart from the keyboard alone: the key map beside it, and an echo of what the chart says to
// screen readers. Its polite live region is in its (open) shadow root; a MutationObserver copies
// each announcement onto the page.
import '@gantryjs/vanilla';
import { KEYBOARD_KEYS, KEYBOARD_LIVE_SELECTOR, KEYBOARD_OPTIONS, keyboardTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = keyboardTasks(new Date());
  chart.options = KEYBOARD_OPTIONS;

  // The echo is plain text, not a live region: screen readers already hear the chart's own
  const echo = document.createElement('p');
  echo.className = 'gs-case-hint';
  echo.textContent = 'Announced: nothing yet. Tab into the chart, then select a row or zoom.';

  // The key map: the keys of each row in <kbd>, then where they work and what they do
  const keys = document.createElement('dl');
  keys.className = 'gs-case-keys';
  for (const { area, keys: combo, action } of KEYBOARD_KEYS) {
    const term = document.createElement('dt');
    for (const key of combo) {
      const kbd = document.createElement('kbd');
      kbd.className = 'gs-kbd';
      kbd.textContent = key;
      term.append(kbd);
    }
    const detail = document.createElement('dd');
    detail.textContent = `${area}: ${action}`;
    keys.append(term, detail);
  }

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(chart, echo, keys);
  host.append(root);

  // The live region exists once the element is connected
  const live = chart.shadowRoot?.querySelector(KEYBOARD_LIVE_SELECTOR);
  const observer = new MutationObserver(() => {
    const text = live?.textContent?.trim();
    if (text) echo.textContent = `Announced: ${text}`;
  });
  if (live) observer.observe(live, { childList: true, characterData: true, subtree: true });

  return () => {
    observer.disconnect();
    stopTheme();
    root.remove();
  };
}
