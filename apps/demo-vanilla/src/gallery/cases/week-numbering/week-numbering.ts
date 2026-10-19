// Week numbers in the header: the numbering rule (`weekNumbering`: ISO, US or the locale's), the first
// day of the week (`weekStart`) and the `locale`, on two zoom levels of its own (`WEEK_FORMATS`).
import '@gantryjs/vanilla';
import {
  WEEK_LOCALES,
  WEEK_NUMBERINGS,
  WEEK_NUMBERING_INITIAL,
  WEEK_STARTS,
  weekNumberingOptions,
  weekNumberingTasks,
  type GalleryChoice,
  type WeekNumberingChoice,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let choice: WeekNumberingChoice = WEEK_NUMBERING_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = weekNumberingTasks(new Date());
  const apply = (patch: Partial<WeekNumberingChoice>) => {
    choice = { ...choice, ...patch };
    // Its own zoom levels, `weekNumbering`, `weekStart` (unless "From the rule") and `locale`
    chart.options = weekNumberingOptions(choice);
  };
  apply({});

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    select('week-numbering-numbering', 'Numbering', WEEK_NUMBERINGS, choice.numbering, numbering =>
      apply({ numbering }),
    ),
    select('week-numbering-week-start', 'Week starts on', WEEK_STARTS, choice.weekStart, weekStart =>
      apply({ weekStart }),
    ),
    select('week-numbering-locale', 'Locale', WEEK_LOCALES, choice.locale, locale => apply({ locale })),
  );

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

/** A labelled select over `choices`, picked by index: the week starts are numbers. */
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
