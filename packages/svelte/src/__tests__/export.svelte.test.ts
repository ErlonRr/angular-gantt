// Phase 12 export through the Svelte binding: `before-export` / `export` reach the destructured
// `onBeforeExport` / `onExport` callbacks with their detail (never as attributes); `onBeforeExport`
// runs synchronously, so a callback calling `detail.preventDefault()` cancels `download('csv')` (no
// object URL, no anchor click); a download that goes ahead is reported in `onExport`; and the
// element from `bind:element` resolves the CSV text from `exportCsv()`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import {
  Gantry,
  type GantryElement,
  type GanttBeforeExportEvent,
  type GanttExportEvent,
  type GanttTask,
} from '../index';
import Bound from './Bound.svelte';

type Props = ComponentProps<typeof Gantry>;

const task = (id: string, name: string, day: number): GanttTask => ({
  id,
  name,
  start: new Date(2026, 0, day),
  end: new Date(2026, 0, day + 10),
  progress: 50,
});
const plan = (): GanttTask[] => [task('a', 'Design', 5), task('b', 'Build', 20)];

const teardown: (() => void)[] = [];

/** Mounts `<Gantry>` with `props`, flushes its effects and waits for the element's first frame. */
async function render(props: Props): Promise<GantryElement> {
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(Gantry, { target, props });
  flushSync();
  teardown.push(() => {
    void unmount(component);
    target.remove();
  });
  const el = target.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  return el;
}

/**
 * Stubs what a download touches: `URL.createObjectURL` (records the blob), `URL.revokeObjectURL`,
 * and the anchor's `click()` (no navigation in happy-dom; records the anchor).
 */
function stubDownloads() {
  const blobs: Blob[] = [];
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return 'blob:gantry-test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return { blobs, createObjectURL, click };
}

afterEach(() => {
  for (const destroy of teardown.splice(0)) destroy();
  vi.restoreAllMocks();
});

describe('<Gantry> export events (Svelte)', () => {
  it('calls onBeforeExport and onExport with the event detail, never as attributes', async () => {
    const onBeforeExport = vi.fn();
    const onExport = vi.fn();
    const el = await render({ onBeforeExport, onExport });
    const before = { format: 'svg', trigger: 'api', fileName: 'gantt.svg' };
    const done = { format: 'svg', trigger: 'api', fileName: 'gantt.svg', size: 10, pages: null };
    el.dispatchEvent(new CustomEvent('before-export', { detail: before, bubbles: true, composed: true }));
    el.dispatchEvent(new CustomEvent('export', { detail: done, bubbles: true, composed: true }));
    expect(onBeforeExport).toHaveBeenCalledExactlyOnceWith(before);
    expect(onExport).toHaveBeenCalledExactlyOnceWith(done);
    expect(el.getAttributeNames().filter(a => a.toLowerCase().startsWith('on'))).toEqual([]);
  });

  it("vetoes download('csv') when onBeforeExport calls detail.preventDefault(): no file", async () => {
    const { createObjectURL, click } = stubDownloads();
    const onBeforeExport = vi.fn((detail: GanttBeforeExportEvent) => detail.preventDefault());
    const onExport = vi.fn();
    const el = await render({ tasks: plan(), onBeforeExport, onExport });

    await expect(el.download('csv')).resolves.toBe(false);
    expect(onBeforeExport).toHaveBeenCalledOnce();
    const detail = onBeforeExport.mock.calls[0]![0];
    expect(detail).toMatchObject({ format: 'csv', trigger: 'api', fileName: 'gantt.csv' });
    expect(detail.defaultPrevented).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("reports a download('csv') that goes ahead in onExport: format, file name, size", async () => {
    const { blobs, click } = stubDownloads();
    const onBeforeExport = vi.fn();
    const onExport = vi.fn<(detail: GanttExportEvent) => void>();
    const el = await render({ tasks: plan(), onBeforeExport, onExport });

    await expect(el.download('csv')).resolves.toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).getAttribute('download')).toBe('gantt.csv');
    expect(blobs).toHaveLength(1);
    expect(onExport).toHaveBeenCalledExactlyOnceWith({
      format: 'csv',
      trigger: 'api',
      fileName: 'gantt.csv',
      size: blobs[0]!.size,
      pages: null,
    });
    expect(blobs[0]!.size).toBeGreaterThan(0);
    expect(onBeforeExport.mock.invocationCallOrder[0]).toBeLessThan(onExport.mock.invocationCallOrder[0]!);
  });

  it('resolves the CSV text from the bound element’s exportCsv()', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const harness = mount(Bound, { target, props: { tasks: plan() } });
    teardown.push(() => {
      void unmount(harness);
      target.remove();
    });
    flushSync();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const text = await harness.bound()?.exportCsv();
    expect(typeof text).toBe('string');
    expect(text!.charCodeAt(0)).not.toBe(0xfeff); // the BOM goes into files only
    const lines = text!.split('\r\n').filter(line => line !== '');
    expect(lines).toHaveLength(3); // the header, then one line per task
    expect(lines[1]).toContain('Design');
    expect(lines[2]).toContain('Build');
  });
});
