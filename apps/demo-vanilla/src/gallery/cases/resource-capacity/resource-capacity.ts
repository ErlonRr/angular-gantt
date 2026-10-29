// Capacity and working time (`resources`, `calendar`): Ana's capacity moves the line her load is
// measured against, the Engineering team is two people, and with the working calendar on the weekend
// and the holiday carry no load. The chart and the status line follow the controls.
import '@gantryjs/vanilla';
import {
  CAPACITIES,
  CAPACITY_HINT,
  CAPACITY_INITIAL,
  capacityOptions,
  capacityResources,
  capacitySummary,
  capacityTasks,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { segmented } from './segmented';

export function mount(host: HTMLElement): () => void {
  // The holiday is placed around the same `now` as the tasks
  const now = new Date();
  const state = { ...CAPACITY_INITIAL };
  const tasks = capacityTasks(now);
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = tasks;
  const status = document.createElement('p');
  status.className = 'gs-case-status';

  // The resources, the options and the status line follow the controls
  const apply = () => {
    const resources = capacityResources(state);
    const options = capacityOptions(state, now);
    chart.resources = resources;
    chart.options = options;
    status.textContent = capacitySummary(tasks, resources, options);
  };
  apply();

  const calendar = document.createElement('input');
  calendar.id = 'resource-capacity-calendar';
  calendar.type = 'checkbox';
  calendar.setAttribute('role', 'switch');
  calendar.checked = state.calendar;
  calendar.addEventListener('change', () => {
    state.calendar = calendar.checked;
    apply();
  });
  const calendarText = document.createElement('span');
  calendarText.textContent = 'Working calendar';
  const calendarSwitch = document.createElement('label');
  calendarSwitch.className = 'gs-switch gs-case-control';
  calendarSwitch.append(calendarText, calendar);

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('resource-capacity-capacity', "Ana's capacity", CAPACITIES, state.anaCapacity, value => {
      state.anaCapacity = value;
      apply();
    }),
    calendarSwitch,
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = CAPACITY_HINT;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, status, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}
