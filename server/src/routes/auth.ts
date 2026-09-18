import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "../lib/password.js";
import { createSession, deleteSessionByToken, deleteSessionsForUser } from "../lib/session.js";
import { serializeCookie } from "../lib/cookies.js";
import { SESSION_COOKIE_NAME } from "../lib/session.js";
import { checkThrottle, recordFailedAttempt, resetThrottle } from "../lib/loginThrottle.js";
import { requireAuth } from "../middleware/auth.js";

// Issue 63 — authentication endpoints (docs/lab-03/api-spec.md §1-4).
export const authRouter = Router();

function publicUser(user: { id: number; fullName: string; email: string; role: string; mustChangePassword: boolean }) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

authRouter.post("/api/auth/login", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Email and password are required.",
      fieldErrors: {
        ...(!email ? { email: "Email is required." } : {}),
        ...(!password ? { password: "Password is required." } : {}),
      },
    });
    return;
  }

  const waitSeconds = checkThrottle(email);
  if (waitSeconds !== null) {
    res.setHeader("Retry-After", String(waitSeconds));
    res.status(429).json({ error: "TOO_MANY_ATTEMPTS", message: "Too many failed attempts. Try again later." });
    return;
  }

  const user = await getPrisma().user.findUnique({ where: { email: email.toLowerCase() } });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !passwordOk) {
    recordFailedAttempt(email);
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    return;
  }

  if (!user.isActive) {
    // BR-12: only a *correct* password on an inactive account reveals
    // this — an incorrect one already returned INVALID_CREDENTIALS above.
    res.status(403).json({
      error: "ACCOUNT_INACTIVE",
      message: "This account is inactive. Contact your administrator.",
    });
    return;
  }

  resetThrottle(email);
  const { token, expiresAt } = await createSession(user.id);
  const ttlSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, token, { maxAgeSeconds: ttlSeconds }));
  res.status(200).json({ user: publicUser(user) });
});

authRouter.post("/api/auth/logout", async (req: Request, res: Response) => {
  const cookieHeader = req.header("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (match) {
    const token = decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1));
    await deleteSessionByToken(token);
  }
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, "", { expiresNow: true }));
  res.status(204).send();
});

authRouter.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
  res.status(200).json(publicUser(req.user!));
});

authRouter.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

  const fieldErrors: Record<string, string> = {};

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) fieldErrors.currentPassword = "Current password is incorrect.";

  const policyErrors = validatePasswordPolicy(newPassword);
  if (policyErrors.length > 0) fieldErrors.newPassword = policyErrors.join(" ");

  if (newPassword !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  // BR-09: new password must differ from the current one. Only checked
  // once the current password itself is verified correct, and only when
  // the new password otherwise passed policy, so this never masks a
  // simpler validation failure.
  if (currentOk && policyErrors.length === 0 && (await verifyPassword(newPassword, user.passwordHash))) {
    fieldErrors.newPassword = "New password must be different from your current password.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors });
    return;
  }

  const newHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  // Keep the session that just performed this change; revoke every other
  // one (BR: changing your password logs out other devices).
  await deleteSessionsForUser(user.id, req.sessionToken);

  res.status(200).json({ user: publicUser(updated) });
});
