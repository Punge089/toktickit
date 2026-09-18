import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { AuthedUser, fetchCurrentUser, login as apiLogin, logout as apiLogout } from "../api/auth.js";
import { setUnauthorizedHandler } from "../api/http.js";

// Issue 64 — replaces RequesterContext. Identity now comes entirely from
// the server-side session (docs/lab-03/BR-03); nothing here is ever
// written to sessionStorage/localStorage.
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthedUser | null;
  login: (email: string, password: string) => Promise<AuthedUser>;
  logout: () => Promise<void>;
  /** Re-fetches /api/auth/me — call after a password change so mustChangePassword updates. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthedUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await fetchCurrentUser();
      setUser(current);
      setStatus(current ? "authenticated" : "unauthenticated");
    } catch {
      // A transient failure to reach the API is treated as "not signed
      // in" for routing purposes; individual screens still show their own
      // safe-failure state for data they fetch themselves.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Any 401 from any API call (session expired, revoked, etc.) clears
    // the cached identity immediately, so RequireAuth's next render
    // redirects to /login without needing every page to handle it itself.
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await apiLogin(email, password);
    setUser(loggedInUser);
    setStatus("authenticated");
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
