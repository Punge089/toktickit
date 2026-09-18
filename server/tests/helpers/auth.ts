import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password.js";

// Issue 63 — shared test helpers for Lab 3 auth (docs/lab-03/tests.md §7).
// `request.agent(app)` keeps a cookie jar across requests, which is what
// every session-based test needs instead of the old
// `X-Dev-Requester-Id` header.

export const DEFAULT_TEST_PASSWORD = "Test-Fixture#Pass1";

export interface CreateUserOptions {
  fullName?: string;
  email?: string;
  role?: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
  isActive?: boolean;
  mustChangePassword?: boolean;
  password?: string;
}

// Creates a standalone user for a test that needs an account it fully
// controls (so it never collides with another test file mutating a
// shared seeded account). Email always gets a Date.now()+random suffix
// unless explicitly overridden.
export async function createUser(options: CreateUserOptions = {}) {
  const prisma = getPrisma();
  const password = options.password ?? DEFAULT_TEST_PASSWORD;
  const passwordHash = await hashPassword(password);
  const email =
    options.email ?? `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.dev`;

  const user = await prisma.user.create({
    data: {
      fullName: options.fullName ?? "Test Fixture User",
      email,
      role: options.role ?? "REQUESTER",
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
      passwordHash,
    },
  });

  return { user, password };
}

// Logs in as an existing user (by email) and returns a Supertest agent
// carrying the resulting session cookie on every subsequent request.
export async function loginAgent(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAgent failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

// Convenience: create a fresh user with the given role and return an
// already-logged-in agent plus the user record.
export async function createAndLoginUser(options: CreateUserOptions = {}) {
  const { user, password } = await createUser(options);
  const agent = await loginAgent(user.email, password);
  return { agent, user, password };
}
