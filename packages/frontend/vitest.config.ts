import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
    // Exclude db tests that require native DuckDB module (manual test only)
    exclude: ['**/node_modules/**', '**/dist/**', '**/_db.test.ts'],
  },
});
