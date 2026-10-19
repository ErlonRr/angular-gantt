// The Web Component file of each gallery case, found on disk (no registry): a case is
// `cases/<id>/<id>.ts` exporting `mount(host)`, plus any helper files in its directory. A case
// without its file is drawn by generic-case.ts from the shared data. The code tab shows the case's
// own files (`?raw`, so what you read is what runs).
import { CASE_IDS, type CaseId } from 'demo-kit/gallery';
import type { SourceFile, SourceLang } from 'demo-kit/gallery/sources';

/**
 * What a case file exports: `mount(host)` builds the case (`div.gs-case` with its controls and
 * charts) inside `host` and returns the function that takes it down (listeners, subscriptions).
 */
export interface CaseModule {
  mount(host: HTMLElement): () => void;
}

const MAIN = import.meta.glob<CaseModule>('./cases/*/*.ts');
const RAW = import.meta.glob<string>(['./cases/**/*.{ts,js,mjs,css,scss,html}', '!./cases/**/*.{test,spec}.*'], {
  query: '?raw',
  import: 'default',
});

/** The main file of a case, inside its directory: `tree.ts` */
export const mainFile = (id: CaseId) => `${id}.ts`;

/** The loaders of the cases that have their own file */
export const CASE_MODULES: Partial<Record<CaseId, () => Promise<CaseModule>>> = Object.fromEntries(
  CASE_IDS.flatMap(id => {
    const main = `./cases/${id}/${mainFile(id)}`;
    return main in MAIN ? [[id, MAIN[main]]] : [];
  }),
);

const LANGS: Record<string, SourceLang> = {
  ts: 'ts',
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
