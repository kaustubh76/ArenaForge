import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
    },
  },
  resolve: {
    // Match tsconfig.json `paths` so tests can use `@/` imports.
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
