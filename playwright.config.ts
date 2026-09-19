import { defineConfig, devices } from "@playwright/test";

// Issue 32 — E2E, responsive, and visual evidence. Starts the real server
// and client dev servers (not mocked) so the flow exercises the actual
// PostgreSQL-backed API end to end, per specification.md's Test Strategy.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One worker: every spec shares the one dev database, and several of them
  // change shared rows (ticket state, user accounts), so files must not overlap.
  workers: 1,
  // Re-seeds the dev database so every run starts from the documented accounts
  // (a previous run may have changed a seeded password or deactivated a user).
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      cwd: "server",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      cwd: "client",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
