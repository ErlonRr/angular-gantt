// @vitest-environment node
// Server rendering: no DOM at all here. Importing the binding (and through it `@gantryjs/vanilla`)
// and rendering `<Gantry>` must not touch `document`, `window` or `HTMLElement`; the markup is the
// bare `<gantry-element>` with the consumer's attributes (no inline style of its own: strict CSP),
// no props or listeners serialised (the client sets them when it hydrates).
import { describe, it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { Gantry, ViewMode, type GanttTask } from '../index';

const tasks: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
];

describe('server rendering', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(typeof HTMLElement).toBe('undefined');
  });

  it('renders <gantry-element> without props or listeners in the markup', async () => {
    const app = createSSRApp({
      render: () =>
        h(Gantry, {
          class: 'chart',
          'aria-label': 'Roadmap',
          tasks,
          options: { viewMode: ViewMode.Week },
          darkMode: 'auto',
          showToolbar: false,
          renderBar: () => null,
          onTaskDragged: () => undefined,
        }),
    });
    const html = await renderToString(app);
    expect(html).toBe('<gantry-element class="chart" aria-label="Roadmap"></gantry-element>');
  });
});
