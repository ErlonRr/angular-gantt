import { InjectionToken } from '@angular/core';
import type { CaseId } from 'demo-kit/gallery/catalog';

/** The id of the case a case component renders (provided by the case page). */
export const GALLERY_CASE = new InjectionToken<CaseId>('GALLERY_CASE');
