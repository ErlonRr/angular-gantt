// The React file of each gallery case, found on disk (no registry): a case is
// `cases/<id>/<Pascal>Example.tsx` with a default-exported component that takes no props, plus any
// helper files in its directory. A case without its file is drawn by GenericCase.tsx from the
// shared data. The code tab shows the case's own files (`?raw`, so what you read is what runs).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { CASE_IDS, type CaseId } from 'demo-kit/gallery';
import type { SourceFile, SourceLang } from 'demo-kit/gallery/sources';

const MAIN = import.meta.glob<{ default: ComponentType }>('./cases/*/*Example.tsx');
const RAW = import.meta.glob<string>(['./cases/**/*.{ts,tsx,js,mjs,css,scss,html}', '!./cases/**/*.{test,spec}.*'], {
  query: '?raw',
  import: 'default',
});

const pascal = (id: string) =>
  id
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** The main file of a case, inside its directory: `TreeExample.tsx` */
export const mainFile = (id: CaseId) => `${pascal(id)}Example.tsx`;

/** The cases that have their own React component (loaded when shown) */
export const CASE_COMPONENTS: Partial<Record<CaseId, LazyExoticComponent<ComponentType>>> = Object.fromEntries(
  CASE_IDS.flatMap(id => {
    const main = `./cases/${id}/${mainFile(id)}`;
    return main in MAIN ? [[id, lazy(MAIN[main])]] : [];
  }),
);

const LANGS: Record<string, SourceLang> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  css: 'css',
  scss: 'scss',
  html: 'html',
};

/** The case's own files (the main file first, then by path), empty while it has none */
export async function ownSources(id: CaseId): Promise<SourceFile[]> {
  const dir = `./cases/${id}/`;
  const main = mainFile(id);
  const files = Object.keys(RAW)
    .filter(path => path.startsWith(dir))
    .map(path => path.slice(dir.length))
    .sort((a, b) => (a === main ? -1 : b === main ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return Promise.all(
    files.map(async file => ({
      file,
      lang: LANGS[file.slice(file.lastIndexOf('.') + 1)] ?? 'ts',
      code: await RAW[dir + file](),
    })),
  );
}
