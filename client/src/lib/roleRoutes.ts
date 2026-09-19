import { Role } from "../api/auth.js";

// Issue 64 — each role's home route (AppRouter.tsx's "/" redirect,
// Forbidden/NotFound's "back to home" link). IT Staff and Administrator
// routes are added in Issue 65-67; today only /tickets exists, so both
// non-Requester roles land on /forbidden until their own home page ships
// rather than 404ing on a route that doesn't exist yet.
export function homeRouteForRole(role: Role | undefined): string {
  switch (role) {
    case "REQUESTER":
      return "/tickets";
    case "IT_STAFF":
      return "/staff/queue";
    case "ADMINISTRATOR":
      return "/admin/users";
    default:
      return "/login";
  }
}
