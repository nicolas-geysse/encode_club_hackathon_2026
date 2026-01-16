import { defineConfig } from "@solidjs/start/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  server: {
    preset: "node-server",
    // Keep native modules external (not bundled by Nitro)
    externals: ["duckdb"],
  },
  vite: {
    resolve: {
      alias: {
        "~": resolve(__dirname, "./src"),
      },
    },
    // SSR config: don't bundle native modules
    ssr: {
      external: ["duckdb"],
      noExternal: [],
    },
    optimizeDeps: {
      exclude: ["duckdb"],
    },
  },
});
