import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { Role } from "../../api/auth.js";
import { Spinner } from "../ui/Spinner.js";

interface RequireAuthProps {
  children: ReactNode;
  /** Omit to allow any authenticated role. */
  roles?: Role[];
}

// Issue 64 — replaces RequireRequester. AC-09: unauthenticated access
// redirects to /login. AC-02/BR-02: a user who must change their password
// is redirected to /change-password before anything else renders.
// AC-11: a role mismatch redirects to /forbidden without ever rendering
// the protected screen (so its data fetch never fires).
export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <Spinner label="Checking your session…" />;
  }

  if (status === "unauthenticated" || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
