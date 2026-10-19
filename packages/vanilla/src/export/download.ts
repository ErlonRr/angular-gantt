/**
 * @file download.ts
 * Saves a file (Phase 12, D15, plan §3d): an `a[href=blob:][download][rel=noopener]` appended to
 * `mount` (the element's shadow root), clicked and removed in the same task; its object URL is
 * revoked after core `DOWNLOAD_REVOKE_MS` (at once when the click throws). Constructors and timers
 * come from `doc.defaultView`, so the helper works for an element adopted into another document.
 * Part of the lazy `export/` chunk.
 */
import { DOWNLOAD_REVOKE_MS } from '@gantryjs/core';
import { setAttr } from '../dom/patch';

/**
 * Downloads `blob` as `fileName` (already sanitized, with its extension). Throws an `Error` when
 * `doc` has no window (a document built with `createHTMLDocument()`).
 */
export function downloadBlob(blob: Blob, fileName: string, doc: Document, mount: ParentNode): void {
  const win = doc.defaultView;
  if (!win) throw new Error('Gantry: download() needs a browser window');
  const url = win.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  setAttr(link, 'href', url);
  setAttr(link, 'download', fileName);
  setAttr(link, 'rel', 'noopener');
  try {
    mount.appendChild(link);
    link.click();
  } catch (error) {
    win.URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
  // The browser reads the blob after the click returned: keep the URL alive a while
  win.setTimeout(() => win.URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS);
}
