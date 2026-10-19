// Phase 10 surface of the React binding: `syncGroup` comes from the element's property table like
// every other prop, with nothing of its own in the wrapper. The consumer's group reaches the
// element by identity (never copied), is written once per change, `undefined` restores the
// element's default (`null`), a group never passed is not written, and it is never an attribute.
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { GANTRY_PROPERTIES } from '@gantryjs/vanilla';
import {
  Gantry,
  createGanttSyncGroup,
  type GantryElement,
  type GantryProps,
  type GanttSyncGroup,
  type GanttTask,
} from '../index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
];

let host: HTMLDivElement | undefined;
let root: Root | undefined;

async function render(node: ReactNode): Promise<void> {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(node));
}

function elements(): GantryElement[] {
  return [...(host?.querySelectorAll('gantry-element') ?? [])];
}

function element(): GantryElement {
  const el = elements()[0];
  if (!el) throw new Error('no <gantry-element>');
  return el;
}

/** Spies on the element's `syncGroup` setter (it still writes the element). */
function spySyncGroup() {
  const proto = customElements.get('gantry-element')!.prototype as GantryElement;
  return vi.spyOn(proto, 'syncGroup', 'set');
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
});

describe('<Gantry> syncGroup (React)', () => {
  it('is a prop the wrapper forwards, typed as the element property', () => {
    expect(GANTRY_PROPERTIES).toContain('syncGroup');
    expectTypeOf<GantryProps['syncGroup']>().toEqualTypeOf<GanttSyncGroup | null | undefined>();
  });

  it('passes the group by identity, written once per change', async () => {
    const set = spySyncGroup();
    const group = createGanttSyncGroup();
    await render(<Gantry tasks={TASKS} syncGroup={group} />);
    const el = element();
    expect(el.syncGroup).toBe(group);
    expect(set).toHaveBeenCalledOnce();
    expect(set.mock.calls[0]![0]).toBe(group);
    // A property, never an attribute
    expect(el.hasAttribute('syncgroup')).toBe(false);
    expect(el.hasAttribute('sync-group')).toBe(false);

    // Re-rendered with the same group (another prop changed): not written again
    await render(<Gantry tasks={[]} syncGroup={group} />);
    expect(set).toHaveBeenCalledOnce();
    expect(el.syncGroup).toBe(group);

    // Another group replaces it; `null` leaves the group
    const other = createGanttSyncGroup({ panel: false });
    await render(<Gantry tasks={TASKS} syncGroup={other} />);
    expect(el.syncGroup).toBe(other);
    await render(<Gantry tasks={TASKS} syncGroup={null} />);
    expect(el.syncGroup).toBeNull();
    expect(set.mock.calls.map(([value]) => value)).toEqual([group, other, null]);
  });

  it('undefined (or dropping the prop) restores the default, null', async () => {
    const group = createGanttSyncGroup();
    await render(<Gantry syncGroup={group} />);
    expect(element().syncGroup).toBe(group);

    await render(<Gantry syncGroup={undefined} />);
    expect(element().syncGroup).toBeNull();

    await render(<Gantry syncGroup={group} />);
    expect(element().syncGroup).toBe(group);
    await render(<Gantry />);
    expect(element().syncGroup).toBeNull();
  });

  it('never writes a group it was not given: one set on the element survives re-renders', async () => {
    const set = spySyncGroup();
    await render(<Gantry tasks={TASKS} />);
    const el = element();
    expect(set).not.toHaveBeenCalled();
    expect(el.syncGroup).toBeNull();

    const group = createGanttSyncGroup();
    el.syncGroup = group; // e.g. through the ref
    await render(<Gantry tasks={[]} />);
    expect(el.syncGroup).toBe(group);
    expect(set).toHaveBeenCalledOnce(); // only the write above
  });

  it('hands one group to several charts as the same object', async () => {
    const group = createGanttSyncGroup();
    await render(
      <>
        <Gantry tasks={TASKS} syncGroup={group} />
        <Gantry tasks={[]} syncGroup={group} />
      </>,
    );
    const charts = elements();
    expect(charts).toHaveLength(2);
    for (const el of charts) expect(el.syncGroup).toBe(group);
  });

  it('is not serialised by the server render', () => {
    const html = renderToString(<Gantry className="chart" tasks={TASKS} syncGroup={createGanttSyncGroup()} />);
    expect(html).toBe('<gantry-element class="chart"></gantry-element>');
  });
});
