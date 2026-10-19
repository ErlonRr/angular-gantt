// Gantry 2 phase 12, step 3.2: the Web Component's export DOM helpers (the lazy `export/` chunk) in
// happy-dom, with `URL.createObjectURL` / `revokeObjectURL`, `HTMLImageElement.decode` and the canvas
// (`getContext` / `toBlob`) stubbed:
//   downloadBlob  the link inside the mount, clicked once, removed at once, its URL revoked after
//                 DOWNLOAD_REVOKE_MS (at once when the click throws)
//   svgToPng      blob → decoded image → canvas of the planned size over the background → PNG; the URL
//                 always revoked; every failure rejects with an Error
//   printPages    the hidden frame and its document (title, lang, adopted sheet or style fallback, pages
//                 with alt / size / footer), print() after the images, cleanup on afterprint or timeout
//   serializeSvg  the sanitising matrix on a clone (the live node untouched)
// Real printing, downloads and CSP live in the e2e suite (export.spec.ts, csp.spec.ts).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DOWNLOAD_REVOKE_MS, EXPORT_MIME, PRINT_CLEANUP_MS, type PrintDocument } from '@gantryjs/core';
import { downloadBlob } from '../export/download';
import { svgToPng } from '../export/rasterize';
import { printPages } from '../export/print';
import { serializeSvg } from '../export/serialize';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** The blobs given to `URL.createObjectURL`, and the URLs revoked (`blob:test/<n>`, from 1). */
function stubUrls() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(obj => {
    created.push(obj as Blob);
    return `blob:test/${created.length}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => {
    revoked.push(url);
  });
  return { created, revoked };
}

/** Images decode (or fail to) as told; `loaded` is what `complete` / `naturalWidth` report. */
function stubImages(decode: () => Promise<void> = () => Promise.resolve(), loaded = false) {
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(decode);
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(loaded);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(loaded ? 300 : 0);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

// ─── downloadBlob ───────────────────────────────────────────

describe('downloadBlob', () => {
  const shadowHost = () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
  };

  it('clicks a blob link inside the mount, removes it at once and revokes its URL after DOWNLOAD_REVOKE_MS', () => {
    vi.useFakeTimers();
    const { created, revoked } = stubUrls();
    const shadow = shadowHost();
    const clicks: Record<string, unknown>[] = [];
    shadow.addEventListener('click', event => {
      const a = event.target as HTMLAnchorElement;
      clicks.push({
        mounted: a.parentNode === shadow,
        href: a.getAttribute('href'),
        download: a.getAttribute('download'),
        rel: a.getAttribute('rel'),
      });
      event.preventDefault(); // no navigation in happy-dom
    });
    const blob = new Blob(['a,b'], { type: EXPORT_MIME.csv });

    downloadBlob(blob, 'plan.csv', document, shadow);

    expect(clicks).toEqual([{ mounted: true, href: 'blob:test/1', download: 'plan.csv', rel: 'noopener' }]);
    expect(created).toEqual([blob]);
    expect(shadow.querySelector('a')).toBeNull();
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_MS - 1);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('revokes the URL at once and leaves no link when the click throws', () => {
    vi.useFakeTimers();
    const { revoked } = stubUrls();
    const shadow = shadowHost();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => downloadBlob(new Blob(['x']), 'plan.svg', document, shadow)).toThrow('blocked');
    expect(shadow.querySelector('a')).toBeNull();
    expect(revoked).toEqual(['blob:test/1']);
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_MS);
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('throws an Error without a window', () => {
    const { created } = stubUrls();
    const headless = document.implementation.createHTMLDocument('headless');
    expect(() => downloadBlob(new Blob(['x']), 'plan.svg', headless, headless.body)).toThrow(/browser/);
    expect(created).toEqual([]);
  });
});

// ─── svgToPng ───────────────────────────────────────────────

/** A recording 2D context; `fillStyle` ignores a colour it "can't parse", as a canvas does. */
function stubCanvas(opts: { context?: boolean; blob?: Blob | null; taint?: boolean } = {}) {
  let fill = '#000000';
  const fills: string[] = [];
  const draws: unknown[][] = [];
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value: string) {
      if (value !== 'not-a-colour') fill = value;
    },
    fillRect: (x: number, y: number, w: number, h: number) => fills.push(`${fill} ${x} ${y} ${w} ${h}`),
    drawImage: (...args: unknown[]) => draws.push(args),
  };
  const canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this);
    return opts.context === false ? null : ctx;
  } as never);
  const types: (string | undefined)[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback, type?: string) => {
    if (opts.taint) throw new DOMException('The canvas has been tainted', 'SecurityError');
    types.push(type);
    callback(opts.blob === undefined ? new Blob(['png'], { type: 'image/png' }) : opts.blob);
  });
  return { fills, draws, canvases, types };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120"/></svg>';

describe('svgToPng', () => {
  it('draws the decoded SVG on a canvas of the planned size over the background and returns the PNG', async () => {
    const { created, revoked } = stubUrls();
    stubImages();
    const canvas = stubCanvas();

    const png = await svgToPng(SVG, { width: 600, height: 240 }, document, '#fafafa');

    expect(png.type).toBe('image/png');
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe(EXPORT_MIME.svg);
    expect(await created[0].text()).toBe(SVG);
    expect(canvas.canvases).toHaveLength(1);
    expect([canvas.canvases[0].width, canvas.canvases[0].height]).toEqual([600, 240]);
    expect(canvas.fills).toEqual(['#fafafa 0 0 600 240']);
    expect(canvas.draws).toHaveLength(1);
    const [img, ...box] = canvas.draws[0];
    expect((img as HTMLImageElement).getAttribute('src')).toBe('blob:test/1');
    expect(box).toEqual([0, 0, 600, 240]);
    expect(canvas.types).toEqual(['image/png']);
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('keeps the canvas transparent without a background', async () => {
    stubUrls();
    stubImages();
    const canvas = stubCanvas();
    await svgToPng(SVG, { width: 300, height: 120 }, document, null);
    expect(canvas.fills).toEqual([]);
    expect(canvas.draws).toHaveLength(1);
  });

  it('fills nothing (not black) with a colour the canvas cannot parse', async () => {
    stubUrls();
    stubImages();
    const canvas = stubCanvas();
    await svgToPng(SVG, { width: 300, height: 120 }, document, 'not-a-colour');
    expect(canvas.fills).toEqual(['rgba(0, 0, 0, 0) 0 0 300 120']);
  });

  it('falls back to the load state when decode() refuses an SVG image it loaded', async () => {
    stubUrls();
    stubImages(() => Promise.reject(new DOMException('no decode', 'EncodingError')), true);
    stubCanvas();
    await expect(svgToPng(SVG, { width: 300, height: 120 }, document, null)).resolves.toBeInstanceOf(Blob);
  });

  it.each([
    [
      'the SVG cannot load (CSP without img-src blob:)',
      () => stubImages(() => Promise.reject(new DOMException('blocked', 'EncodingError'))),
      /img-src blob:/,
    ],
    ['there is no 2D canvas', () => (stubImages(), stubCanvas({ context: false })), /2D canvas/],
    ['toBlob gives null', () => (stubImages(), stubCanvas({ blob: null })), /encode the PNG/],
    ['the canvas is tainted', () => (stubImages(), stubCanvas({ taint: true })), /encode the PNG/],
  ])('rejects with an Error and revokes the URL when %s', async (_, arrange, message) => {
    const { revoked } = stubUrls();
    arrange();
    const result = svgToPng(SVG, { width: 300, height: 120 }, document, '#fff');
    await expect(result).rejects.toThrow(message);
    await expect(result).rejects.toBeInstanceOf(Error);
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('rejects without a window', async () => {
    const { created } = stubUrls();
    const headless = document.implementation.createHTMLDocument('headless');
    await expect(svgToPng(SVG, { width: 1, height: 1 }, headless, null)).rejects.toThrow(/browser/);
    expect(created).toEqual([]);
  });
});

// ─── printPages ─────────────────────────────────────────────

const PAGES: PrintDocument = {
  title: 'Release plan',
  lang: 'it-IT',
  css: '@page{size:297mm 210mm;margin:10mm}\n.gantry-print-image{display:block}',
  pages: [
    {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1046.5" height="700"/>',
      width: 1046.5,
      height: 700,
      alt: 'Release plan, Page 1 of 2',
      footer: 'Release plan · Page 1 of 2',
    },
    {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"/>',
      width: 500,
      height: 700,
      alt: 'Release plan, Page 2 of 2',
      footer: null,
    },
  ],
};

/**
 * Starts a print. `printPages` builds the frame synchronously, before its first `await`, so the
 * frame's window can get its `print` stub (happy-dom has none) before the images are ready.
 */
function startPrint(onPrint: (frameWin: Window) => void = () => undefined, doc: PrintDocument = PAGES) {
  const done = printPages(doc, document);
  const frame = document.body.querySelector<HTMLIFrameElement>('iframe.gantry-print-frame')!;
  const frameWin = frame.contentWindow!;
  const print = vi.fn(() => onPrint(frameWin));
  (frameWin as unknown as { print: () => void }).print = print;
  return { done, frame, frameWin, frameDoc: frame.contentDocument!, print };
}

describe('printPages', () => {
  it('builds a hidden frame and its document with DOM APIs only', async () => {
    const { created } = stubUrls();
    stubImages();
    const { done, frame, frameDoc } = startPrint();

    expect(frame.parentNode).toBe(document.body);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.getAttribute('tabindex')).toBe('-1');
    expect(frame.getAttribute('title')).toBe('Release plan');
    expect(frame.hasAttribute('src')).toBe(false);
    expect(frame.hasAttribute('srcdoc')).toBe(false);
    expect(frame.style.getPropertyValue('position')).toBe('fixed');
    expect(frame.style.getPropertyValue('visibility')).toBe('hidden');

    expect(frameDoc.documentElement.getAttribute('lang')).toBe('it-IT');
    expect(frameDoc.title).toBe('Release plan');
    expect([...frameDoc.head.children].map(el => el.localName)).toEqual(['title']);
    expect(frameDoc.adoptedStyleSheets).toHaveLength(1);

    const pages = [...frameDoc.body.children];
    expect(pages.map(el => el.className)).toEqual(['gantry-print-page', 'gantry-print-page']);
    expect([...pages[0].children].map(el => el.className)).toEqual(['gantry-print-image', 'gantry-print-footer']);
    expect([...pages[1].children].map(el => el.className)).toEqual(['gantry-print-image']);
    const imgs = pages.map(page => page.querySelector('img')!);
    expect(imgs.map(img => ['src', 'alt', 'width', 'height'].map(name => img.getAttribute(name)))).toEqual([
      ['blob:test/1', 'Release plan, Page 1 of 2', '1046.5', '700'],
      ['blob:test/2', 'Release plan, Page 2 of 2', '500', '700'],
    ]);
    expect(pages[0].querySelector('p')!.textContent).toBe('Release plan · Page 1 of 2');

    expect(created.map(blob => blob.type)).toEqual([EXPORT_MIME.svg, EXPORT_MIME.svg]);
    expect(await Promise.all(created.map(blob => blob.text()))).toEqual(PAGES.pages.map(page => page.svg));
    await done;
  });

  it('falls back to a style element without constructable stylesheets', async () => {
    stubUrls();
    stubImages();
    vi.stubGlobal('CSSStyleSheet', undefined);
    const { done, frameDoc } = startPrint();
    expect([...frameDoc.head.children].map(el => el.localName)).toEqual(['title', 'style']);
    expect(frameDoc.head.querySelector('style')!.textContent).toBe(PAGES.css);
    expect(frameDoc.adoptedStyleSheets).toHaveLength(0);
    await done;
  });

  it('prints once every image is ready, then resolves', async () => {
    stubUrls();
    let ready!: () => void;
    const gate = new Promise<void>(resolve => (ready = resolve));
    stubImages(() => gate);
    const { done, print } = startPrint();

    await Promise.resolve();
    expect(print).not.toHaveBeenCalled();
    ready();
    await done;
    expect(print).toHaveBeenCalledOnce();
  });

  it('cleans up on the first afterprint: the URLs revoked, the frame removed, no timer left', async () => {
    vi.useFakeTimers();
    const { revoked } = stubUrls();
    stubImages();
    const { done, frame, frameWin } = startPrint();
    await done;

    expect(frame.isConnected).toBe(true);
    expect(revoked).toEqual([]);
    const pending = vi.getTimerCount(); // happy-dom keeps timers of its own
    frameWin.dispatchEvent(new Event('afterprint'));
    expect(frame.isConnected).toBe(false);
    expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
    expect(vi.getTimerCount()).toBe(pending - 1);
    vi.advanceTimersByTime(PRINT_CLEANUP_MS);
    expect(revoked).toHaveLength(2);
  });

  it('cleans up after PRINT_CLEANUP_MS when afterprint never comes (only once)', async () => {
    vi.useFakeTimers();
    const { revoked } = stubUrls();
    stubImages();
    const { done, frame, frameWin } = startPrint();
    await done;

    vi.advanceTimersByTime(PRINT_CLEANUP_MS - 1);
    expect(frame.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(frame.isConnected).toBe(false);
    expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
    frameWin.dispatchEvent(new Event('afterprint'));
    expect(revoked).toHaveLength(2);
  });

  it('an afterprint during print() (a blocking dialog) cleans up before it resolves, with no timer', async () => {
    const { revoked } = stubUrls();
    stubImages();
    const timers = vi.spyOn(window, 'setTimeout');
    const { done, frame } = startPrint(frameWin => frameWin.dispatchEvent(new Event('afterprint')));
    await done;
    expect(frame.isConnected).toBe(false);
    expect(revoked).toHaveLength(2);
    expect(timers.mock.calls.filter(([, ms]) => ms === PRINT_CLEANUP_MS)).toEqual([]);
  });

  it('never moves focus into the frame', async () => {
    stubUrls();
    stubImages();
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const { done } = startPrint();
    await done;
    expect(document.activeElement).toBe(button);
  });

  it('rejects and leaves nothing behind when a page image cannot load', async () => {
    const { revoked } = stubUrls();
    stubImages(() => Promise.reject(new DOMException('blocked', 'EncodingError')));
    const { done, print } = startPrint();
    await expect(done).rejects.toThrow(/img-src blob:/);
    expect(print).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
    expect(revoked).toEqual(['blob:test/1', 'blob:test/2']);
  });

  it('rejects and leaves nothing behind when print() throws', async () => {
    const { revoked } = stubUrls();
    stubImages();
    const { done } = startPrint(() => {
      throw new Error('print blocked');
    });
    await expect(done).rejects.toThrow('print blocked');
    expect(document.querySelector('iframe')).toBeNull();
    expect(revoked).toHaveLength(2);
  });

  it('rejects when the frame is removed while its images load', async () => {
    const { revoked } = stubUrls();
    stubImages();
    const { done, frame, print } = startPrint();
    frame.remove();
    await expect(done).rejects.toThrow(/print frame/);
    expect(print).not.toHaveBeenCalled();
    expect(revoked).toHaveLength(2);
  });

  it('rejects without a window', async () => {
    const { created } = stubUrls();
    const headless = document.implementation.createHTMLDocument('headless');
    await expect(printPages(PAGES, headless)).rejects.toThrow(/browser/);
    expect(created).toEqual([]);
    expect(headless.querySelector('iframe')).toBeNull();
  });
});

// ─── serializeSvg ───────────────────────────────────────────

/** An SVG element with attributes (`xlink:href` in the XLink namespace) and children. */
function el(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): Element {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('xlink:')) node.setAttributeNS(XLINK_NS, name, value);
    else node.setAttribute(name, value);
  }
  for (const child of children) node.append(child);
  return node;
}

describe('serializeSvg', () => {
  const serialize = (node: Element) => serializeSvg(node, window);

  it('returns the outer markup of the node in the SVG namespace, text escaped', () => {
    const out = serialize(
      el('g', { class: 'flag' }, el('path', { d: 'M0 0h10', fill: '#c00' }), el('text', {}, 'A & B < C')),
    );
    expect(out.startsWith(`<g xmlns="${SVG_NS}"`)).toBe(true);
    expect(out).toContain('class="flag"');
    expect(out).toContain('d="M0 0h10"');
    expect(out).toContain('fill="#c00"');
    expect(out).toContain('A &amp; B &lt; C');
  });

  it('drops script, foreignObject and style elements wherever they are, keeping their siblings', () => {
    const html = document.createElement('div');
    html.textContent = 'island';
    const out = serialize(
      el(
        'g',
        {},
        el('script', {}, 'alert(1)'),
        el('g', {}, el('rect', { width: '4' }), el('script', {}, 'alert(2)')),
        el('foreignObject', {}, html),
        el('style', {}, 'rect { fill: red }'),
        el('circle', { r: '2' }),
      ),
    );
    expect(out).not.toMatch(/script|foreignObject|island|<style|alert/i);
    expect(out).toContain('<rect width="4"');
    expect(out).toContain('<circle r="2"');
  });

  it('drops every element outside the SVG namespace (an XHTML script or iframe included)', () => {
    const script = document.createElement('script');
    script.textContent = 'alert(1)';
    const frame = document.createElement('iframe');
    frame.setAttribute('src', 'https://example.com/');
    const out = serialize(el('g', {}, script, el('rect', { width: '4' }), frame, document.createElement('div')));
    expect(out).not.toMatch(/xhtml|script|iframe|example|div|alert/);
    expect(out).toContain('<rect width="4"');
    expect(serialize(document.createElement('div'))).toBe('');
  });

  it.each([['onclick'], ['ONMOUSEOVER'], ['onload'], ['onbegin']])('removes the %s handler', name => {
    const out = serialize(el('g', { [name]: 'alert(1)', fill: 'red' }, el('rect', { [name]: 'alert(2)' })));
    expect(out).not.toMatch(/alert|on\w+=/i);
    expect(out).toContain('fill="red"');
  });

  it.each([
    ['javascript:alert(1)'],
    ['  JaVaScRiPt:alert(1)'],
    ['java\tscript:alert(1)'],
    ['\u0001javascript:alert(1)'],
    ['vbscript:msgbox(1)'],
  ])('removes the link %j (href and xlink:href)', url => {
    const out = serialize(el('g', {}, el('a', { href: url }, el('text', {}, 'x')), el('use', { 'xlink:href': url })));
    expect(out).not.toMatch(/script:|href=/i);
    expect(out).toContain('<a');
    expect(out).toContain('<use');
  });

  it.each([['#bar-1'], ['data:image/png;base64,AAAA']])('keeps the link %j', url => {
    const out = serialize(el('g', {}, el('a', { href: url })));
    expect(out).toContain(`href="${url}"`);
  });

  // A link to elsewhere goes too: an export never loads (or points to) anything outside it
  it.each([['https://example.com/a'], ['data:text/html,x']])('removes the link %j', url => {
    const out = serialize(el('g', {}, el('a', { href: url })));
    expect(out).not.toContain('href=');
  });

  it('drops every animation (SMIL means nothing in a still picture), keeping its siblings', () => {
    const out = serialize(
      el(
        'g',
        {},
        el('set', { attributeName: 'onclick', to: 'alert(1)' }),
        el('a', {}, el('animate', { attributeName: 'href', values: '#a; javascript:alert(1)' })),
        el('animate', { attributeName: 'opacity', values: '0;1', dur: '1s' }),
      ),
    );
    expect(out).not.toMatch(/<set|<animate|attributeName|alert|javascript/i);
    expect(out).toContain('<a');
  });

  it('removes tabindex, autofocus, comments and processing instructions; keeps aria, data and inline style', () => {
    const node = el('g', {
      tabindex: '0',
      autofocus: '',
      role: 'option',
      'aria-label': 'Design',
      'data-task-id': 't1',
      style: 'fill: var(--gantt-bar)',
    });
    node.append(document.createComment('--><script>alert(1)</script><!--'));
    node.append(document.createProcessingInstruction('xml-stylesheet', 'href="x.css"'));
    const out = serialize(node);
    expect(out).not.toMatch(/tabindex|autofocus|<!--|<\?|alert/);
    expect(out).toContain('aria-label="Design"');
    expect(out).toContain('data-task-id="t1"');
    expect(out).toContain('style="fill: var(--gantt-bar)"');
  });

  it('leaves the live node untouched', () => {
    const script = el('script', {}, 'alert(1)');
    const node = el('g', { onclick: 'alert(2)', tabindex: '0' }, script);
    serialize(node);
    expect(node.getAttribute('onclick')).toBe('alert(2)');
    expect(node.getAttribute('tabindex')).toBe('0');
    expect(script.parentNode).toBe(node);
  });

  it.each([['script'], ['foreignObject'], ['style']])('gives an empty string for a %s root', tag => {
    expect(serialize(el(tag, {}, 'x'))).toBe('');
  });
});
