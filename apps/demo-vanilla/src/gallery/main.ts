// The examples gallery with the Web Component (examples.html): the static shell of the page, and
// the page of the location hash (demo-kit's router): no hash or `#/` is the index, `#/<id>` a case.
// In-page anchors such as `#main` are not routes and change nothing; the skip link and the
// category links keep the URL as it is.
import 'demo-kit/site.css';
import './gallery.css';
import '@gantryjs/vanilla';
import faviconUrl from 'demo-kit/favicon.svg?url';
import { currentGalleryRoute, galleryCase, onHashChange, type GalleryRoute } from 'demo-kit/gallery';
import { PACKAGES, SITE } from 'demo-kit/site';
import { initTheme, onThemeChange, toggleTheme, type SiteTheme } from 'demo-kit/theme';
import { byId, drawIcon, drawIcons, h } from '../dom';
import { casePage } from './case-page';
import { indexPage } from './index-page';
import { FRAMEWORK_LABEL } from './links';

// ── Shell: favicon, version, links, icons, theme ─────────────

document.head.append(h('link', { rel: 'icon', type: 'image/svg+xml', href: faviconUrl }));
byId('site-version').textContent = `v${SITE.version}`;
byId<HTMLAnchorElement>('site-repo').href = SITE.repoUrl;
byId('footer-meta').append(
  h('strong', {}, SITE.name),
  ` v${SITE.version} · ${SITE.license} · `,
  h('a', { href: SITE.repoUrl }, 'GitHub'),
  ' · ',
  h('a', { href: PACKAGES.vanilla.npmUrl }, 'npm'),
  ' · made by ',
  h('a', { href: SITE.authorUrl }, SITE.author),
);
byId('footer-tagline').textContent = SITE.tagline;
drawIcons(document.body);

const themeToggle = byId<HTMLButtonElement>('theme-toggle');
const showTheme = (theme: SiteTheme) => {
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  drawIcon(themeToggle.querySelector('svg')!, theme === 'dark' ? 'sun' : 'moon');
};
onThemeChange(showTheme);
themeToggle.addEventListener('click', () => toggleTheme());
showTheme(initTheme());

const main = byId('main');
// The skip link moves focus to the content without touching the URL (the hash is the route)
byId('skip').addEventListener('click', e => {
  e.preventDefault();
  main.focus();
  main.scrollIntoView();
});

// ── Pages ────────────────────────────────────────────────────

const page = byId('page');
const navExamples = byId('nav-examples');
/** Takes the current case's live example down */
let unmount: (() => void) | null = null;

/** Draws the page of `route`; after a navigation it starts at the top with focus on its content. */
function show(route: GalleryRoute, navigated: boolean): void {
  unmount?.();
  unmount = null;
  const id = route.page === 'case' ? route.id : null;
  navExamples.setAttribute('aria-current', id ? 'true' : 'page');
  document.title = `${id ? `${galleryCase(id).title} · ` : ''}Examples · Gantry ${FRAMEWORK_LABEL}`;
  if (id) unmount = casePage(page, id);
  else page.replaceChildren(...indexPage());
  if (!navigated) return;
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

show(currentGalleryRoute(), false);
onHashChange(route => show(route, true));
