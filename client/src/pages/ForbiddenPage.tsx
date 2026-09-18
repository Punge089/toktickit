import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { homeRouteForRole } from "../lib/roleRoutes.js";

// Issue 64 — ui-spec.md §5. Rendered in place of a screen the current
// role cannot reach (AC-11); RequireAuth redirects here before the
// target screen's own data fetch ever fires.
export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <div className="zen-auth-page">
      <div className="zen-auth-card" style={{ textAlign: "center" }}>
        <h1 className="zen-auth-title">Access denied</h1>
        <p style={{ color: "var(--zen-text-muted)" }}>You don't have access to this page.</p>
        <Link to={homeRouteForRole(user?.role)} className="zen-btn zen-btn-primary">
          Back to home
        </Link>
      </div>
    </div>
  );
}
