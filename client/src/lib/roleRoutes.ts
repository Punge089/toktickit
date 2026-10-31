import { Role } from "../api/auth.js";

// Issue 64, changed in Lab 4 (FR-17): every signed-in role lands on its Dashboard
// (AppRouter.tsx's "/" redirect, Forbidden and Not Found's "back to home" link).
// The Dashboard page shows the Requester or the IT Staff view by role.
export function homeRouteForRole(role: Role | undefined): string {
  return role ? "/dashboard" : "/login";
}
