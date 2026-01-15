import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    preset: "node-server",
  },
  vite: {
    resolve: {
      alias: {
        "~": "./src",
      },
    },
  },
});
