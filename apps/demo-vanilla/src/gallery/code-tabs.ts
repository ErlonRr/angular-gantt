// The code of a case: this app's own files of the case (read with `?raw`) and the shared data and
// options (`demo-kit/gallery/cases/<id>.ts`, from the generated sources). A tab list with automatic
// activation: one tab stop, ←/→ and Home/End move and select.
import type { CaseId } from 'demo-kit/gallery';
import { CASE_SOURCES, type SourceFile } from 'demo-kit/gallery/sources';
import { h, icon } from '../dom';
import { copyButton } from '../feedback';
import { ownSources } from './cases';
import { FRAMEWORK, FRAMEWORK_LABEL } from './links';

type Tab = typeof FRAMEWORK | 'shared';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: FRAMEWORK, label: FRAMEWORK_LABEL },
  { id: 'shared', label: 'Shared data' },
];

const PANEL = 'case-code-panel';

function codeBlock(file: SourceFile): HTMLElement {
  const copy = h(
    'button',
    { type: 'button', class: 'gs-copy', 'aria-label': `Copy ${file.file}` },
    icon('copy'),
    h('span', { 'aria-hidden': 'true' }, 'Copy'),
  );
  copyButton(copy, () => file.code, { icon: 'copy', doneMessage: `${file.file} copied to the clipboard` });
  return h(
    'div',
    { class: 'gs-code gs-code--scroll' },
    h('div', { class: 'gs-code-head' }, h('span', {}, file.file), copy),
    h('pre', { tabindex: 0, 'aria-label': `${file.file} code` }, h('code', {}, file.code)),
  );
}

/** The tab list and its panel for case `id` (the code loads on demand). */
export function codeTabs(id: CaseId): HTMLElement[] {
  let tab: Tab = FRAMEWORK;
  let loaded: { own: SourceFile[]; shared: SourceFile[] } | 'error' | null = null;

  const tabs = TABS.map(t =>
    h('button', { type: 'button', role: 'tab', class: 'gs-tab', id: `case-tab-${t.id}` }, t.label),
  );
  const list = h('div', { class: 'gs-tabs', role: 'tablist', 'aria-label': 'Code' }, ...tabs);
  const panel = h('div', { id: PANEL, class: 'gs-stack', role: 'tabpanel' });

  const hint = (text: string) => h('p', { class: 'gs-case-hint' }, text);

  const render = () => {
    TABS.forEach((t, i) => {
      const selected = t.id === tab;
      tabs[i].setAttribute('aria-selected', String(selected));
      tabs[i].tabIndex = selected ? 0 : -1;
      if (selected) tabs[i].setAttribute('aria-controls', PANEL);
      else tabs[i].removeAttribute('aria-controls');
    });
    panel.setAttribute('aria-labelledby', `case-tab-${tab}`);
    const label = TABS.find(t => t.id === tab)!.label;
    const files = loaded && loaded !== 'error' ? (tab === 'shared' ? loaded.shared : loaded.own) : [];
    panel.replaceChildren(
      ...(loaded === 'error'
        ? [hint('The code could not be loaded. Reload the page to try again.')]
        : !loaded
          ? [hint('Loading the code…')]
          : files.length
            ? files.map(codeBlock)
            : [
                hint(
                  `This example has no ${label} file yet: this page draws the shared data and options of the Shared data tab.`,
                ),
              ]),
    );
    // Without a code block (each one a tab stop) the panel itself is one
    if (files.length) panel.removeAttribute('tabindex');
    else panel.tabIndex = 0;
  };

  const select = (index: number, focus: boolean) => {
    const i = (index + TABS.length) % TABS.length;
    tab = TABS[i].id;
    render();
    if (focus) tabs[i].focus();
  };
  tabs.forEach((button, i) => button.addEventListener('click', () => select(i, false)));
  list.addEventListener('keydown', e => {
    const from = TABS.findIndex(t => t.id === tab);
    const to = new Map([
      ['ArrowRight', from + 1],
      ['ArrowLeft', from - 1],
      ['Home', 0],
      ['End', TABS.length - 1],
    ]).get(e.key);
    if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    select(to, true);
  });

  Promise.all([ownSources(id), CASE_SOURCES[id]()]).then(
    ([own, sources]) => {
      loaded = { own, shared: sources.shared };
      render();
    },
    () => {
      loaded = 'error';
      render();
    },
  );
  render();
  return [list, panel];
}
