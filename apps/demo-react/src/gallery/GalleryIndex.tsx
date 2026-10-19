import type { MouseEvent } from 'react';
import { CASE_IDS, casesByCategory, galleryHash } from 'demo-kit/gallery';
import { PACKAGES, frameworkCaseUrl } from 'demo-kit/site';
import { FRAMEWORK_LABEL, caseLinks } from './links';

const GROUPS = casesByCategory();

/**
 * A jump to a category: scroll to it and move focus to its heading, without touching the URL (the
 * hash is the route).
 */
function jump(e: MouseEvent, category: string) {
  e.preventDefault();
  document.getElementById(`gallery-${category}`)?.scrollIntoView();
  document.getElementById(`gallery-${category}-title`)?.focus({ preventScroll: true });
}

/**
 * `#/examples`: every case by category. A card's title opens the case in this app; its pills
 * open the same case in each framework.
 */
export function GalleryIndex() {
  return (
    <>
      <div className="gs-page-head">
        <div>
          <p className="gs-eyebrow">Examples · {PACKAGES.react.name}</p>
          <h1 className="gs-title">Examples</h1>
          <p className="gs-lead">
            {CASE_IDS.length} cases, each one written in {FRAMEWORK_LABEL} over the shared data of the gallery, with its
            code and the framework differences it runs into. The{' '}
            <a className="gs-link" href={frameworkCaseUrl('angular')}>
              Gantry site
            </a>{' '}
            shows every case in all five frameworks.
          </p>
        </div>
      </div>

      <nav aria-label="Gallery categories">
        <ul className="gs-gallery-cats">
          {GROUPS.map(group => (
            <li key={group.category.id}>
              <a
                className="gs-gallery-cat-link"
                href={`#gallery-${group.category.id}`}
                onClick={e => jump(e, group.category.id)}
              >
                {group.category.label}
                <span className="gs-count" aria-hidden="true">
                  {group.cases.length}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="gs-gallery">
        {GROUPS.map(group => (
          <section
            key={group.category.id}
            className="gs-gallery-cat"
            id={`gallery-${group.category.id}`}
            aria-labelledby={`gallery-${group.category.id}-title`}
          >
            <div className="gs-gallery-cat-head">
              <h2 className="gs-h3" id={`gallery-${group.category.id}-title`} tabIndex={-1}>
                {group.category.label}
              </h2>
              <p>{group.category.summary}</p>
            </div>
            <ul className="gs-gallery-grid">
              {group.cases.map(c => (
                <li key={c.id} className="gs-gallery-card">
                  <h3 className="gs-gallery-card-title">
                    <a href={galleryHash(c.id)}>{c.title}</a>
                    {c.isNew && <span className="gs-badge">New</span>}
                  </h3>
                  <p>{c.summary}</p>
                  <ul className="gs-gallery-links" aria-label={`Open ${c.title} live`}>
                    {caseLinks(c.id).map(link => (
                      <li key={link.fw}>
                        <a className="gs-gallery-link" href={link.href}>
                          <span className="gs-sr-only">{c.title} in </span>
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
