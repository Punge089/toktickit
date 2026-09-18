import { NextFunction, Request, Response } from "express";
import { parseCookies } from "../lib/cookies.js";
import { resolveSession, SESSION_COOKIE_NAME, SessionUser } from "../lib/session.js";

// Issue 63 — session-based auth middleware chain (docs/lab-03/api-spec.md
// §0). Applied in this order on every protected route: requireAuth ->
// requirePasswordCurrent -> requireRole(...).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

const ROUTES_ALLOWED_DURING_PASSWORD_CHANGE = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/change-password",
]);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.header("cookie"));
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Please log in." });
    return;
  }

  const user = await resolveSession(token);
  if (!user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Please log in." });
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

// BR-02: a user who must change their password cannot reach anything else.
export function requirePasswordCurrent(req: Request, res: Response, next: NextFunction) {
  if (req.user!.mustChangePassword && !ROUTES_ALLOWED_DURING_PASSWORD_CHANGE.has(req.path)) {
    res.status(403).json({
      error: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your password to continue.",
    });
    return;
  }
  next();
}

export function requireRole(...roles: Array<"REQUESTER" | "IT_STAFF" | "ADMINISTRATOR">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to this resource." });
      return;
    }
    next();
  };
}

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// BR-13: reject a state-changing request whose Origin header, when
// present, doesn't match the configured client origin. A request with no
// Origin header (curl, Supertest, a same-origin navigation) is not
// rejected here — SameSite=Lax already blocks a cross-site browser
// request from attaching the cookie in the first place. GET/HEAD requests
// are never rejected by this check (api-spec.md §0).
export function originCheck(req: Request, res: Response, next: NextFunction) {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.header("origin");
  const allowed = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  if (origin && origin !== allowed) {
    res.status(403).json({ error: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." });
    return;
  }
  next();
}
