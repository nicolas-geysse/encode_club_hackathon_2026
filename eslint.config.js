import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/recommended';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/.vinxi/',
      '**/.output/',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
    ],
  },

  // Base recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Global settings for all files
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Console logging - warn to encourage using createLogger
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      // General
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },

  // SolidJS specific rules for frontend
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    ...solid,
    rules: {
      ...solid.rules,
      'solid/reactivity': 'warn',
      'solid/no-destructure': 'warn',
      'solid/prefer-for': 'warn',
    },
  },

  // MCP Server - Node.js environment
  {
    files: ['packages/mcp-server/**/*.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },

  // Prettier compatibility (must be last)
  prettier
);
