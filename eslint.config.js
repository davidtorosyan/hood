// Lint: catch real mistakes (unused/undefined names, unreachable code…), not
// style — the code's formatting is consistent by hand and not worth a
// formatter's churn. Run `npm run lint`; CI runs it before deploying.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', '.ui-review/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, __COMMIT__: 'readonly', __BUILD_TIME__: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // The harness body runs inside page.evaluate(…) in the browser too.
    files: ['scripts/screenshots.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
