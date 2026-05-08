import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["agent/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["agent/**/*.ts"],
      exclude: [
        "agent/__tests__/**",
        "agent/scripts/**",
        "agent/test-*.ts",
        "agent/setup-arena.ts",
        "agent/index.ts",
      ],
    },
  },
});
