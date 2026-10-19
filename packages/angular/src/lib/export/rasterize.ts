// ─────────────────────────────────────────────────────────────
//  gantry · export/rasterize.ts
//
//  SVG → PNG (Gantry 2 phase 12, D10, plan §3c), as the Web Component's
//  `export/rasterize.ts`: the SVG as a Blob URL, an `img` decoded and
//  drawn on a canvas of `size` over `background` (`null`: transparent),
//  `toBlob('image/png')` (`null` → an Error); the URL always revoked.
//  Constructors come from `doc.defaultView` (no browser globals). Needs
//  `img-src blob:` under a CSP.
//
//  Sizes are core's (`planRaster`): nothing here computes one.
// ─────────────────────────────────────────────────────────────

import { EXPORT_MIME } from '@gantryjs/core';

/** What a canvas keeps as its fill when it is handed a colour it can't parse. */
const NO_FILL = 'rgba(0, 0, 0, 0)';

/**
 * Resolves once `img` (its `src` set) can be drawn: `decode()`, or — for engines that refuse to
 * decode an SVG image they loaded — its load state. Rejects with `message` when it can't load
 * (a broken URL, or a CSP without `img-src blob:`).
 */
export async function imageReady(img: HTMLImageElement, message: string): Promise<void> {
  try {
    await img.decode();
    return;
  } catch (cause) {
    if (img.complete && img.naturalWidth > 0) return;
    throw new Error(message, { cause });
  }
}

/**
 * The PNG of `svg`, which is already sized at `size.width` × `size.height` px (core `planRaster`).
 * `background` (a resolved colour) is painted under the drawing; `null` keeps it transparent.
 * Rejects with an `Error` without a window or a 2D canvas, when the SVG can't load, or when the
 * browser can't encode the PNG.
 */
export async function svgToPng(
  svg: string,
  size: { width: number; height: number },
  doc: Document,
  background: string | null,
): Promise<Blob> {
  const win = doc.defaultView;
  if (!win) throw new Error('Gantry: exportPng() needs a browser window');
  const url = win.URL.createObjectURL(new win.Blob([svg], { type: EXPORT_MIME.svg }));
  try {
    const img = doc.createElement('img');
    img.setAttribute('src', url);
    await imageReady(img, "Gantry: exportPng() couldn't load the SVG (a Content-Security-Policy needs img-src blob:)");

    const canvas = doc.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Gantry: exportPng() needs a 2D canvas');
    if (background) {
      // A colour the canvas can't parse leaves the transparent fill instead of the default black
      ctx.fillStyle = NO_FILL;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(img, 0, 0, size.width, size.height);

    return await new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("Gantry: the browser couldn't encode the PNG"));
        }, EXPORT_MIME.png);
      } catch (cause) {
        // A tainted canvas (SecurityError)
        reject(new Error("Gantry: the browser couldn't encode the PNG", { cause }));
      }
    });
  } finally {
    win.URL.revokeObjectURL(url);
  }
}
