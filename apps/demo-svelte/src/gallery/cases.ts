// The Svelte file of each gallery case, found on disk (no registry): a case is
// `cases/<id>/<Pascal>Example.svelte` (runes, no props), plus any helper files in its directory. A
// case without its file is drawn by GenericCase.svelte from the shared data. The code tab shows the
// case's own files (`?raw`, so what you read is what runs).
import type { Component } from 'svelte';
import { CASE_IDS, type CaseId } from 'demo-kit/gallery';
import type { SourceFile, SourceLang } from 'demo-kit/gallery/sources';

type CaseModule = { default: Component };

const MAIN = import.meta.glob<CaseModule>('./cases/*/*Example.svelte');
const RAW = import.meta.glob<string>(['./cases/**/*.{svelte,ts,js,mjs,css,scss,html}', '!./cases/**/*.{test,spec}.*'], {
  query: '?raw',
  import: 'default',
});

const pascal = (id: string) =>
  id
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** The main file of a case, inside its directory: `TreeExample.svelte` */
export const mainFile = (id: CaseId) => `${pascal(id)}Example.svelte`;

/** The loaders of the cases that have their own Svelte component */
export const CASE_COMPONENTS: Partial<Record<CaseId, () => Promise<CaseModule>>> = Object.fromEntries(
  CASE_IDS.flatMap(id => {
    const main = `./cases/${id}/${mainFile(id)}`;
    return main in MAIN ? [[id, MAIN[main]]] : [];
  }),
);

const LANGS: Record<string, SourceLang> = {
  svelte: 'svelte',
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
