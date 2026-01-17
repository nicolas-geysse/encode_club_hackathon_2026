import { defineConfig } from "@solidjs/start/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  server: {
    preset: "node-server",
    // Keep native modules and workspace packages external (not bundled by Nitro)
    externals: ["duckdb", "@stride/mcp-server"],
  },
  vite: {
    server: {
      port: 3002,
      strictPort: true, // Fail if 3002 is occupied
    },
    resolve: {
      alias: {
        "~": resolve(__dirname, "./src"),
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
