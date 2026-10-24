import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.github/', 'node_modules/', 'dist/', '**/*.d.ts', 'index.js', 'tasks/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['test/**/*.mts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha },
    },
    rules: {
      // Chai assertions such as `expect(x).to.be.true` are expressions.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
