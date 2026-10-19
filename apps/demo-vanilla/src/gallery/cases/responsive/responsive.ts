// A chart in a container whose width you set. Below `responsive.breakpoint` it shows
// `responsive.view` (the timeline alone by default); the toolbar moves what doesn't fit into a More
// menu or wraps it (`toolbar.overflow`), and `toolbar.panelToggle` shows or hides the task list.
import '@gantryjs/vanilla';
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
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let { overflow, narrowView } = RESPONSIVE_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = responsiveTasks(new Date());
  const apply = () => (chart.options = responsiveOptions(overflow, narrowView));
  apply();

  // The container: the chart measures its own width, so resizing the frame is all it takes
  const frame = document.createElement('div');
  frame.className = 'gs-case-frame';
  frame.append(chart);

  // "Container width": a range input with its value next to it
  const label = document.createElement('label');
  label.htmlFor = 'responsive-width';
  label.textContent = 'Container width';
  const width = document.createElement('input');
  width.id = 'responsive-width';
  width.type = 'range';
  width.className = 'gs-range';
  width.min = String(RESPONSIVE_WIDTH.min);
  width.max = String(RESPONSIVE_WIDTH.max);
  width.step = String(RESPONSIVE_WIDTH.step);
  width.value = String(RESPONSIVE_WIDTH.initial);
  width.style.width = '200px';
  const shown = document.createElement('span');
  shown.className = 'gs-value';
  shown.setAttribute('aria-hidden', 'true');
  const setWidth = () => {
    frame.style.width = `${width.value}px`;
    shown.textContent = `${width.value} px`;
    width.setAttribute('aria-valuetext', `${width.value} px`);
  };
  setWidth();
  width.addEventListener('input', setWidth);
  const widthControl = document.createElement('div');
  widthControl.className = 'gs-case-control';
  widthControl.append(label, width, shown);

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    widthControl,
    segmented('responsive-overflow', 'Toolbar overflow', RESPONSIVE_OVERFLOWS, overflow, value => {
      overflow = value;
      apply();
    }),
    segmented('responsive-view', 'Narrow view', RESPONSIVE_VIEWS, narrowView, value => {
      narrowView = value;
      apply();
    }),
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = `Below ${RESPONSIVE_BREAKPOINT} px the chart switches to the narrow view.`;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, frame, hint);
  host.append(root);
  return () => {
    stopTheme();
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
