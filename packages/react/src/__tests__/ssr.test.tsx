// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Gantry, ViewMode, type GanttTask } from '../index';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
];

describe('<Gantry> on the server', () => {
  it('renders <gantry-element> without DOM APIs, warnings, or properties as attributes', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof HTMLElement).toBe('undefined');
    const errors = vi.spyOn(console, 'error');
    const html = renderToString(
      <Gantry
        className="chart"
        id="plan"
        style={{ height: 400 }}
        tasks={TASKS}
        options={{ viewMode: ViewMode.Week }}
        darkMode="auto"
        showToolbar={false}
        onTaskDragged={() => undefined}
      />,
    );
    expect(html).toBe(
      '<gantry-element style="display:block;width:100%;height:400px" class="chart" id="plan"></gantry-element>',
    );
    expect(errors).not.toHaveBeenCalled();
  });
});
