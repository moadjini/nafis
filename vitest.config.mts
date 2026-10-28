import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Runs against the real Supabase project in .env.local with throwaway
        // users that are deleted afterwards. Requires network access.
        resolve: { alias },
        test: {
          name: "rls",
          include: ["tests/rls/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
