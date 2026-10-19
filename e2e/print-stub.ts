// The print stub (Gantry 2 phase 12): `print()` prints through a hidden `about:blank` iframe
// (`iframe.gantry-print-frame`, appended to the document's body) and calls its
// `contentWindow.print()`, which would open the browser's dialog. The stub, added as an init
// script, wraps that `print` as soon as a frame is inserted (a MutationObserver on the document):
// the wrapper records what the dialog would print into `window.__prints` (the frame's own
// attributes and box, the document's title and lang, its page CSS, each page image and footer;
// optionally each page's SVG, read from its blob URL) and then fires `afterprint` on the frame's
// window, as the browser does when the dialog closes. The top window's `print` only counts calls
// (`window.__topPrints`): Gantry never prints the page itself.
import type { BrowserContext, Page } from '@playwright/test';

/** One page image of the print document. */
export interface PrintImage {
  alt: string;
  width: number;
  height: number;
  /** Loaded and decoded when `print()` ran */
  complete: boolean;
  naturalWidth: number;
}

/** What the stub recorded for one print. */
export interface PrintRecord {
  /** The frame element: `title`, `aria-hidden`, `tabindex`, class and the box it occupies */
  frame: {
    title: string | null;
    ariaHidden: string | null;
    tabIndex: string | null;
    className: string;
    width: number;
    height: number;
    position: string;
    visibility: string;
    /** The frame's parent is `document.body` */
    inBody: boolean;
  };
  /** `document.title` of the print document */
  title: string;
  /** `html[lang]` of the print document */
  lang: string;
  /** Its page CSS: the adopted sheets' rules, then any `<style>` text */
  pageCss: string;
  images: PrintImage[];
  /** Text of each `p.gantry-print-footer`, in order */
  footers: string[];
  /** Each page's SVG text (only with `readSvgs`; read before `afterprint`, while the URLs live) */
  svgs: string[] | null;
}

export interface PrintStubOptions {
  /**
   * Fetch each page image's blob URL before `afterprint` (default true). Off under a strict
   * Content-Security-Policy: `fetch` of a `blob:` URL needs `connect-src blob:`.
   */
  readSvgs?: boolean;
}

/** The init script (runs in the page, before its own scripts). */
function stub(readSvgs: boolean): void {
  const w = window as unknown as Window & { __prints: unknown[]; __topPrints: number };
  w.__prints = [];
  w.__topPrints = 0;
  w.print = () => {
    w.__topPrints++;
  };
  const wrapped = new WeakSet<Window>();
  const wrap = (frame: HTMLIFrameElement) => {
    const win = frame.contentWindow;
    if (!win || wrapped.has(win)) return;
    wrapped.add(win);
    win.print = () => {
      const doc = frame.contentDocument!;
      const box = frame.getBoundingClientRect();
      const cs = getComputedStyle(frame);
      const sheets = [...doc.adoptedStyleSheets].flatMap(s => [...s.cssRules].map(r => r.cssText));
      const styles = [...doc.querySelectorAll('style')].map(s => s.textContent ?? '');
      const images = [...doc.querySelectorAll<HTMLImageElement>('img.gantry-print-image')];
      const record = {
        frame: {
          title: frame.getAttribute('title'),
          ariaHidden: frame.getAttribute('aria-hidden'),
          tabIndex: frame.getAttribute('tabindex'),
          className: frame.className,
          width: box.width,
          height: box.height,
          position: cs.position,
          visibility: cs.visibility,
          inBody: frame.parentElement === document.body,
        },
        title: doc.title,
        lang: doc.documentElement.lang,
        pageCss: [...sheets, ...styles].join('\n'),
        images: images.map(img => ({
          alt: img.alt,
          width: Number(img.getAttribute('width')),
          height: Number(img.getAttribute('height')),
          complete: img.complete,
          naturalWidth: img.naturalWidth,
        })),
        footers: [...doc.querySelectorAll('.gantry-print-footer')].map(p => p.textContent ?? ''),
        svgs: null as string[] | null,
      };
      w.__prints.push(record);
      // The dialog "closes" once the pages are read (their URLs are revoked by the cleanup)
      const done = () => win.dispatchEvent(new Event('afterprint'));
      if (!readSvgs) {
        setTimeout(done, 0);
        return;
      }
      void Promise.all(images.map(img => fetch(img.src).then(r => r.text()))).then(svgs => {
        record.svgs = svgs;
        done();
      });
    };
  };
  new MutationObserver(records => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node instanceof HTMLIFrameElement && node.classList.contains('gantry-print-frame')) wrap(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

/** Install the stub in `target` (a page or a whole context) before its next navigation. */
export async function installPrintStub(target: Page | BrowserContext, options: PrintStubOptions = {}): Promise<void> {
  await target.addInitScript(stub, options.readSvgs ?? true);
}

/** The prints recorded so far, oldest first. */
export function prints(page: Page): Promise<PrintRecord[]> {
  return page.evaluate(() => (window as unknown as { __prints?: PrintRecord[] }).__prints ?? []);
}

/** Print frames in the document now (one while a print runs, none after its cleanup). */
export function printFrames(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('iframe.gantry-print-frame').length);
}

/** Calls of the top window's `print()` (Gantry never prints the page itself). */
export function topPrints(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __topPrints?: number }).__topPrints ?? 0);
}
