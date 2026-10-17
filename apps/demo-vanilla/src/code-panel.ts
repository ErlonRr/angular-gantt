// The Code card: one tab per framework (arrow keys move between them) over a dark code block
// that prints what the preview runs (`playgroundCode`), with a Copy button.
import { playgroundCode, type PlaygroundState } from 'demo-kit/playground';
import { FRAMEWORKS, type FrameworkId } from 'demo-kit/site';
import { byId, h } from './dom';
import { copyButton } from './feedback';

/** The file each snippet would live in, shown in the code block's header. */
const FILES: Record<FrameworkId, string> = {
  html: 'index.html',
  js: 'main.js',
  angular: 'plan.component.ts',
  react: 'Plan.tsx',
  vue: 'Plan.vue',
  svelte: 'Plan.svelte',
};

export interface CodePanel {
  /** Prints `state` in the selected framework. */
  update(state: PlaygroundState): void;
}

export function codePanel(initial: PlaygroundState): CodePanel {
  const tablist = byId('code-tabs');
  const panel = byId('code-panel');
  const file = byId('code-file');
  const code = byId('code');
  const pre = byId('code-pre');

  let state = initial;
  let active: FrameworkId = FRAMEWORKS[0].id;

  const tabs = FRAMEWORKS.map(f =>
    h(
      'button',
      { type: 'button', role: 'tab', class: 'gs-tab', id: `code-tab-${f.id}`, 'aria-controls': panel.id },
      f.label,
    ),
  );
  tablist.append(...tabs);

  const render = () => {
    FRAMEWORKS.forEach((f, i) => {
      const selected = f.id === active;
      tabs[i].setAttribute('aria-selected', String(selected));
      tabs[i].tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `code-tab-${active}`);
    file.textContent = FILES[active];
    pre.setAttribute('aria-label', `${FILES[active]} code`);
    code.textContent = playgroundCode(state, active, new Date());
  };

  const select = (index: number, focus: boolean) => {
    const n = FRAMEWORKS.length;
    const i = ((index % n) + n) % n;
    active = FRAMEWORKS[i].id;
    render();
    if (focus) tabs[i].focus();
  };

  tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i, false)));
  tablist.addEventListener('keydown', e => {
    const current = FRAMEWORKS.findIndex(f => f.id === active);
    const target = new Map([
      ['ArrowRight', current + 1],
      ['ArrowLeft', current - 1],
      ['Home', 0],
      ['End', FRAMEWORKS.length - 1],
    ]).get(e.key);
    if (target === undefined) return;
    e.preventDefault();
    select(target, true);
  });

  copyButton(byId<HTMLButtonElement>('copy-code'), () => code.textContent ?? '', {
    icon: 'copy',
    doneMessage: 'Code copied to the clipboard',
  });

  render();
  return {
    update(next) {
      state = next;
      code.textContent = playgroundCode(state, active, new Date());
    },
  };
}
