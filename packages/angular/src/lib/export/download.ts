// ─────────────────────────────────────────────────────────────
//  gantry · export/download.ts
//
//  Saves a file (Gantry 2 phase 12, D15, plan §3d), as the Web
//  Component's `export/download.ts`: an `a[href=blob:][download]
//  [rel=noopener]` appended to `mount` (the chart's host), clicked and
//  removed in the same task; its object URL revoked after core
//  `DOWNLOAD_REVOKE_MS` (at once when the click throws). Constructors
//  and timers come from `doc.defaultView` (no browser globals).
// ─────────────────────────────────────────────────────────────

import { DOWNLOAD_REVOKE_MS } from '@gantryjs/core';

/**
 * Downloads `blob` as `fileName` (already sanitized, with its extension). Throws an `Error` when
 * `doc` has no window (the server, or a document built with `createHTMLDocument()`).
 */
export function downloadBlob(blob: Blob, fileName: string, doc: Document, mount: ParentNode): void {
  const win = doc.defaultView;
  if (!win) throw new Error('Gantry: download() needs a browser window');
  const url = win.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.setAttribute('rel', 'noopener');
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
