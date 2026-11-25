import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'reports/**', 'playwright-report/**', 'test-results/**'] },

  js.configs.recommended,

  // TypeScript: the application, the framework and the suites
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // API responses in negative tests are intentionally loose
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'no-restricted-syntax': ['error', { selector: "CallExpression[callee.property.name='waitForTimeout']", message: 'Wait for a condition (expect / expect.poll), not for time.' }],
    },
  },

  // Tests: Playwright best practices
  {
    files: ['suites/**/*.ts', 'framework/suites/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/expect-expect': 'off', // many tests assert through helpers (expectLeaseSummary, ...)
      'playwright/no-conditional-in-test': 'off', // scenario tables legitimately branch
      'playwright/no-conditional-expect': 'off',
      'playwright/valid-title': 'off',
      'playwright/no-wait-for-timeout': 'warn',
    },
  },

  // The front end runs in the browser
  {
    files: ['app/public/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
  },

  // Plain Node scripts
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  // These scripts also run small functions inside the browser (page.evaluate)
  {
    files: ['scripts/screenshots.mjs', 'scripts/make-demo-gif.mjs', 'scripts/make-social-preview.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
