import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  // Relative paths let the built app run from any folder or static host.
  base: "./",
  plugins: [react(), wasm()],
  build: { target: "es2022" },
  test: {
    include: ["test/**/*.test.{ts,tsx}", "research/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
