import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src } },
  test: {
    projects: [
      {
        resolve: { alias: { "@": src } },
        test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup-env.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
