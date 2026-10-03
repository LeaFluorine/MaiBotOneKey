import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// Separate output and entry points keep this experiment out of the standard app.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out-lite/main",
      rollupOptions: {
        input: resolve("src/lite/main.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
});
