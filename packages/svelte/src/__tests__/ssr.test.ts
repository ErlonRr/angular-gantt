// @vitest-environment node
// Server rendering: `render()` from `svelte/server` emits the `<gantry-element>` tag with its
// attributes (no inline style of its own: strict CSP) and its children, and touches no DOM (there is
// none here); props and callbacks are not attributes.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { GANTRY_EVENTS, GANTRY_PROPERTIES } from '@gantryjs/vanilla';
import { Gantry, ViewMode, type GanttTask } from '../index';
import EmptyState from './EmptyState.svelte';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
];

describe('<Gantry> on the server', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof customElements).toBe('undefined');
  });

  it('emits <gantry-element> with the style and the other attributes, no property or callback', () => {
    const { body } = render(Gantry, {
      props: {
        tasks: TASKS,
        options: { viewMode: ViewMode.Week },
        annotations: [],
        darkMode: true,
        showToolbar: false,
        enableDrag: false,
        enableResize: false,
        tooltipEnabled: false,
        showLegend: true,
        dataSource: null,
        renderBar: () => null,
        loading: true,
        errorMessage: 'Offline',
        onTaskDragged: () => {},
        onRetry: () => {},
        onSelectionChange: () => {},
        class: 'chart',
        id: 'plan',
        style: 'height: 400px',
      },
    });
    const tag = /<gantry-element\b[^>]*>/.exec(body)?.[0];
    expect(tag).toBeDefined();
    expect(body).toContain('</gantry-element>');
    expect(tag).toContain('class="chart"');
    expect(tag).toContain('id="plan"');
    expect(tag).toContain('style="height: 400px"');
    // Attribute names, once the quoted values are emptied
    const attributes = [...tag!.replace(/"[^"]*"/g, '""').matchAll(/\s([^\s=>/]+)/g)].map(m => m[1]!.toLowerCase());
    expect(attributes.sort()).toEqual(['class', 'id', 'style']);
    for (const name of [...GANTRY_PROPERTIES, ...Object.values(GANTRY_EVENTS)]) {
      expect(attributes, name).not.toContain(name.toLowerCase());
    }
  });

  it('renders with no props: no attribute (no inline style of its own) and no content', () => {
    // (the comments are Svelte's anchors of the `empty` block and the children snippet)
    const { body } = render(Gantry, { props: {} });
    expect(body.replace(/<!--[^>]*-->/g, '')).toBe('<gantry-element></gantry-element>');
  });

  it('renders the empty snippet and the children inside the element', () => {
    const { body } = render(EmptyState, { props: { text: 'Nothing planned yet' } });
    const inner = /<gantry-element\b[^>]*>(.*)<\/gantry-element>/s.exec(body)?.[1];
    // Without Svelte's hydration comments
    expect(inner?.replace(/<!--[^>]*-->/g, '')).toBe(
      '<div slot="empty">Nothing planned yet</div><span class="note">Plan</span>',
    );
  });
});
