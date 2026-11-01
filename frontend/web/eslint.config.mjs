// ESLint flat config (ESLint 10). The gate (`npm run lint`) covers the motion-phase surface only; `npm run lint:all`
// reports the legacy app for information. eslint-config-prettier stays last so formatting is Prettier's job alone.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'node_modules/**', 'tests/e2e/fixtures/**', 'tools/**', '**/*.config.*']),
  js.configs.recommended,
  tseslint.configs.recommended,
  // React rules apply to app code only: Playwright fixtures call a `use` callback that is not a React hook.
  { files: ['src/**/*.{ts,tsx}'], ...reactHooks.configs.flat.recommended },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  },
  // Playwright specs run in Node; code passed to page.evaluate runs in the browser, so both global sets apply.
  { files: ['tests/e2e/**/*.ts'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  prettier,
);
