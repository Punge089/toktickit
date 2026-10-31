import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { RoleBadge } from "../ui/Badge.js";

interface AppShellProps {
  children: ReactNode;
}

// Lab 4 ui-spec.md §2: one entry is marked as the current page, and never two.
// NavLink would light "My Tickets" up on /tickets/new too (it matches by path
// prefix), so the shell decides which entry is current and sets the same class
// and aria-current="page" itself.
function NavItem({ to, current, children }: { to: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={["zen-shell-nav-link", current ? "zen-shell-nav-link-active" : ""].filter(Boolean).join(" ")}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

// Issue 23/64 — application shell (docs/lab-03/ui-spec.md §2): TokTickIT
// identity, role-specific navigation (a role never sees a destination it
// cannot use — the backend enforces the same restriction independently),
// the authenticated user's name + role badge, and a Change Password/
// Log Out dropdown replacing Lab 2's Requester display + Change Requester
// action. Renders no nav at all while the session is still loading, so it
// never flashes the wrong role's links.
export function AppShell({ children }: AppShellProps) {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [identityMenuOpen, setIdentityMenuOpen] = useState(false);

  // A user who must still change their password can reach nothing but that screen
  // (AC-02), so the navigation offers no destinations at all until they have.
  const showNav = user !== null && !user.mustChangePassword;

  async function handleLogout() {
    setIdentityMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  function handleChangePassword() {
    setIdentityMenuOpen(false);
    navigate("/change-password");
  }

  return (
    <div>
      <header className="zen-shell-header">
        <a href="/" className="zen-shell-wordmark">
          TokTickIT
        </a>

        {showNav && (
          <button
            type="button"
            className="zen-shell-hamburger zen-btn zen-btn-tertiary"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            title={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            ☰
          </button>
        )}

        {showNav && (
          <nav
            className={["zen-shell-nav", mobileNavOpen ? "zen-shell-nav-open" : ""].filter(Boolean).join(" ")}
            aria-label="Primary"
          >
            <NavItem to="/dashboard" current={pathname === "/dashboard"}>
              Dashboard
            </NavItem>
            {user.role === "REQUESTER" && (
              <>
                <NavItem to="/tickets" current={pathname === "/tickets" || (pathname.startsWith("/tickets/") && pathname !== "/tickets/new")}>
                  My Tickets
                </NavItem>
                <NavItem to="/tickets/new" current={pathname === "/tickets/new"}>
                  Create Ticket
                </NavItem>
              </>
            )}
            {user.role === "IT_STAFF" && (
              <NavItem to="/staff/queue" current={pathname === "/staff/queue" || pathname.startsWith("/staff/tickets/")}>
                My Queue
              </NavItem>
            )}
            {user.role === "ADMINISTRATOR" && (
              <NavItem to="/admin/users" current={pathname === "/admin/users"}>
                Users
              </NavItem>
            )}
          </nav>
        )}

        <div className="zen-shell-requester">
          {status === "loading" ? null : user ? (
            <div className="zen-shell-identity">
              <button
                type="button"
                className="zen-shell-identity-toggle"
                aria-expanded={identityMenuOpen}
                aria-haspopup="true"
                onClick={() => setIdentityMenuOpen((open) => !open)}
              >
                <span>{user.fullName}</span>
                <RoleBadge role={user.role} />
              </button>
              {identityMenuOpen && (
                <div className="zen-shell-identity-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="zen-shell-identity-menu-item"
                    onClick={handleChangePassword}
                  >
                    Change Password
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="zen-shell-identity-menu-item"
                    onClick={handleLogout}
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span>Not signed in</span>
          )}
        </div>
      </header>

      <main className="zen-shell-main">{children}</main>
    </div>
  );
}
