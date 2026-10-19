// Non-working time (`nonWorkingTime`): weekends and holidays shaded, hatched or greyed out (`style`);
// on the hour scale, the hours outside `workingHours` and an `intensiveHours` window too. The Scale
// buttons follow the chart's own zoom (`view-mode-change`).
import '@gantryjs/vanilla';
import {
  NON_WORKING_INITIAL,
  NON_WORKING_STYLES,
  NON_WORKING_VIEW_MODES,
  nonWorkingOptions,
  nonWorkingTasks,
  type GalleryChoice,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  // The holidays are placed around the same `now` as the tasks
  const now = new Date();
  let style = NON_WORKING_INITIAL.style;
  // Days or Hours, or a level picked in the chart's toolbar (then no Scale button is pressed)
  let viewMode: string = NON_WORKING_INITIAL.viewMode;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = nonWorkingTasks(now);
  const styles = segmented('non-working-style', 'Non-working time', NON_WORKING_STYLES, value => {
    style = value;
    apply();
  });
  const scales = segmented('non-working-scale', 'Scale', NON_WORKING_VIEW_MODES, value => {
    viewMode = value;
    apply();
  });
  const apply = () => {
    chart.options = nonWorkingOptions(style, viewMode, now);
    styles.press(style);
    scales.press(viewMode);
  };
  apply();
  // The event's detail is `{ viewMode }`
  chart.addEventListener('view-mode-change', event => {
    viewMode = event.detail.viewMode;
    apply();
  });

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(styles.control, scales.control);

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

/** A segmented control (a labelled group of buttons) and `press(value)`, which marks the pressed one. */
function segmented<T extends string>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  onPick: (value: T) => void,
): { control: HTMLElement; press: (value: string) => void } {
  const caption = document.createElement('span');
  caption.id = `${id}-label`;
  caption.textContent = label;
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', caption.id);
  const buttons = choices.map(choice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = choice.label;
    button.addEventListener('click', () => onPick(choice.value));
    group.append(button);
    return button;
  });
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, group);
  const press = (value: string) =>
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(choices[i].value === value)));
  return { control, press };
}
