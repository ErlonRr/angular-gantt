import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, galleryHash, type CaseId } from 'demo-kit/gallery';
import { frameworkCaseUrl } from 'demo-kit/site';

/** This app's framework in the gallery */
export const FRAMEWORK = 'vanilla';
export const FRAMEWORK_LABEL = GALLERY_FRAMEWORK_LABELS[FRAMEWORK];

/** A case on this page: `#/<id>` (examples.html is the index itself) */
export const caseHash = (id: CaseId) => galleryHash(id, 'page');

/** The gallery index on this page */
export const INDEX_HASH = '#/';

/**
 * The same case in every framework: this page by its hash (it works on any host), the others on
 * the deployed site, which serves every demo app (`frameworkCaseUrl`).
 */
export function caseLinks(id: CaseId) {
  return GALLERY_FRAMEWORKS.map(fw => ({
    fw,
    label: GALLERY_FRAMEWORK_LABELS[fw],
    href: fw === FRAMEWORK ? caseHash(id) : frameworkCaseUrl(fw, id),
    current: fw === FRAMEWORK,
  }));
}
