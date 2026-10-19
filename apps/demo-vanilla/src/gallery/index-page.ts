// The gallery index (examples.html without a case): every case by category. A card's title opens
// the case on this page; its pills open the same case in each framework.
import { CASE_IDS, casesByCategory } from 'demo-kit/gallery';
import { PACKAGES, frameworkCaseUrl } from 'demo-kit/site';
import { h } from '../dom';
import { FRAMEWORK_LABEL, caseHash, caseLinks } from './links';

/** A jump to a category: scroll to it and focus its heading, without touching the URL (the hash is the route). */
function jump(e: MouseEvent, category: string): void {
  e.preventDefault();
  document.getElementById(`gallery-${category}`)?.scrollIntoView();
  document.getElementById(`gallery-${category}-title`)?.focus({ preventScroll: true });
}

export function indexPage(): Node[] {
  const groups = casesByCategory();

  const head = h(
    'div',
    { class: 'gs-page-head' },
    h(
      'div',
      {},
      h('p', { class: 'gs-eyebrow' }, `Examples · ${PACKAGES.vanilla.name}`),
      h('h1', { class: 'gs-title' }, 'Examples'),
      h(
        'p',
        { class: 'gs-lead' },
        `${CASE_IDS.length} cases, each one written for the ${FRAMEWORK_LABEL} over the shared data of the gallery, with its code and the framework differences it runs into. The `,
        h('a', { class: 'gs-link', href: frameworkCaseUrl('angular') }, 'Gantry site'),
        ' shows every case in all five frameworks.',
      ),
    ),
  );

  const cats = h(
    'nav',
    { 'aria-label': 'Gallery categories' },
    h(
      'ul',
      { class: 'gs-gallery-cats' },
      ...groups.map(group => {
        const link = h(
          'a',
          { class: 'gs-gallery-cat-link', href: `#gallery-${group.category.id}` },
          group.category.label,
          h('span', { class: 'gs-count', 'aria-hidden': 'true' }, String(group.cases.length)),
        );
        link.addEventListener('click', e => jump(e, group.category.id));
        return h('li', {}, link);
      }),
    ),
  );

  const gallery = h(
    'div',
    { class: 'gs-gallery' },
    ...groups.map(group =>
      h(
        'section',
        {
          class: 'gs-gallery-cat',
          id: `gallery-${group.category.id}`,
          'aria-labelledby': `gallery-${group.category.id}-title`,
        },
        h(
          'div',
          { class: 'gs-gallery-cat-head' },
          h('h2', { class: 'gs-h3', id: `gallery-${group.category.id}-title`, tabindex: -1 }, group.category.label),
          h('p', {}, group.category.summary),
        ),
        h(
          'ul',
          { class: 'gs-gallery-grid' },
          ...group.cases.map(c =>
            h(
              'li',
              { class: 'gs-gallery-card' },
              h(
                'h3',
                { class: 'gs-gallery-card-title' },
                h('a', { href: caseHash(c.id) }, c.title),
                ...(c.isNew ? [h('span', { class: 'gs-badge' }, 'New')] : []),
              ),
              h('p', {}, c.summary),
              h(
                'ul',
                { class: 'gs-gallery-links', 'aria-label': `Open ${c.title} live` },
                ...caseLinks(c.id).map(link =>
                  h(
                    'li',
                    {},
                    h(
                      'a',
                      { class: 'gs-gallery-link', href: link.href },
                      h('span', { class: 'gs-sr-only' }, `${c.title} in `),
                      link.label,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  return [head, cats, gallery];
}
