import { readFileSync } from "node:fs";
import path from "node:path";

// Lab 2 — Issue 22: point every test run at server/.env.test instead of the
// dev database in server/.env, so seed/CRUD tests never touch dev data.
// Runs before any test file, and before getPrisma() is ever called (the
// Prisma client is a lazy singleton — see src/prisma.ts), so this always
// wins over whatever @prisma/client would otherwise auto-load.
const envTestPath = path.resolve(process.cwd(), ".env.test");

let content: string;
try {
  content = readFileSync(envTestPath, "utf-8");
} catch {
  throw new Error(
    `server/.env.test not found. Copy server/.env and point DATABASE_URL at a ` +
      `dedicated test database (see docs/lab-02/specification.md Phase 0 setup).`,
  );
}

for (const rawLine of content.split("\n")) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}
