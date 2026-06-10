import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  { ignores: ['dist/', 'src/generated/'] },
  tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Re-enable after prettierConfig so Prettier doesn't override this rule.
    // Run `lint:fix` AFTER `format` — Prettier collapses types, ESLint re-expands them.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/object-curly-newline': [
        'error',
        {
          TSTypeLiteral: { multiline: true, minProperties: 2 },
        },
      ],
      '@stylistic/object-property-newline': [
        'error',
        { allowAllPropertiesOnSameLine: false },
      ],
    },
  },
  {
    files: ['src/**/*_test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
