// Copy buttons and polite announcements: one visually hidden status region for the page.
import { byId, drawIcon } from './dom';
import type { IconName } from 'demo-kit/icons';

let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Says `message` to screen readers through the page's `role="status"` region. */
export function announce(message: string): void {
  const status = byId('status');
  // Empty first, so the same message twice in a row is announced twice
  status.textContent = '';
  clearTimeout(clearTimer);
  requestAnimationFrame(() => {
    status.textContent = message;
    clearTimer = setTimeout(() => (status.textContent = ''), 4000);
  });
}

/**
 * Wires `button` (an icon `<svg>` + a text `<span>`) to copy `text()`: for a moment it shows a
 * check mark and `doneLabel`, and the copy is announced as `doneMessage`.
 */
export function copyButton(
  button: HTMLButtonElement,
  text: () => string,
  { icon, doneLabel = 'Copied', doneMessage }: { icon: IconName; doneLabel?: string; doneMessage: string },
): void {
  const svg = button.querySelector('svg');
  const label = button.querySelector('span');
  const idleLabel = label?.textContent ?? '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = (done: boolean) => {
    if (svg) drawIcon(svg, done ? 'check' : icon);
    if (label) label.textContent = done ? doneLabel : idleLabel;
  };

  button.addEventListener('click', () => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard) {
      announce('The clipboard is not available on this page.');
      return;
    }
    clipboard.writeText(text()).then(
      () => {
        show(true);
        announce(doneMessage);
        clearTimeout(timer);
        timer = setTimeout(() => show(false), 1600);
      },
      () => announce('Copying was blocked by the browser.'),
    );
  });
}
