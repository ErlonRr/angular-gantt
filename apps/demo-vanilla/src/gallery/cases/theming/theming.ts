// Theming <gantry-element>: a preset of theme overrides (`options.theme`) per mode, `darkMode`
// pinned or following the site, CSS custom properties set on the element (they win over the
// theme), and ::part() / :state(dark) rules in theming.css.
import '@gantryjs/vanilla';
import {
  THEMING_CSS_VARIABLES,
  THEMING_INITIAL,
  THEMING_MODES,
  THEMING_PRESETS,
  themingDark,
  themingOptions,
  themingTasks,
  type GalleryChoice,
} from 'demo-kit/gallery';
import { getTheme, onThemeChange } from 'demo-kit/theme';
import './theming.css';

export function mount(host: HTMLElement): () => void {
  let { preset, mode } = THEMING_INITIAL;
  let siteDark = getTheme() === 'dark';

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart themed-chart';
  chart.tasks = themingTasks(new Date());
  for (const [name, value] of Object.entries(THEMING_CSS_VARIABLES)) chart.style.setProperty(name, value);

  // The preset's overrides for the mode the chart shows
  const apply = () => {
    const dark = themingDark(mode, siteDark);
    chart.darkMode = dark;
    chart.options = themingOptions(preset, dark);
  };
  apply();
  const stopSite = onThemeChange(theme => {
    siteDark = theme === 'dark';
    apply();
  });

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('theming-theme', 'Theme', THEMING_PRESETS, preset, value => {
      preset = value;
      apply();
    }),
    segmented('theming-mode', 'Mode', THEMING_MODES, mode, value => {
      mode = value;
      apply();
    }),
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent =
    'The font, focus ring and row hover colour are CSS variables set on the element; page CSS draws the toolbar line and the dark-mode frame.';

  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, hint);
  host.append(root);
  return () => {
    stopSite();
    root.remove();
  };
}

/** A labelled group of toggle buttons, one pressed. */
function segmented<T extends string>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
  const name = document.createElement('span');
  name.id = `${id}-label`;
  name.textContent = label;
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', name.id);
  const buttons = choices.map(({ value, label: text }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = text;
    button.setAttribute('aria-pressed', String(value === initial));
    button.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      onPick(value);
    });
    return button;
  });
  group.append(...buttons);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(name, group);
  return control;
}
