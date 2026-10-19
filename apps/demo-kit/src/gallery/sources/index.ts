/**
 * `demo-kit/gallery/sources`: the code samples of every case, generated from the case files of the
 * five apps by `scripts/gallery-sources.mjs` (`pnpm gallery:sources`; CI runs `pnpm gallery:check`).
 * Each case is a lazy chunk: `await CASE_SOURCES[id]()`.
 */

export type { CaseSources, SourceFile, SourceLang } from './types';
export { CASE_COVERAGE, CASE_SOURCES } from './index.generated';
