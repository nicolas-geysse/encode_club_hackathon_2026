module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'solid'],
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
  overrides: [
    {
      // SolidJS specific rules for frontend
      files: ['packages/frontend/**/*.{ts,tsx}'],
      plugins: ['solid'],
      extends: ['plugin:solid/recommended'],
      rules: {
        'solid/reactivity': 'warn',
        'solid/no-destructure': 'warn',
        'solid/prefer-for': 'warn',
      },
    },
    {
      // MCP Server - Node.js environment
      files: ['packages/mcp-server/**/*.ts'],
      env: {
        browser: false,
        node: true,
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.vinxi/',
    '.output/',
    '*.config.js',
    '*.config.ts',
  ],
};
