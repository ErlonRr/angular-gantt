import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { currentGalleryRoute, onHashChange } from 'demo-kit/gallery';

// The gallery loads when first shown: the home page doesn't carry it
const GalleryPages = lazy(() => import('./GalleryPages'));

const HOME_TITLE = document.title;

/**
 * The app's pages by the location hash (demo-kit's router): `#/examples` and `#/examples/<id>`
 * are the gallery, anything else is `home` (today's page at `/`). In-page anchors such as `#main`
 * are not routes and change nothing.
 */
export function GalleryRoot({ home }: { home: ReactNode }) {
  const [{ route, navigated }, setState] = useState(() => ({ route: currentGalleryRoute(), navigated: false }));
  useEffect(() => onHashChange(next => setState({ route: next, navigated: true })), []);

  const isHome = route.page === 'home';
  useEffect(() => {
    if (!isHome) return;
    document.title = HOME_TITLE;
    if (!navigated) return;
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [isHome, navigated]);

  if (route.page === 'home') return home;
  return (
    <Suspense fallback={null}>
      <GalleryPages caseId={route.page === 'case' ? route.id : null} navigated={navigated} />
    </Suspense>
  );
}
