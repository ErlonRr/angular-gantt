// Phase 12 export through the React wrapper: `before-export` / `export` reach `onBeforeExport` /
// `onExport` with their detail (never as attributes); `onBeforeExport` runs synchronously, so a
// callback calling `detail.preventDefault()` cancels `download('csv')` (no object URL, no anchor
// click); a download that goes ahead reports the file in `onExport`; and the ref's async
// `exportCsv()` resolves the CSV text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRef, type ReactNode, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  Gantry,
  type GantryElement,
  type GanttBeforeExportEvent,
  type GanttExportEvent,
  type GanttTask,
} from '../index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
  { id: 'b', name: 'Build', start: new Date(2026, 0, 21), end: new Date(2026, 1, 10), progress: 0 },
];

let host: HTMLDivElement | undefined;
let root: Root | undefined;

async function render(node: ReactNode): Promise<GantryElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  const el = host.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  // The element paints on the next frame
  await act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
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

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
});

describe('<Gantry> export events (React)', () => {
  it('calls onBeforeExport and onExport with the event detail, never as attributes', async () => {
    const onBeforeExport = vi.fn();
    const onExport = vi.fn();
    const el = await render(<Gantry onBeforeExport={onBeforeExport} onExport={onExport} />);
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
    const ref = createRef<GantryElement>();
    await render(<Gantry ref={ref} tasks={TASKS} onBeforeExport={onBeforeExport} onExport={onExport} />);

    let done: boolean | undefined;
    await act(async () => {
      done = await ref.current!.download('csv');
    });
    expect(done).toBe(false);
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
    const ref = createRef<GantryElement>();
    await render(<Gantry ref={ref} tasks={TASKS} onBeforeExport={onBeforeExport} onExport={onExport} />);

    let done: boolean | undefined;
    await act(async () => {
      done = await ref.current!.download('csv');
    });
    expect(done).toBe(true);
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
    // before-export first
    expect(onBeforeExport.mock.invocationCallOrder[0]).toBeLessThan(onExport.mock.invocationCallOrder[0]!);
  });

  it("resolves the CSV text from the ref's exportCsv(), with no event", async () => {
    const onBeforeExport = vi.fn();
    const onExport = vi.fn();
    const ref: RefObject<GantryElement | null> = createRef<GantryElement>();
    await render(<Gantry ref={ref} tasks={TASKS} onBeforeExport={onBeforeExport} onExport={onExport} />);

    let text: string | undefined;
    await act(async () => {
      text = await ref.current!.exportCsv();
    });
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
