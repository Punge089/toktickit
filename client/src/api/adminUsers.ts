import { apiFetch } from "./http.js";
import { Role, ValidationError } from "./auth.js";
import { ForbiddenError } from "./staffQueue.js";

// Issue 67 - Administrator user management (docs/lab-03/api-spec.md
// sections 15-18).
export interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface UserList {
  items: AdminUser[];
  activeAdministratorCount: number;
}

export interface UserQuery {
  search?: string;
  role?: string;
}

// A 409 from the API: a duplicate email, or one of the Administrator safety
// rules. `code` is the API's error code so the screen can put EMAIL_TAKEN under
// the Email field and show the rest as a message.
export class ConflictError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null);
  if (res.status === 403) return new ForbiddenError("Forbidden");
  if (res.status === 400 && body?.fieldErrors) return new ValidationError(body.fieldErrors);
  if (res.status === 409 && typeof body?.error === "string") {
    return new ConflictError(body.error, typeof body.message === "string" ? body.message : fallback);
  }
  if (res.status === 404) return new Error("That user no longer exists. Refresh the list.");
  return new Error(fallback);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// GET /api/admin/users
export async function fetchUsers(query: UserQuery): Promise<UserList> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.role) params.set("role", query.role);

  const res = await apiFetch(`/api/admin/users?${params.toString()}`);
  if (!res.ok) throw await failure(res, "Unable to load users. Please try again.");
  return res.json();
}

export interface NewUser {
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  initialPassword: string;
}

// POST /api/admin/users
export async function createUser(user: NewUser): Promise<AdminUser> {
  const res = await apiFetch("/api/admin/users", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(user) });
  if (!res.ok) throw await failure(res, "Unable to create the user. Please try again.");
  return res.json();
}

// PATCH /api/admin/users/:id - only the fields that changed are sent.
export async function updateUser(
  id: number,
  changes: Partial<Pick<AdminUser, "fullName" | "email" | "role" | "isActive">>,
): Promise<AdminUser> {
  const res = await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(changes) });
  if (!res.ok) throw await failure(res, "Unable to save the user. Please try again.");
  return res.json();
}

// POST /api/admin/users/:id/initial-password
export async function setInitialPassword(id: number, initialPassword: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/initial-password`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ initialPassword }),
  });
  if (!res.ok) throw await failure(res, "Unable to set the new initial password. Please try again.");
}
