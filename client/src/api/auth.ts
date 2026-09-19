import { apiFetch } from "./http.js";

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthedUser {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

// Thrown on a 400 VALIDATION_FAILED response so callers can render
// field-level messages (BR-17/AC-04 pattern, reused from Lab 2's tickets API).
export class ValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(fieldErrors: Record<string, string>) {
    super("Validation failed");
    this.fieldErrors = fieldErrors;
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.message === "string" && body.message) || fallback;
}

// api-spec.md §1 — AC-01, AC-05, AC-06, AC-07.
export async function login(email: string, password: string): Promise<AuthedUser> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 401) {
    throw new Error("Invalid email or password.");
  }
  if (res.status === 403) {
    throw new Error("This account is inactive. Contact your administrator.");
  }
  if (res.status === 429) {
    throw new Error("Too many attempts. Please wait a few minutes and try again.");
  }
  if (!res.ok) {
    throw new Error("Unable to sign in. Please try again.");
  }
  const body = await res.json();
  return body.user;
}

// api-spec.md §2 — AC-08. Idempotent even if already logged out.
export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

// api-spec.md §3. Returns null on 401 (no valid session) instead of
// throwing, since "not logged in" is an expected, normal outcome here.
export async function fetchCurrentUser(): Promise<AuthedUser | null> {
  const res = await apiFetch("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Unable to check your session. Please try again.");
  return res.json();
}

// api-spec.md §4 — BR-08, BR-09, AC-02.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<AuthedUser> {
  const res = await apiFetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new ValidationError(body.fieldErrors ?? {});
  }
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Unable to change your password. Please try again."));
  }
  const body = await res.json();
  return body.user;
}
