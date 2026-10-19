// A case page (examples.html#/<id>): the live Web Component example (the case's own file when it
// has one, else the generic renderer), the same case in the other frameworks, its code (this app's
// files and the shared data), the framework differences it runs into, and the previous and next
// cases.
import { caseNeighbours, categoryOf, galleryCase, notesForCase, type CaseId } from 'demo-kit/gallery';
import { h, icon } from '../dom';
import { CASE_MODULES } from './cases';
import { codeTabs } from './code-tabs';
import { mountGeneric } from './generic-case';
import { FRAMEWORK_LABEL, INDEX_HASH, caseHash, caseLinks } from './links';
import { noteItem } from './notes';

/** Mounts the case into `host` (its own file once loaded, else the generic renderer); returns the unmount. */
function mountCase(host: HTMLElement, id: CaseId): () => void {
  const load = CASE_MODULES[id];
  if (!load) return mountGeneric(host, id);
  let unmount: (() => void) | null = null;
  let gone = false;
  host.append(h('p', { class: 'gs-case-hint' }, 'Loading the example…'));
  load().then(
    module => {
      if (gone) return;
      host.replaceChildren();
      unmount = module.mount(host);
    },
    () => {
      if (!gone) host.replaceChildren(h('p', { class: 'gs-case-hint' }, 'The example could not be loaded.'));
    },
  );
  return () => {
    gone = true;
    unmount?.();
  };
}

/** Draws case `id` into `page`; returns the function that takes its live example down. */
export function casePage(page: HTMLElement, id: CaseId): () => void {
  const c = galleryCase(id);
  const notes = notesForCase(id);
  const { previous, next } = caseNeighbours(id);
  const live = h('div', {});

  page.replaceChildren(
    h(
      'header',
      { class: 'gs-page-head' },
      h(
        'div',
        {},
        h('p', { class: 'gs-eyebrow' }, `Example · ${categoryOf(id).label}`),
        h('h1', { class: 'gs-title' }, c.title),
        h('p', { class: 'gs-lead' }, c.summary),
      ),
      h(
        'a',
        { class: 'gs-btn gs-btn--sm', href: INDEX_HASH },
        h('span', { class: 'gl-back', 'aria-hidden': 'true' }, icon('arrowRight')),
        'All examples',
      ),
    ),
    h(
      'section',
      { 'aria-labelledby': 'case-live-title' },
      h('h2', { class: 'gs-sr-only', id: 'case-live-title' }, `Live example in ${FRAMEWORK_LABEL}`),
      live,
      h(
        'nav',
        { class: 'gs-case-live', 'aria-label': 'This example in every framework' },
        h('p', {}, 'Live in'),
        h(
          'ul',
          { class: 'gs-gallery-links' },
          ...caseLinks(id).map(link =>
            h(
              'li',
              {},
              h(
                'a',
                { class: 'gs-gallery-link', href: link.href, 'aria-current': link.current ? 'page' : null },
                link.label,
              ),
            ),
          ),
        ),
      ),
      h(
        'ul',
        { class: 'gs-gallery-tags gl-tags', 'aria-label': 'Options and APIs' },
        ...c.tags.map(tag => h('li', { class: 'gs-tag' }, tag)),
      ),
    ),
    h(
      'section',
      { class: 'gs-case-section', 'aria-labelledby': 'case-code-title' },
      h('h2', { class: 'gs-h2', id: 'case-code-title' }, 'Code'),
      ...codeTabs(id),
    ),
    ...(notes.length
      ? [
          h(
            'section',
            { class: 'gs-case-section', 'aria-labelledby': 'case-notes-title' },
            h('h2', { class: 'gs-h2', id: 'case-notes-title' }, 'Framework differences'),
            h('ul', { class: 'gs-case-notes' }, ...notes.map(noteItem)),
          ),
        ]
      : []),
    h(
      'nav',
      { class: 'gs-case-pager', 'aria-label': 'More examples' },
      ...(previous
        ? [
            h(
              'a',
              { class: 'gs-case-pager-link', href: caseHash(previous.id) },
              h('span', {}, 'Previous'),
              previous.title,
            ),
          ]
        : []),
      ...(next
        ? [
            h(
              'a',
              { class: 'gs-case-pager-link gs-case-pager-link--next', href: caseHash(next.id) },
              h('span', {}, 'Next'),
              next.title,
            ),
          ]
        : []),
    ),
  );

  return mountCase(live, id);
}
