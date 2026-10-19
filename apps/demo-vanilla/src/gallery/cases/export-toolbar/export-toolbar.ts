// The toolbar's Export menu (`toolbar.export`) saves SVG, PNG and CSV files and prints. Each one
// fires a cancelable `before-export` event first (`event.preventDefault()` vetoes it: PNG while
// "Block PNG" is on), then `export` with the file's name and size. The flag bars come from
// `renderBar` (flag-bar.ts), and the exports draw them too.
import '@gantryjs/vanilla';
import {
  EXPORT_TOOLBAR_HINT,
  EXPORT_TOOLBAR_INITIAL,
  EXPORT_TOOLBAR_OPTIONS,
  describeBlockedExport,
  describeExport,
  exportToolbarTasks,
  pushLog,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { flagBar } from './flag-bar';
import './export-toolbar.css';

export function mount(host: HTMLElement): () => void {
  let blockPng = EXPORT_TOOLBAR_INITIAL.blockPng;
  let lines: string[] = [];

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = exportToolbarTasks(new Date());
  chart.options = EXPORT_TOOLBAR_OPTIONS;
  chart.renderBar = flagBar;

  const log = document.createElement('ol');
  log.className = 'gs-case-log';
  log.setAttribute('aria-label', 'Exports');
  const write = (line: string) => {
    lines = pushLog(lines, line);
    log.replaceChildren(
      ...lines.map(text => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
  };

  // Synchronously, before the file is made: veto PNG while the switch is on
  chart.addEventListener('before-export', event => {
    if (!blockPng || event.detail.format !== 'png') return;
    event.preventDefault();
    write(describeBlockedExport(event.detail.format));
  });
  chart.addEventListener('export', event => write(describeExport(event.detail)));

  // "Block PNG": a switch
  const block = document.createElement('input');
  block.type = 'checkbox';
  block.setAttribute('role', 'switch');
  block.checked = blockPng;
  block.addEventListener('change', () => (blockPng = block.checked));
  const blockText = document.createElement('span');
  blockText.textContent = 'Block PNG';
  const blockSwitch = document.createElement('label');
  blockSwitch.className = 'gs-switch gs-case-control';
  blockSwitch.append(blockText, block);

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(blockSwitch);

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = EXPORT_TOOLBAR_HINT;

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
