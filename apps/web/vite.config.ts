import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => ({
  envDir: "../..",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@scrum\/contracts$/,
        replacement: fileURLToPath(
          new URL("../../packages/contracts/src/index.ts", import.meta.url)
        )
      },
      ...(process.env.BUILD_DEV_MODE === "1"
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
        : [])
    ]
  },
  server: {
    host: "127.0.0.1",
    port: 5000,
    strictPort: true,
    allowedHosts: ["vmi3181573.contaboserver.net"],
    hmr: {
      host: "vmi3181573.contaboserver.net",
      clientPort: 5443,
      protocol: "wss"
    }
  },
  build: {
    outDir: "../../deploy/web",
    emptyOutDir: true
  },
  preview: {
    allowedHosts: ["vmi3181573.contaboserver.net"]
  }
}));
