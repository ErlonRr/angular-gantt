// Phase 12 export through the Vue binding: `before-export` / `export` are declared as the
// `beforeExport` / `export` emits (`@before-export`, `@export`) and handed their detail; the
// `beforeExport` handler runs synchronously, so calling `detail.preventDefault()` there cancels
// `download('csv')` (no object URL, no anchor click); a download that goes ahead is reported by
// `export`; and the template ref's `element.exportCsv()` resolves the CSV text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, shallowRef, type App, type VNode } from 'vue';
import type { GantryElement } from '@gantryjs/vanilla';
import { Gantry, type GanttBeforeExportEvent, type GanttExportEvent, type GanttTask } from '../index';

const task = (id: string, name: string, day: number): GanttTask => ({
  id,
  name,
  start: new Date(2026, 2, day),
  end: new Date(2026, 2, day + 10),
  progress: 40,
});
const plan = (): GanttTask[] => [task('a', 'Design', 2), task('b', 'Build', 14)];

const apps: App[] = [];

/** Mounts `render` into a connected host and waits for the element's first frame. */
async function mount(render: () => VNode): Promise<GantryElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  apps.push(app);
  app.mount(host);
  const el = host.querySelector('gantry-element');
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
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('<Gantry> export events (Vue)', () => {
  it('declares the Phase 12 emits (template names: @before-export, @export)', () => {
    expect(Object.keys(Gantry['emits'] as object)).toEqual(expect.arrayContaining(['beforeExport', 'export']));
  });

  it('emits beforeExport and export with the event detail, never as attributes', async () => {
    const onBeforeExport = vi.fn();
    const onExport = vi.fn();
    const el = await mount(() => h(Gantry, { onBeforeExport, onExport }));
    const before = { format: 'svg', trigger: 'api', fileName: 'gantt.svg' };
    const done = { format: 'svg', trigger: 'api', fileName: 'gantt.svg', size: 10, pages: null };
    el.dispatchEvent(new CustomEvent('before-export', { detail: before, bubbles: true, composed: true }));
    el.dispatchEvent(new CustomEvent('export', { detail: done, bubbles: true, composed: true }));
    expect(onBeforeExport).toHaveBeenCalledExactlyOnceWith(before);
    expect(onExport).toHaveBeenCalledExactlyOnceWith(done);
    expect(el.getAttributeNames().filter(a => a.toLowerCase().startsWith('on'))).toEqual([]);
  });

  it("vetoes download('csv') when the beforeExport handler calls detail.preventDefault(): no file", async () => {
    const { createObjectURL, click } = stubDownloads();
    const onBeforeExport = vi.fn((detail: GanttBeforeExportEvent) => detail.preventDefault());
    const onExport = vi.fn();
    const el = await mount(() => h(Gantry, { tasks: plan(), onBeforeExport, onExport }));

    await expect(el.download('csv')).resolves.toBe(false);
    expect(onBeforeExport).toHaveBeenCalledOnce();
    const detail = onBeforeExport.mock.calls[0]![0];
    expect(detail).toMatchObject({ format: 'csv', trigger: 'api', fileName: 'gantt.csv' });
    expect(detail.defaultPrevented).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("reports a download('csv') that goes ahead in the export emit: format, file name, size", async () => {
    const { blobs, click } = stubDownloads();
    const onBeforeExport = vi.fn();
    const onExport = vi.fn<(detail: GanttExportEvent) => void>();
    const el = await mount(() => h(Gantry, { tasks: plan(), onBeforeExport, onExport }));

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

  it("resolves the CSV text from the template ref's element.exportCsv(), with no event", async () => {
    const chart = shallowRef<InstanceType<typeof Gantry> | null>(null);
    const onBeforeExport = vi.fn();
    const onExport = vi.fn();
    await mount(() => h(Gantry, { ref: chart, tasks: plan(), onBeforeExport, onExport }));

    const text = await chart.value?.element?.exportCsv();
    expect(typeof text).toBe('string');
    expect(text!.charCodeAt(0)).not.toBe(0xfeff); // the BOM goes into files only
    const lines = text!.split('\r\n').filter(line => line !== '');
    expect(lines).toHaveLength(3); // the header, then one line per task
    expect(lines[1]).toContain('Design');
    expect(lines[2]).toContain('Build');
    expect(onBeforeExport).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });
});
