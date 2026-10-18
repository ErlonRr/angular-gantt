/** Names, links and navigation of the Gantry site, shared by every demo app. */

import vanillaPackage from '@gantryjs/vanilla/package.json' with { type: 'json' };
import type { IconName } from './icons';

export const SITE = {
  name: 'Gantry',
  /** Version of the published packages (`@gantryjs/*` are versioned together). */
  version: vanillaPackage.version,
  repoUrl: 'https://github.com/ErlonRr/gantryjs',
  readmeUrl: 'https://github.com/ErlonRr/gantryjs#readme',
  configurationUrl: 'https://github.com/ErlonRr/gantryjs#configuration',
  changelogUrl: 'https://github.com/ErlonRr/gantryjs/blob/main/CHANGELOG.md',
  author: 'Erlon Rru',
  authorUrl: 'https://erlonrru.com',
  license: 'MIT License',
  /** Footer line under the meta line. */
  tagline: 'Every chart on this site is a live instance of the library, running in your browser.',
} as const;

export type PackageId = 'vanilla' | 'core' | 'angular' | 'react' | 'vue' | 'svelte';

export const PACKAGES: Record<PackageId, { name: string; npmUrl: string }> = {
  vanilla: { name: '@gantryjs/vanilla', npmUrl: 'https://www.npmjs.com/package/@gantryjs/vanilla' },
  core: { name: '@gantryjs/core', npmUrl: 'https://www.npmjs.com/package/@gantryjs/core' },
  angular: { name: 'ngx-gantry', npmUrl: 'https://www.npmjs.com/package/ngx-gantry' },
  react: { name: '@gantryjs/react', npmUrl: 'https://www.npmjs.com/package/@gantryjs/react' },
  vue: { name: '@gantryjs/vue', npmUrl: 'https://www.npmjs.com/package/@gantryjs/vue' },
  svelte: { name: '@gantryjs/svelte', npmUrl: 'https://www.npmjs.com/package/@gantryjs/svelte' },
};

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';
export const PACKAGE_MANAGERS: readonly PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun'];

/** `pnpm add @gantryjs/vanilla`, `npm i …`, `yarn add …`, `bun add …`. */
export function installCommand(pm: PackageManager, pkg: string): string {
  return `${pm === 'npm' ? 'npm i' : `${pm} add`} ${pkg}`;
}

export interface NavItem {
  id: 'home' | 'playground' | 'examples' | 'theming' | 'frameworks' | 'api';
  label: string;
  /** Path without the leading slash (`''` is the home page). */
  path: string;
  icon: IconName;
}

/** Primary navigation of the site (the Angular showcase). */
export const NAV: readonly NavItem[] = [
  { id: 'home', label: 'Home', path: '', icon: 'home' },
  { id: 'playground', label: 'Playground', path: 'playground', icon: 'playground' },
  { id: 'examples', label: 'Examples', path: 'examples', icon: 'examples' },
  { id: 'theming', label: 'Theming', path: 'theming', icon: 'theming' },
  { id: 'frameworks', label: 'Frameworks', path: 'frameworks', icon: 'frameworks' },
  { id: 'api', label: 'API', path: 'api', icon: 'api' },
];

export type FrameworkId = 'html' | 'js' | 'angular' | 'react' | 'vue' | 'svelte';

export interface Framework {
  id: FrameworkId;
  label: string;
  /** The package to install. */
  package: PackageId;
}

export const FRAMEWORKS: readonly Framework[] = [
  { id: 'html', label: 'HTML', package: 'vanilla' },
  { id: 'js', label: 'JavaScript', package: 'vanilla' },
  { id: 'angular', label: 'Angular', package: 'angular' },
  { id: 'react', label: 'React', package: 'react' },
  { id: 'vue', label: 'Vue', package: 'vue' },
  { id: 'svelte', label: 'Svelte', package: 'svelte' },
];
