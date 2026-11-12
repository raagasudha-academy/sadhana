import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

const activeFiles = [
  'app/src/**/*.{ts,tsx}',
  'app/tests/**/*.{ts,tsx,mjs}',
  'app/e2e-fixtures/**/*.{ts,tsx,mjs}',
  'backend/src/**/*.{ts,tsx,mjs}',
  'backend/scripts/**/*.{ts,tsx,mjs}',
  'test/**/*.{ts,tsx,mjs}',
  'scripts/**/*.{ts,tsx,mjs}',
  '*.config.{ts,mjs}',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.bak',
      '**/*.bak.*',
      '**/*.before-*',
      '**/.venv*/**',
      '**/*.generated.*',
      '**/*.d.mts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: activeFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['app/src/**/*.{tsx,ts}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  prettier,
);
