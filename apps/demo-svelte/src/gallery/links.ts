import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, galleryHash, type CaseId } from 'demo-kit/gallery';
import { frameworkCaseUrl } from 'demo-kit/site';

/** This app's framework in the gallery */
export const FRAMEWORK = 'svelte';
export const FRAMEWORK_LABEL = GALLERY_FRAMEWORK_LABELS[FRAMEWORK];

/**
 * The same case in every framework: this app's own page by its hash (it works on any host), the
 * others on the deployed site, which serves every demo app (`frameworkCaseUrl`).
 */
export function caseLinks(id: CaseId) {
  return GALLERY_FRAMEWORKS.map(fw => ({
    fw,
    label: GALLERY_FRAMEWORK_LABELS[fw],
    href: fw === FRAMEWORK ? galleryHash(id) : frameworkCaseUrl(fw, id),
    current: fw === FRAMEWORK,
  }));
}
