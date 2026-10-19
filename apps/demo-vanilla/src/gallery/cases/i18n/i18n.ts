// One chart in four languages: `options.locale` names the months and days (through Intl, nothing
// to import), `formats.dateFormat` writes the dates and `labels` every UI string. The element's
// `lang` attribute tells screen readers which language its strings are in.
import '@gantryjs/vanilla';
import { I18N_INITIAL, I18N_LOCALES, i18nOptions, i18nTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = i18nTasks(new Date());

  // "Language": each button names its language in that language
  const label = document.createElement('span');
  label.id = 'i18n-language-label';
  label.textContent = 'Language';
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = I18N_LOCALES.map(locale => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.lang = locale.value;
    button.textContent = locale.label;
    button.addEventListener('click', () => pick(locale.value));
    return button;
  });
  group.append(...buttons);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(label, group);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(control);

  function pick(locale: string): void {
    chart.options = i18nOptions(locale);
    chart.lang = locale;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.lang === locale));
  }
  pick(I18N_INITIAL);

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'Task names are your data and stay as they are; every string of the chart changes.';

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
