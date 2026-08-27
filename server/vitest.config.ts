import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Every test file shares one real Postgres test database (no per-file
    // transaction/schema isolation), so running files in parallel lets them
    // race on the same rows — e.g. one file's ticket insert lands between
    // another file's two "identical" queries, flaking a pagination-order
    // assertion. Sequential files trade some speed for determinism, which
    // matters more for a suite that must pass reliably from `main`.
    fileParallelism: false,
  },
});
