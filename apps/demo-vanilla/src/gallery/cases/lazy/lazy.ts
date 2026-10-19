// Tasks that arrive page by page from a slow fake API: a `GanttDataSource` in the element's
// `dataSource` property. A failed page is retried on its own, then the chart offers Retry; `reset()`
// starts again from page one. Its `onChange` callback and plain getters drive the status line.
import { GanttDataSource } from '@gantryjs/vanilla';
import { LAZY_OPTIONS, createLazyApi, lazySource, lazyStatus } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  // The fake server: `api.setFail(true)` makes its next answers fail
  const api = createLazyApi(new Date());
  // `fetcher`, `pageSize`, `retries` and `retryDelay` (`lazySource`)
  const source = new GanttDataSource(lazySource(api));

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.options = LAZY_OPTIONS;
  chart.dataSource = source;

  // "Fail requests": a switch
  const fail = document.createElement('input');
  fail.type = 'checkbox';
  fail.setAttribute('role', 'switch');
  fail.checked = api.fail;
  fail.addEventListener('change', () => api.setFail(fail.checked));
  const failText = document.createElement('span');
  failText.textContent = 'Fail requests';
  const failSwitch = document.createElement('label');
  failSwitch.className = 'gs-switch gs-case-control';
  failSwitch.append(failText, fail);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'gs-btn gs-btn--sm';
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => void source.reset());

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(failSwitch, reset);

  const status = document.createElement('p');
  status.className = 'gs-case-hint';
  const report = () => {
    status.textContent = lazyStatus(source);
  };
  source.onChange = report;
  report();

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, status);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
    // Cancel the page in flight
    source.onChange = undefined;
    source.destroy();
  };
}
