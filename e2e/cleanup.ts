import { execSync } from "node:child_process";
import path from "node:path";

// Deletes the throwaway `e2e.*@example.dev` accounts earlier E2E steps created
// (see server/prisma/cleanup-e2e-users.ts).
export function cleanupE2eUsers() {
  execSync("npx tsx prisma/cleanup-e2e-users.ts", { cwd: path.join(process.cwd(), "server"), stdio: "pipe" });
}
