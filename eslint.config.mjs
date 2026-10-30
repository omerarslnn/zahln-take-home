// One flat ESLint config for the whole monorepo. Type-aware rules catch unhandled promises (a
// forgotten `await` on a payment call is a correctness bug); the boundary rules below keep
// platform-specific code out of the shared packages. Formatting is Prettier's job, not ESLint's.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.expo/',
    '**/expo-env.d.ts',
    'apps/*/android/',
    'apps/*/ios/',
    'artifacts/',
    'brief/',
    'packages/api/src/generated/',
  ]),

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  {
    files: ['**/*.tsx', 'packages/shared/src/react/**/*.ts'],
    extends: [reactHooks.configs.flat.recommended],
  },

  // node:test's describe/it return promises that the runner itself awaits.
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it'] },
          ],
        },
      ],
    },
  },

  // Config files and scripts written in plain JavaScript run in Node.
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs', 'apps/student/*.js', 'apps/till/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },

  // Platform boundary: packages/*/src runs unchanged in React Native, the browser and Node scripts.
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react-native', 'react-native-*', 'expo', 'expo-*', '@expo/*', 'nativewind'],
              message: 'packages/ are shared with the web dashboard: no native imports.',
            },
            {
              group: ['react-dom', 'react-dom/*'],
              message: 'packages/ are shared with the native apps: no DOM renderer.',
            },
            {
              group: ['node:*'],
              message: 'packages/ run in browsers and React Native: no Node built-ins.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'process',
        'Buffer',
        'require',
      ],
    },
  },

  // App code never logs: tokens, amounts and personal data must not end up in device logs.
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },

  // Expo inlines EXPO_PUBLIC_* only for literal `process.env.EXPO_PUBLIC_NAME` reads.
  {
    files: ['apps/student/**/*.{ts,tsx}', 'apps/till/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "VariableDeclarator[id.type='ObjectPattern'][init.object.name='process'][init.property.name='env']",
          message:
            'Read process.env.EXPO_PUBLIC_NAME directly; Expo does not inline destructuring.',
        },
        {
          selector:
            "MemberExpression[computed=true][object.object.name='process'][object.property.name='env']",
          message: 'Dynamic process.env access is not inlined by Expo.',
        },
      ],
    },
  },
);
