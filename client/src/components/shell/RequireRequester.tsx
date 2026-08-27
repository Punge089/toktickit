import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useRequester } from "../../context/RequesterContext.js";

// Issue 25 — AC-02: visiting a Requester-scoped route with no Requester
// selected redirects to the Selection screen instead of rendering.
export function RequireRequester({ children }: { children: ReactNode }) {
  const { requester } = useRequester();
  const location = useLocation();

  if (!requester) {
    return <Navigate to="/select-requester" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
