/**
 * @file print.ts
 * Prints a print document (Phase 12, D11, plan §3d): a hidden `iframe.gantry-print-frame`
 * (`aria-hidden`, `tabindex=-1`, `title`; CSSOM `position: fixed`, 0 × 0, no border,
 * `visibility: hidden`) appended to the owner document's body, its `about:blank` document built
 * with DOM APIs only — no `src`, `srcdoc`, `document.write` or HTML parsing, so it is Trusted Types
 * safe:
 *
 *   html[lang] > head > title                                   the print title (a PDF's name)
 *              > body > div.gantry-print-page × N > img.gantry-print-image[src=blob:][alt][width][height]
 *                                                  + p.gantry-print-footer (only with a footer)
 *
 * The page CSS (`@page` size and margins) is one constructable stylesheet adopted by the frame's
 * document (a style element through `textContent` without constructable sheets: that fallback
 * needs `style-src 'unsafe-inline'`). Waits for every image, calls `contentWindow.print()`
 * (focus never moves into the frame), then cleans up — revokes every object URL and removes the
 * frame — on the frame's first `afterprint` or after core `PRINT_CLEANUP_MS`, whichever comes
 * first; at once when anything fails. The about:blank frame inherits the page's CSP: the page
 * images need `img-src blob:`. Part of the lazy `export/` chunk.
 */
import { EXPORT_MIME, PRINT_CLEANUP_MS, type PrintDocument } from '@gantryjs/core';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import { constructSheet } from '../dom/sheet';
import { imageReady } from './rasterize';

/** The frame's CSSOM: out of the layout and out of sight, but still printable (not `display: none`). */
const FRAME_STYLE: readonly (readonly [string, string])[] = [
  ['position', 'fixed'],
  ['inset-inline-start', '0'],
  ['inset-block-start', '0'],
  ['width', '0'],
  ['height', '0'],
  ['border', '0'],
  ['visibility', 'hidden'],
];

/** `css` on `frameDoc`: an adopted constructable sheet, else a style element in `head`. */
function applyCss(frameDoc: Document, head: HTMLHeadElement, css: string): void {
  const sheet = constructSheet(frameDoc, css);
  if (sheet && 'adoptedStyleSheets' in frameDoc) {
    try {
      frameDoc.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // NotAllowedError: constructed for another document
    }
  }
  const style = frameDoc.createElement('style'); // <style> fallback: not strict-`style-src` compatible
  setText(style, css);
  head.appendChild(style);
}

/**
 * Builds `document` into `frameDoc` (its `head` and `body` replaced); `url(svg)` gives each page's
 * image URL. Returns the page images.
 */
function buildPrintDocument(
  frameDoc: Document,
  document: PrintDocument,
  url: (svg: string) => string,
): HTMLImageElement[] {
  const html = frameDoc.documentElement;
  setAttr(html, 'lang', document.lang || null);
  const head = frameDoc.head ?? html.insertBefore(frameDoc.createElement('head'), html.firstChild);
  const body = frameDoc.body ?? html.appendChild(frameDoc.createElement('body'));

  const title = frameDoc.createElement('title');
  setText(title, document.title);
  head.replaceChildren(title);
  applyCss(frameDoc, head, document.css);

  const images: HTMLImageElement[] = [];
  const pages = document.pages.map(page => {
    const sheet = frameDoc.createElement('div');
    setAttr(sheet, 'class', 'gantry-print-page');
    const img = frameDoc.createElement('img');
    setAttr(img, 'class', 'gantry-print-image');
    setAttr(img, 'alt', page.alt);
    setAttr(img, 'width', page.width);
    setAttr(img, 'height', page.height);
    setAttr(img, 'src', url(page.svg));
    images.push(img);
    sheet.appendChild(img);
    if (page.footer !== null) {
      const footer = frameDoc.createElement('p');
      setAttr(footer, 'class', 'gantry-print-footer');
      setText(footer, page.footer);
      sheet.appendChild(footer);
    }
    return sheet;
  });
  body.replaceChildren(...pages);
  return images;
}

/**
 * Prints `document` from `doc` (the element's owner document). Resolves once
 * `contentWindow.print()` returned (the dialog closed in Chromium; opened in Firefox, whose
 * printing goes on asynchronously: the frame stays until `afterprint` or the timeout). Rejects with
 * an `Error` without a window or a body, when a page image can't load (a CSP without
 * `img-src blob:`), or when printing throws; nothing is left behind then.
 */
export async function printPages(document: PrintDocument, doc: Document): Promise<void> {
  const win = doc.defaultView;
  const parent = doc.body;
  if (!win || !parent) throw new Error('Gantry: print() needs a browser window');

  const urls: string[] = [];
  let timer: number | undefined;
  let cleaned = false;
  const frame = doc.createElement('iframe');
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (timer !== undefined) win.clearTimeout(timer);
    for (const url of urls) win.URL.revokeObjectURL(url);
    frame.remove();
  };

  setAttr(frame, 'class', 'gantry-print-frame');
  setAttr(frame, 'aria-hidden', 'true');
  setAttr(frame, 'tabindex', -1);
  setAttr(frame, 'title', document.title);
  for (const [prop, value] of FRAME_STYLE) setStyleProp(frame, prop, value);

  try {
    parent.appendChild(frame);
    const frameDoc = frame.contentDocument;
    if (!frameDoc || !frame.contentWindow) throw new Error("Gantry: print() couldn't open its print frame");
    const images = buildPrintDocument(frameDoc, document, svg => {
      const url = win.URL.createObjectURL(new win.Blob([svg], { type: EXPORT_MIME.svg }));
      urls.push(url);
      return url;
    });
    await Promise.all(
      images.map(img =>
        imageReady(img, "Gantry: print() couldn't load its pages (a Content-Security-Policy needs img-src blob:)"),
      ),
    );

    // Read again: the frame may have been removed (or navigated) while the images loaded
    const frameWin = frame.isConnected ? frame.contentWindow : null;
    if (!frameWin || cleaned) throw new Error('Gantry: print() lost its print frame');
    frameWin.addEventListener('afterprint', cleanup, { once: true });
    frameWin.print();
    // `afterprint` may already have run (Chromium's print() blocks until the dialog closes)
    if (!cleaned) timer = win.setTimeout(cleanup, PRINT_CLEANUP_MS);
  } catch (error) {
    cleanup();
    throw error;
  }
}
