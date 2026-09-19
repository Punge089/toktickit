import { execSync } from "node:child_process";
import path from "node:path";
import { cleanupE2eUsers } from "./cleanup";

// Lab 3 E2E specs log in with the seeded accounts and expect their documented
// passwords and states (docs/lab-03/specification.md section 7). Accounts a
// previous run created are removed first. The seed converges (re-running it
// resets those accounts), so running it before the suite makes every run start
// from the same known accounts.
export default async function globalSetup() {
  cleanupE2eUsers();
  execSync("npm run prisma:seed", { cwd: path.join(process.cwd(), "server"), stdio: "inherit" });
}
