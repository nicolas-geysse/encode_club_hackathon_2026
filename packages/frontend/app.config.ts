import { defineConfig } from "@solidjs/start/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Monorepo root (2 levels up from packages/frontend)
const rootDir = resolve(__dirname, "../..");

export default defineConfig({
  server: {
    preset: "node-server",
    // Keep native modules and workspace packages external (not bundled by Nitro)
    // Include @ai-sdk/*-v5 aliases to satisfy @mastra/core runtime imports
    externals: [
      "duckdb",
      "@stride/mcp-server",
      "@ai-sdk/provider-v5",
      "@ai-sdk/provider-utils-v5",
    ],
  },
  vite: {
    // Read .env from monorepo root (single source of truth)
    envDir: rootDir,
    server: {
      port: 3006,
      strictPort: true, // Fail if 3006 is occupied
    },
    resolve: {
      alias: {
        "~": resolve(__dirname, "./src"),
        // Fix Mastra 1.0.4 bug: imports non-existent @ai-sdk/*-v5 packages
        "@ai-sdk/provider-v5": "@ai-sdk/provider",
        "@ai-sdk/provider-utils-v5": "@ai-sdk/provider-utils",
      },
    },
    // SSR config: don't bundle native modules and workspace packages
    ssr: {
      external: ["duckdb", "@stride/mcp-server", "@mastra/core", "opik"],
      noExternal: [],
    },
    optimizeDeps: {
      exclude: ["duckdb", "@stride/mcp-server"],
    },
    build: {
      rollupOptions: {
        external: [
          "duckdb",
          "@stride/mcp-server",
          "@stride/mcp-server/agents",
          "@stride/mcp-server/services",
          "@mastra/core",
          "@mastra/core/agent",
          "@mastra/core/tools",
          "opik",
        ],
      },
    },
  },
});
