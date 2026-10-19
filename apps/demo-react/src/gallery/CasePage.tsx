import { Suspense } from 'react';
import { caseNeighbours, categoryOf, galleryCase, galleryHash, notesForCase, type CaseId } from 'demo-kit/gallery';
import { Icon } from '../Icon';
import { CASE_COMPONENTS } from './cases';
import { CodeTabs } from './CodeTabs';
import { GenericCase } from './GenericCase';
import { FRAMEWORK_LABEL, caseLinks } from './links';
import { NoteItem } from './notes';

/** The case's own component when it has one (`cases/<id>/<Pascal>Example.tsx`), else the generic renderer. */
function LiveCase({ id }: { id: CaseId }) {
  const Case = CASE_COMPONENTS[id];
  if (!Case) return <GenericCase id={id} />;
  return (
    <Suspense fallback={<p className="gs-case-hint">Loading the example…</p>}>
      <Case />
    </Suspense>
  );
}

/**
 * `#/examples/<id>`: a gallery case. The live React example, the same case in the other
 * frameworks, its code (this app's files and the shared data), the framework differences it runs
 * into, and the previous and next cases. The page is keyed by the case: a new case starts fresh.
 */
export function CasePage({ id }: { id: CaseId }) {
  const c = galleryCase(id);
  const notes = notesForCase(id);
  const { previous, next } = caseNeighbours(id);

  return (
    <>
      <header className="gs-page-head">
        <div>
          <p className="gs-eyebrow">Example · {categoryOf(id).label}</p>
          <h1 className="gs-title">{c.title}</h1>
          <p className="gs-lead">{c.summary}</p>
        </div>
        <a className="gs-btn gs-btn--sm" href={galleryHash()}>
          <span className="gl-back" aria-hidden="true">
            <Icon name="arrowRight" />
          </span>
          All examples
        </a>
      </header>

      <section aria-labelledby="case-live-title">
        <h2 className="gs-sr-only" id="case-live-title">
          Live example in {FRAMEWORK_LABEL}
        </h2>
        <LiveCase id={id} />
        <nav className="gs-case-live" aria-label="This example in every framework">
          <p>Live in</p>
          <ul className="gs-gallery-links">
            {caseLinks(id).map(link => (
              <li key={link.fw}>
                <a className="gs-gallery-link" href={link.href} aria-current={link.current ? 'page' : undefined}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="gs-gallery-tags gl-tags" aria-label="Options and APIs">
          {c.tags.map(tag => (
            <li key={tag} className="gs-tag">
              {tag}
            </li>
          ))}
        </ul>
      </section>

      <section className="gs-case-section" aria-labelledby="case-code-title">
        <h2 className="gs-h2" id="case-code-title">
          Code
        </h2>
        <CodeTabs id={id} />
      </section>

      {notes.length > 0 && (
        <section className="gs-case-section" aria-labelledby="case-notes-title">
          <h2 className="gs-h2" id="case-notes-title">
            Framework differences
          </h2>
          <ul className="gs-case-notes">
            {notes.map(note => (
              <NoteItem key={note.id} note={note} />
            ))}
          </ul>
        </section>
      )}

      <nav className="gs-case-pager" aria-label="More examples">
        {previous && (
          <a className="gs-case-pager-link" href={galleryHash(previous.id)}>
            <span>Previous</span>
            {previous.title}
          </a>
        )}
        {next && (
          <a className="gs-case-pager-link gs-case-pager-link--next" href={galleryHash(next.id)}>
            <span>Next</span>
            {next.title}
          </a>
        )}
      </nav>
    </>
  );
}
