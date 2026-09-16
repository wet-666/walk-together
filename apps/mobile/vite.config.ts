import uni from "@dcloudio/vite-plugin-uni";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const sharedTypes = fileURLToPath(
  new URL("../../packages/shared-types/src/index.ts", import.meta.url),
);

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      "@walk-together/shared-types": sharedTypes,
    },
  },
  optimizeDeps: {
    exclude: ["@walk-together/shared-types"],
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ["import", "legacy-js-api", "global-builtin", "if-function"],
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
