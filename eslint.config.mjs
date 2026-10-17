// @ts-check
// ESLint flat config for the whole workspace: type-checked TypeScript everywhere, Angular
// templates (incl. accessibility), Svelte, Vue, React hooks — and the @gantry/core rules from
// `.claude/rules/core.md` encoded as lint errors. Formatting is Prettier's job (eslint-config-prettier).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import svelte from 'eslint-plugin-svelte';
import vue from 'eslint-plugin-vue';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const SVELTE_FILES = ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'];

/** Restrict plugin configs that apply to every file (no `files`) to the given globs. */
const scope = (configs, files) => configs.map(c => (c.files ? c : { ...c, files }));

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      '**/.angular/**',
      '**/.svelte-kit/**',
      'e2e/__screenshots__/**',
      '.claude/skills/**',
      '**/*.d.ts',
    ],
  },

  // ── Everything ───────────────────────────────────────────────
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },

  // ── TypeScript (type-checked) ────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.vue', '**/*.svelte'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mts'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue', '.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    // Tests and tooling: assertions and fixtures work with loose values
    files: ['**/__tests__/**', '**/*.spec.ts', 'projects/*/src/test/**', 'e2e/**', '**/*.config.*', 'scripts/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Plain JS (scripts, configs): no type information
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // ── @gantry/core: framework-free, DOM-free, deterministic ────
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/__tests__/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Core runs in Node, workers and SSR: no DOM.' },
        { name: 'document', message: 'Core runs in Node, workers and SSR: no DOM.' },
        { name: 'localStorage', message: 'Core is pure: persistence belongs to the bindings.' },
        { name: 'navigator', message: 'Core runs in Node, workers and SSR: no DOM.' },
        { name: 'requestAnimationFrame', message: 'Core runs in Node, workers and SSR: no DOM.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'react', 'react-dom', 'vue', 'svelte', 'svelte/*'],
              message: 'Core is framework-free.',
            },
            {
              group: ['@gantry/vanilla', '@gantry/react', '@gantry/vue', '@gantry/svelte', 'ngx-gantry'],
              message: 'Core must not depend on a binding.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // `now = new Date()` as a default parameter is the documented convenience; anywhere else, take `now` as input
          selector: "NewExpression[callee.name='Date'][arguments.length=0]:not(AssignmentPattern > NewExpression)",
          message: 'Core is deterministic: take `now` as a parameter instead of reading the clock.',
        },
        {
          selector: 'Literal[value=86400000]',
          message: 'Use calendarDays / addDays / dateToPixel: days are not 86 400 000 ms across DST.',
        },
      ],
    },
  },

  // ── @gantry/vanilla: strict CSP + Trusted Types ──────────────
  // No HTML parsing sinks (Trusted Types `require-trusted-types-for 'script'`), no style text
  // (a strict `style-src` refuses inline styles: use `setStyleProp`, the CSSOM, or a stylesheet
  // rule), no inline event handlers, no eval. See packages/vanilla/src/dom/sheet.ts.
  {
    files: ['packages/vanilla/src/**/*.ts'],
    ignores: ['packages/vanilla/src/__tests__/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'setHTMLUnsafe', 'createContextualFragment'].map(
          property => ({
            property,
            message: 'HTML parsing is a Trusted Types sink: build nodes with h() / s() (dom/h.ts).',
          }),
        ),
        {
          property: 'cssText',
          message: 'Style text breaks a strict style-src CSP: use setStyleProp (dom/patch.ts) or a stylesheet rule.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^(style|on)/i]",
          message:
            'No style or inline event-handler attributes (CSP): use setStyleProp / a stylesheet rule, or addEventListener.',
        },
        {
          selector: "MemberExpression[object.name='document'][property.name=/^write(ln)?$/]",
          message: 'document.write is a Trusted Types sink and blocks parsing: build nodes with h() / s().',
        },
      ],
      'no-eval': 'error',
      'no-new-func': 'error',
    },
  },

  // ── Angular (ngx-gantry + showcase) ──────────────────────────
  {
    files: ['projects/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': 'off',
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/no-output-native': 'off',
      '@angular-eslint/prefer-standalone': 'off',
    },
  },
  {
    files: ['projects/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },

  // ── Svelte (scoped: some of its configs have no `files`) ──────
  ...scope(svelte.configs['flat/recommended'], SVELTE_FILES),
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser, svelteConfig: undefined } },
    rules: {
      // `let { … } = $props()` is the runes idiom; svelte/prefer-const understands it
      'prefer-const': 'off',
      'svelte/prefer-const': 'error',
      // typescript-eslint can't see component prop types in templates: svelte-check covers them
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  // ── Vue ──────────────────────────────────────────────────────
  ...scope(vue.configs['flat/recommended'], ['**/*.vue']),
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    // `.vue` imports resolve through vue-tsc, not the TS project service: vue-tsc covers them
    files: ['apps/demo-vue/src/main.ts'],
    rules: { '@typescript-eslint/no-unsafe-argument': 'off' },
  },

  // ── React ────────────────────────────────────────────────────
  {
    files: ['packages/react/**/*.{ts,tsx}', 'apps/demo-react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest']?.rules ?? reactHooks.configs.recommended.rules,
  },

  // Formatting is Prettier's: turn off every stylistic rule, Vue's and Svelte's included (keep last)
  prettier,
  ...scope(svelte.configs['flat/prettier'], SVELTE_FILES),
);
