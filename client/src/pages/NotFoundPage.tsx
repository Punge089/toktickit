import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { homeRouteForRole } from "../lib/roleRoutes.js";

// Issue 64 — ui-spec.md §5. Rendered for any unmatched route.
export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="zen-auth-page">
      <div className="zen-auth-card" style={{ textAlign: "center" }}>
        <h1 className="zen-auth-title">Page not found</h1>
        <p style={{ color: "var(--zen-text-muted)" }}>That page doesn't exist.</p>
        <Link to={homeRouteForRole(user?.role)} className="zen-btn zen-btn-primary">
          Back to home
        </Link>
      </div>
    </div>
  );
}
