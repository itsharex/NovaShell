import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: {
    APP_VERSION: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    chunkSizeWarningLimit: 150,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-canvas', '@xterm/addon-search', '@xterm/addon-web-links'],
          'vendor-codemirror': [
            '@codemirror/view', '@codemirror/state', '@codemirror/commands',
            '@codemirror/language', '@codemirror/search', '@codemirror/autocomplete',
            '@codemirror/theme-one-dark', '@lezer/highlight',
          ],
          'vendor-codemirror-langs': [
            '@codemirror/lang-javascript', '@codemirror/lang-python', '@codemirror/lang-json',
            '@codemirror/lang-html', '@codemirror/lang-css', '@codemirror/lang-yaml',
            '@codemirror/lang-markdown', '@codemirror/lang-sql', '@codemirror/lang-rust',
            '@codemirror/lang-cpp', '@codemirror/lang-java', '@codemirror/lang-php',
            '@codemirror/lang-xml', '@codemirror/lang-go', '@codemirror/lang-sass',
          ],
        },
      },
    },
  },
});
