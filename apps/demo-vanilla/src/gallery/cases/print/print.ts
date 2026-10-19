// Prints every row of the schedule, not only the rows on screen: the element's async
// `print(options)` with the `paper`, `orientation`, `fit` and `repeatTable` the controls pick; the
// `export` event reports the pages printed.
import '@gantryjs/vanilla';
import {
  PRINT_FITS,
  PRINT_HINT,
  PRINT_INITIAL,
  PRINT_OPTIONS,
  PRINT_ORIENTATIONS,
  PRINT_PAPERS,
  describeExport,
  describeFailedExport,
  printOptionsOf,
  printTasks,
  pushLog,
  type GalleryChoice,
  type PrintState,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let state: PrintState = PRINT_INITIAL;
  let lines: string[] = [];
  const set = (patch: Partial<PrintState>) => (state = { ...state, ...patch });

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = printTasks(new Date());
  chart.options = PRINT_OPTIONS;

  // Not a live region: the chart announces each print itself
  const log = document.createElement('ol');
  log.className = 'gs-case-log';
  log.setAttribute('aria-label', 'Prints');
  const addLine = (line: string) => {
    lines = pushLog(lines, line);
    log.replaceChildren(
      ...lines.map(text => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
  };
  chart.addEventListener('export', event => addLine(describeExport(event.detail)));

  // A failed print, under the chart while there is one: the next print clears it
  const failure = document.createElement('p');
  failure.className = 'gs-case-hint';
  failure.setAttribute('role', 'alert');

  // "Repeat task list": a switch
  const repeat = document.createElement('input');
  repeat.type = 'checkbox';
  repeat.setAttribute('role', 'switch');
  repeat.checked = state.repeatTable;
  repeat.addEventListener('change', () => set({ repeatTable: repeat.checked }));
  const repeatText = document.createElement('span');
  repeatText.textContent = 'Repeat task list';
  const repeatSwitch = document.createElement('label');
  repeatSwitch.className = 'gs-switch gs-case-control';
  repeatSwitch.append(repeatText, repeat);

  // One print at a time; a failure (a `RangeError` over `maxPages`, say) shows under the chart
  const print = document.createElement('button');
  print.type = 'button';
  print.className = 'gs-btn gs-btn--sm';
  print.textContent = 'Print…';
  print.addEventListener('click', () => {
    if (print.ariaDisabled === 'true') return;
    print.ariaDisabled = 'true';
    failure.remove();
    void chart
      .print(printOptionsOf(state))
      .catch((error: unknown) => {
        failure.textContent = describeFailedExport(error);
        chart.after(failure);
      })
      .finally(() => (print.ariaDisabled = null));
  });

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    select('print-paper', 'Paper', PRINT_PAPERS, state.paper, paper => set({ paper })),
    segmented('print-orientation', 'Orientation', PRINT_ORIENTATIONS, state.orientation, orientation =>
      set({ orientation }),
    ),
    segmented('print-fit', 'Fit', PRINT_FITS, state.fit, fit => set({ fit })),
    repeatSwitch,
    print,
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = PRINT_HINT;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, log, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

/** A labelled select over `choices`. */
function select<T extends string>(
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
  for (const { value, label: text } of choices) field.append(new Option(text, value, false, value === initial));
  field.addEventListener('change', () => onPick(choices[field.selectedIndex].value));
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, field);
  return control;
}

/** A segmented control: a labelled group of buttons, the picked one pressed. */
function segmented<T extends string>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
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
    button.addEventListener('click', () => press(choice.value));
    group.append(button);
    return button;
  });
  const press = (value: T) => {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(choices[i].value === value)));
    onPick(value);
  };
  buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(choices[i].value === initial)));
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, group);
  return control;
}
