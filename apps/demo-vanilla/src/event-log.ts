// The Events card: what the chart dispatched, newest first, kept to the last 50. The list is a
// polite live region, so new entries are read out without moving focus.
import { byId, h } from './dom';

const MAX_ENTRIES = 50;

export interface EventLog {
  add(name: string, detail: string): void;
}

export function eventLog(): EventLog {
  const list = byId<HTMLUListElement>('events');
  const empty = byId('events-empty');
  const count = byId('events-count');
  const clear = byId<HTMLButtonElement>('events-clear');
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const render = () => {
    const n = list.childElementCount;
    count.textContent = String(n);
    empty.hidden = n > 0;
    // A scrollable list must be reachable with the keyboard; an empty one is no tab stop
    if (n) list.tabIndex = 0;
    else list.removeAttribute('tabindex');
  };

  clear.addEventListener('click', () => {
    list.replaceChildren();
    render();
  });

  render();
  return {
    add(name, detail) {
      const now = new Date();
      list.prepend(
        h(
          'li',
          {},
          h('time', { class: 'gs-log-time', datetime: now.toISOString() }, time.format(now)),
          h('span', { class: 'gs-log-name' }, name),
          h('span', { class: 'gs-log-detail' }, detail),
        ),
      );
      while (list.childElementCount > MAX_ENTRIES) list.lastElementChild!.remove();
      render();
    },
  };
}
