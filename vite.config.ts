import { defineConfig } from "vitest/config";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  // Relative paths let the built app run from any folder or static host.
  base: "./",
  plugins: [wasm()],
  build: { target: "es2022" },
  test: {
    include: ["test/**/*.test.ts", "research/**/*.test.ts"],
  },
});
