// Phase 10 review fix (step 7.1, parity + a11y): the lazy data source's footer has the same DOM and
// look as the Web Component's (packages/vanilla/src/layers/tasklist.ts, styles/tasklist.css.ts):
// a bordered, padded box with the panel background; "Load more" a full-width button the toolbar's
// control size tall (`--gantry-control-size`, WCAG 2.5.8) that stays while the page loads (it reads
// "Loading…", is `aria-disabled` and does nothing, so focus stays on it); a failed page the message
// and Retry in `div.gantt-load-error`; everything loaded the `div.gantt-load-done` text.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, ɵgetComponentDef as getComponentDef } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DEFAULT_LABELS } from '@gantryjs/core';
import { GanttLoadMoreComponent } from './gantt-load-more.component';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  imports: [GanttLoadMoreComponent],
  // The chart provides it; on its own the footer reads the default labels
  providers: [GanttI18nService],
  template: `<gantt-load-more
    [isLoading]="loading()"
    [hasMore]="more()"
    [error]="error()"
    [loadedCount]="40"
    [autoLoad]="false"
    (loadMore)="loads = loads + 1"
    (retry)="retries = retries + 1"
  />`,
})
class Host {
  readonly loading = signal(false);
  readonly more = signal(true);
  readonly error = signal(false);
  loads = 0;
  retries = 0;
}

async function mount(): Promise<{ f: ComponentFixture<Host>; footer: HTMLElement; h: Host }> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  const footer = (f.nativeElement as HTMLElement).querySelector<HTMLElement>('gantt-load-more')!;
  return { f, footer, h: f.componentInstance };
}

/** The footer's children as `tag.class` (text trimmed) */
const shape = (footer: HTMLElement) =>
  [...footer.children].map(c => `${c.tagName.toLowerCase()}.${c.className}: ${c.textContent.trim()}`);

/** The compiled declarations of the rule whose selector (encapsulation dropped) is `selector`. */
function decls(selector: string): string {
  const css = (getComponentDef(GanttLoadMoreComponent)?.styles ?? []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const norm = sel
      .replace(/\[_ngcontent-[^\]]+\]/g, '')
      .replace(/\[_nghost-[^\]]+\]/g, ':host')
      .replace(/\s+/g, ' ')
      .trim();
    if (norm === selector)
      return body
        .replace(/%NS%/g, '')
        .replace(/\s*:\s*/g, ': ')
        .replace(/\s+/g, ' ');
  }
  return '';
}

describe('load-more footer: the Web Component’s DOM and look (phase 10 step 7.1)', () => {
  it('keeps the Load more button while the page loads (Loading…, aria-disabled, no action)', async () => {
    const { f, footer, h } = await mount();
    expect(footer.classList.contains('gantt-tl-load-more')).toBe(true);
    expect(shape(footer)).toEqual([`button.gantt-load-more-btn: ${DEFAULT_LABELS.loadMore}`]);
    const button = footer.querySelector('button')!;
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    button.click();
    expect(h.loads).toBe(1);

    h.loading.set(true);
    await f.whenStable();
    expect(footer.querySelector('button')).toBe(button);
    expect(button.textContent.trim()).toBe(DEFAULT_LABELS.loading);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(footer.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(h.loads).toBe(1);
    // No spinner: the button is the loading state
    expect(footer.querySelector('.gantt-spinner, .gantt-load-status')).toBeNull();
  });

  it('a failed page: the message and Retry in div.gantt-load-error; all loaded: div.gantt-load-done', async () => {
    const { f, footer, h } = await mount();
    h.error.set(true);
    await f.whenStable();
    expect([...footer.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual([
      'div.gantt-load-error',
    ]);
    const row = footer.querySelector('.gantt-load-error')!;
    expect([...row.children].map(c => [c.tagName.toLowerCase(), c.className, c.textContent.trim()])).toEqual([
      ['span', '', DEFAULT_LABELS.loadError],
      ['button', 'gantt-load-more-btn', DEFAULT_LABELS.retry],
    ]);
    const retry = row.querySelector<HTMLButtonElement>('button')!;
    retry.click();
    expect(h.retries).toBe(1);
    // Retrying: the loading button, as the Web Component's (loading wins over the error)
    h.loading.set(true);
    await f.whenStable();
    expect(shape(footer)).toEqual([`button.gantt-load-more-btn: ${DEFAULT_LABELS.loading}`]);

    h.loading.set(false);
    h.error.set(false);
    h.more.set(false);
    await f.whenStable();
    expect(shape(footer)).toEqual([`div.gantt-load-done: ${DEFAULT_LABELS.allLoaded(40)}`]);
  });

  it('draws the shared box and a full-width button the toolbar’s control size tall', () => {
    const host = decls(':host');
    expect(host).toContain('padding: 8px 12px');
    expect(host).toContain('border-top: 1px solid var(--gantt-border)');
    expect(host).toContain('background-color: var(--gantt-panel-bg)');
    expect(host).toContain('font-size: var(--gantt-font-size)');
    const button = decls('.gantt-load-more-btn');
    expect(button).toContain('min-height: var(--gantry-control-size, 32px)');
    expect(button).toContain('padding: 0 12px');
    expect(button).toContain('background-color: transparent');
    expect(button).toContain('font-size: var(--gantt-font-size)');
    expect(decls(':host > .gantt-load-more-btn')).toContain('width: 100%');
    expect(decls('.gantt-load-error')).toContain('justify-content: center');
    expect(decls('.gantt-load-done')).toContain('font-size: 11px');
  });
});
