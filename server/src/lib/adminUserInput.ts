import { validatePasswordPolicy } from "./password.js";

// Issue 67 - input rules for Administrator user management
// (docs/lab-03/api-spec.md sections 15-18; specification.md BR-08, BR-16,
// BR-28, BR-29, BR-33). Kept out of the route so the rules can be read and
// tested without an HTTP round trip.
export const ROLES = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const;
export type UserRole = (typeof ROLES)[number];

export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_SEARCH_LENGTH = 100;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// BR-33: emails are compared trimmed and lowercased, and stored that way, so
// "Aran@x.dev" and "aran@x.dev" can never both exist.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateFullName(raw: unknown): { value?: string; error?: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) return { error: "Full name is required." };
  const value = raw.trim();
  if (value.length > MAX_NAME_LENGTH) return { error: `Full name must be at most ${MAX_NAME_LENGTH} characters.` };
  return { value };
}

export function validateEmail(raw: unknown): { value?: string; error?: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) return { error: "Email is required." };
  const value = normalizeEmail(raw);
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) {
    return { error: "Enter a valid email address." };
  }
  return { value };
}

export function validateRole(raw: unknown): { value?: UserRole; error?: string } {
  if (raw === undefined || raw === null || raw === "") return { error: "Role is required." };
  if (!isRole(raw)) return { error: "Role must be Requester, IT Staff, or Administrator." };
  return { value: raw };
}

export function validateInitialPassword(raw: unknown): { value?: string; error?: string } {
  if (typeof raw !== "string" || raw.length === 0) return { error: "Initial password is required." };
  const problems = validatePasswordPolicy(raw);
  if (problems.length > 0) return { error: problems.join(" ") };
  return { value: raw };
}
