import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'backend/**', 'node_modules/**', '**/*.backup', '**/*.bak', '**/*.before-*', '**/*.pre-*'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' } },
    rules: { 'no-debugger': 'error', 'no-constant-condition': 'error', 'no-unreachable': 'error', 'no-duplicate-case': 'error' },
  },
];
