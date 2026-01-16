/**
 * Helper for importing native modules in Vite SSR
 *
 * Vite SSR transforms ESM imports in a way incompatible with native Node.js modules.
 * This helper uses createRequire to load these modules via CommonJS, which works correctly.
 *
 * Problem: `import * as duckdb from 'duckdb'` fails in Vite SSR because:
 * 1. Vite transforms the import to its own module system
 * 2. Native .node bindings don't support this transformation
 *
 * Solution: Use Node's createRequire to load native modules via CommonJS
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Load a native module safely in Vite SSR environment
 *
 * @param moduleName - The name of the native module to load (e.g., 'duckdb', 'better-sqlite3')
 * @returns The loaded module
 *
 * @example
 * const duckdb = loadNativeModule<typeof import('duckdb')>('duckdb');
 */
export function loadNativeModule<T = unknown>(moduleName: string): T {
  return require(moduleName) as T;
}

// Pre-loaded native modules for convenience
import type { DuckDBModule } from '../types/duckdb';

export const duckdb: DuckDBModule = loadNativeModule<DuckDBModule>('duckdb');
