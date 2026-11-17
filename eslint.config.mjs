// Root ESLint flat config for the whole monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      'packages/db/migrations/**',
      'services/**',
      'data/**',
      'infra/**',
      // Static browser pages for the visual guide (not app code).
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Config rule: only packages/shared/src/config.ts may read process.env.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: "Import { config } from '@sta/shared' instead of reading process.env.",
        },
      ],
    },
  },
  {
    files: ['packages/shared/src/config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  prettier,
);
