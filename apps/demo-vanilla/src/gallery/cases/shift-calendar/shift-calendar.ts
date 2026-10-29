// A shift calendar (`calendar.unit: 'hour'`): working hours with a lunch break and a short Friday
// (`nonWorkingTime.workingHours`); bars skip the hours off, and Duration cells read and parse hours,
// a day being `calendar.hoursPerDay`. The Scale buttons follow the chart's own zoom (`view-mode-change`).
import '@gantryjs/vanilla';
import {
  SHIFT_FRIDAYS,
  SHIFT_HINT,
  SHIFT_HOURS_PER_DAY,
  SHIFT_INITIAL,
  SHIFT_VIEW_MODES,
  shiftOptions,
  shiftTasks,
  type GalleryChoice,
  type ShiftState,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  // Hours or Days, or a level picked in the chart's toolbar (then no Scale button is pressed)
  let state: ShiftState = SHIFT_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = shiftTasks(new Date());
  const scale = segmented('shift-calendar-scale', 'Scale', SHIFT_VIEW_MODES, viewMode => update({ viewMode }));
  const friday = segmented('shift-calendar-friday', 'Friday', SHIFT_FRIDAYS, value => update({ friday: value }));
  const update = (patch: Partial<ShiftState>) => {
    state = { ...state, ...patch };
    chart.options = shiftOptions(state);
    scale.press(state.viewMode);
    friday.press(state.friday);
  };
  update({});
  // The event's detail is `{ viewMode }`
  chart.addEventListener('view-mode-change', event => update({ viewMode: event.detail.viewMode }));

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    scale.control,
    select('shift-calendar-hours', 'Hours per day', SHIFT_HOURS_PER_DAY, state.hoursPerDay, hoursPerDay =>
      update({ hoursPerDay }),
    ),
    friday.control,
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = SHIFT_HINT;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, hint);
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

/** A labelled select over `choices`, picked by index: the hours are numbers, an option's value is a string. */
function select<T extends string | number>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
  const caption = document.createElement('label');
  caption.htmlFor = id;
  caption.textContent = label;
  const field = document.createElement('select');
  field.id = id;
  field.className = 'gs-select';
  for (const { value, label: text } of choices) field.append(new Option(text, String(value), false, value === initial));
  field.addEventListener('change', () => onPick(choices[field.selectedIndex].value));
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, field);
  return control;
}
