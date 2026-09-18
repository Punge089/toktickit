import { randomBytes, createHash } from "node:crypto";
import { getPrisma } from "../prisma.js";

// Issue 63 — server-side sessions (docs/lab-03/specification.md §11
// Assumptions: a session table, not a stateless JWT, specifically because
// logout (BR-10) and an Administrator's forced password reset (BR-30)
// both need to revoke a credential immediately). The httpOnly cookie
// carries a random 32-byte token; only its SHA-256 hash is ever stored,
// so a DB read alone cannot be replayed as a session.
export const SESSION_COOKIE_NAME = "tt_session";

function sessionTtlHours(): number {
  const raw = Number(process.env.SESSION_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 8; // BR-11 default
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlHours() * 60 * 60 * 1000);
  await getPrisma().session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
  isActive: boolean;
  mustChangePassword: boolean;
}

// Resolves a raw cookie token to its user, or null if the session doesn't
// exist, has expired (BR-11), or its user is no longer active. An expired
// session is not proactively deleted here (a lazy sweep is fine for a
// course lab); it is simply treated as absent.
export async function resolveSession(token: string): Promise<SessionUser | null> {
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    fullName: session.user.fullName,
    email: session.user.email,
    role: session.user.role,
    isActive: session.user.isActive,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await getPrisma().session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

// BR-09/BR-30: revoke every session for a user. Pass `exceptToken` to keep
// the current session alive after a self-service password change.
export async function deleteSessionsForUser(userId: number, exceptToken?: string): Promise<void> {
  const prisma = getPrisma();
  if (exceptToken) {
    await prisma.session.deleteMany({
      where: { userId, tokenHash: { not: hashToken(exceptToken) } },
    });
  } else {
    await prisma.session.deleteMany({ where: { userId } });
  }
}
