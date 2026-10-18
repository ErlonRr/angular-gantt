// Hydration: the markup `svelte/server` renders for `<Gantry>` is taken over on the client by
// `hydrate()` — the same `<gantry-element>`, no hydration warning, then the props and listeners on
// it as after `mount()`. The server build comes from the `svelte-server:` import (vitest.config.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrate, unmount, type Component, type ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import { Gantry, ViewMode, type GanttTask } from '../index';

type Props = ComponentProps<typeof Gantry>;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
  { id: 'b', name: 'Build', start: new Date(2026, 0, 21), end: new Date(2026, 1, 10), progress: 0 },
];

/** `Gantry.svelte` compiled for the server */
async function serverGantry(): Promise<Component<Props>> {
  const id = 'svelte-server:../Gantry.svelte';
  return ((await import(/* @vite-ignore */ id)) as { default: Component<Props> }).default;
}

const teardown: (() => void)[] = [];

afterEach(() => {
  for (const fn of teardown.splice(0)) fn();
  vi.restoreAllMocks();
});

describe('<Gantry> hydration', () => {
  it('takes over the server-rendered element: no warning, then its props and listeners', async () => {
    const onViewModeChange = vi.fn();
    const onSelectionChange = vi.fn();
    const props: Props = {
      tasks: TASKS,
      options: { viewMode: ViewMode.Week },
      showToolbar: false,
      onViewModeChange,
      onSelectionChange,
      class: 'chart',
      style: 'height: 300px',
    };
    const { body } = render(await serverGantry(), { props });
    expect(body).toContain('<gantry-element');

    const target = document.createElement('div');
    target.innerHTML = body;
    document.body.append(target);
    const server = target.querySelector('gantry-element')!;
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');

    const component = hydrate(Gantry, { target, props });
    teardown.push(() => {
      void unmount(component);
      target.remove();
    });
    flushSync();

    expect(target.querySelector('gantry-element')).toBe(server);
    expect(target.querySelectorAll('gantry-element')).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    // The props (data props one level copied: the same items)
    expect(server.tasks).toHaveLength(2);
    server.tasks.forEach((t, i) => expect(t).toBe(TASKS[i]));
    expect(server.viewMode).toBe(ViewMode.Week);
    expect(server.showToolbar).toBe(false);
    expect(server.className).toBe('chart');
    expect(server.style.height).toBe('300px');
    // The listeners: the first options assignment's event, then a later one
    expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith({ viewMode: ViewMode.Week });
    server.dispatchEvent(new CustomEvent('selection-change', { detail: { selectedIds: ['a'] }, bubbles: true }));
    expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith({ selectedIds: ['a'] });
  });
});
