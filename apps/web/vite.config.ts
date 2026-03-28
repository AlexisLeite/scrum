import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => ({
  envDir: "../..",
  plugins: [react()],
  resolve: {
    alias:
      process.env.BUILD_DEV_MODE === "1"
        ? [
            {
              find: /^react-dom$/,
              replacement: fileURLToPath(
                new URL("./react-dom-profiling.js", import.meta.url)
              )
            },
            {
              find: /^react-dom\/client$/,
              replacement: fileURLToPath(
                new URL("./react-dom-client-profiling.js", import.meta.url)
              )
            }
          ]
        : []
  },
  server: {
    port: 5173
  }
}));
