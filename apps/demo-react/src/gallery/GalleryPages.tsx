import { useEffect, useRef, type MouseEvent } from 'react';
import { galleryCase, galleryHash, type CaseId } from 'demo-kit/gallery';
import { PACKAGES, SITE } from 'demo-kit/site';
import { toggleTheme } from 'demo-kit/theme';
import { Icon } from '../Icon';
import { CasePage } from './CasePage';
import { GalleryIndex } from './GalleryIndex';
import { FRAMEWORK_LABEL } from './links';
import { useDarkMode } from './site-theme';
import './gallery.css';

const PKG = PACKAGES.react;

/**
 * The gallery's pages, `#/examples` (the index) and `#/examples/<id>` (a case), in the site shell:
 * skip link, header with the Home / Examples nav and the theme switch, footer. After a navigation
 * the page starts at the top with focus on its content; the tab title names the page.
 */
export default function GalleryPages({ caseId, navigated }: { caseId: CaseId | null; navigated: boolean }) {
  const main = useRef<HTMLElement>(null);
  const dark = useDarkMode();

  useEffect(() => {
    document.title = `${caseId ? `${galleryCase(caseId).title} · ` : ''}Examples · Gantry ${FRAMEWORK_LABEL}`;
    if (!navigated) return;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [caseId, navigated]);

  /** The skip link moves focus to the content without touching the URL (the hash is the route). */
  const skip = (e: MouseEvent) => {
    e.preventDefault();
    main.current?.focus();
    main.current?.scrollIntoView();
  };

  return (
    <div className="gs-app">
      <a className="gs-skip" href="#main" onClick={skip}>
        Skip to content
      </a>
      <header className="gs-header">
        <div className="gs-container gs-header-inner">
          <a className="gs-brand" href="#/">
            <span className="gs-logo" aria-hidden="true" />
            <span>{SITE.name}</span>
            <span className="gs-version">v{SITE.version}</span>
            <span className="gs-badge">{FRAMEWORK_LABEL}</span>
          </a>
          <nav className="gs-nav" aria-label="Primary">
            <ul className="gs-nav-list">
              <li>
                <a className="gs-nav-link" href="#/">
                  <Icon name="home" />
                  <span>Home</span>
                </a>
              </li>
              <li>
                <a className="gs-nav-link" href={galleryHash()} aria-current={caseId ? 'true' : 'page'}>
                  <Icon name="examples" />
                  <span>Examples</span>
                </a>
              </li>
            </ul>
          </nav>
          <div className="gs-header-actions">
            <button
              type="button"
              className="gs-icon-btn"
              aria-label="Dark theme"
              aria-pressed={dark}
              onClick={() => toggleTheme()}
            >
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <a className="gs-icon-btn" href={SITE.repoUrl} aria-label="Source code on GitHub">
              <Icon name="github" />
            </a>
          </div>
        </div>
      </header>

      <main id="main" ref={main} className="gs-main" tabIndex={-1}>
        <div className="gs-container">{caseId ? <CasePage key={caseId} id={caseId} /> : <GalleryIndex />}</div>
      </main>

      <footer className="gs-footer">
        <div className="gs-container">
          <p>
            <strong>{SITE.name}</strong> v{SITE.version} · {SITE.license} · <a href={SITE.repoUrl}>GitHub</a> ·{' '}
            <a href={PKG.npmUrl}>npm</a> · made by <a href={SITE.authorUrl}>{SITE.author}</a>
          </p>
          <p>{SITE.tagline}</p>
        </div>
      </footer>
    </div>
  );
}
