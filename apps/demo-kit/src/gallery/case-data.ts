/**
 * The generic data of every case (`<camelId>Case` of `cases/<id>.ts`): what a framework app draws
 * for a case until its own case file exists.
 */

import type { CaseId } from './catalog';
import type { GalleryCaseData } from './types';
import { cellEditingCase } from './cases/cell-editing';
import { controlledCase } from './cases/controlled';
import { customBarsCase } from './cases/custom-bars';
import { customColumnsCase } from './cases/custom-columns';
import { customEditorsCase } from './cases/custom-editors';
import { densityCase } from './cases/density';
import { dependenciesCase } from './cases/dependencies';
import { dependencyEditingCase } from './cases/dependency-editing';
import { editingCase } from './cases/editing';
import { i18nCase } from './cases/i18n';
import { keyboardCase } from './cases/keyboard';
import { largeCase } from './cases/large';
import { lazyCase } from './cases/lazy';
import { milestonesBaselinesCase } from './cases/milestones-baselines';
import { multiPipelineCase } from './cases/multi-pipeline';
import { nonWorkingCase } from './cases/non-working';
import { onlyParentsCase } from './cases/only-parents';
import { onlyParentsStyledCase } from './cases/only-parents-styled';
import { responsiveCase } from './cases/responsive';
import { statesCase } from './cases/states';
import { stylesCase } from './cases/styles';
import { themingCase } from './cases/theming';
import { tooltipCase } from './cases/tooltip';
import { treeCase } from './cases/tree';
import { weekNumberingCase } from './cases/week-numbering';

export const CASE_DATA: Readonly<Record<CaseId, GalleryCaseData>> = {
  states: statesCase,
  lazy: lazyCase,
  tree: treeCase,
  'only-parents': onlyParentsCase,
  'only-parents-styled': onlyParentsStyledCase,
  styles: stylesCase,
  dependencies: dependenciesCase,
  'milestones-baselines': milestonesBaselinesCase,
  'non-working': nonWorkingCase,
  'week-numbering': weekNumberingCase,
  editing: editingCase,
  'cell-editing': cellEditingCase,
  'custom-editors': customEditorsCase,
  'dependency-editing': dependencyEditingCase,
  controlled: controlledCase,
  'multi-pipeline': multiPipelineCase,
  'custom-bars': customBarsCase,
  'custom-columns': customColumnsCase,
  tooltip: tooltipCase,
  theming: themingCase,
  i18n: i18nCase,
  responsive: responsiveCase,
  density: densityCase,
  large: largeCase,
  keyboard: keyboardCase,
};
