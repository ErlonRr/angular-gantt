/** The code samples of a case, as `scripts/gallery-sources.mjs` writes them. */

/** Language of a source file (for highlighting and the code block's label). */
export type SourceLang = 'ts' | 'tsx' | 'js' | 'vue' | 'svelte' | 'html' | 'css' | 'scss';

export interface SourceFile {
  /** Path inside the case's directory (`tree/TreeExample.tsx` → `TreeExample.tsx`), or of the shared module */
  file: string;
  lang: SourceLang;
  code: string;
}

/**
 * Every file of a case: one list per framework (the main file first), absent while that
 * framework has no case file yet, and the shared data and options (`demo-kit/gallery/cases/<id>.ts`).
 */
export interface CaseSources {
  angular?: SourceFile[];
  vanilla?: SourceFile[];
  react?: SourceFile[];
  vue?: SourceFile[];
  svelte?: SourceFile[];
  shared: SourceFile[];
}
