import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";

interface AppShellProps {
  children: ReactNode;
  /** Placeholder until Issue 25 wires the real Requester context. */
  requesterName?: string | null;
  onChangeRequester?: () => void;
}

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  ["zen-shell-nav-link", isActive ? "zen-shell-nav-link-active" : ""].filter(Boolean).join(" ");

// Issue 23 — application shell (ui-spec.md §4): TokTickIT identity, My
// Tickets / Create Ticket nav with active-page indication, current-Requester
// display + Change Requester action, and a mobile nav that collapses below
// 768px.
export function AppShell({ children, requesterName, onChangeRequester }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div>
      <header className="zen-shell-header">
        <a href="/" className="zen-shell-wordmark">
          TokTickIT
        </a>

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

        <nav
          className={["zen-shell-nav", mobileNavOpen ? "zen-shell-nav-open" : ""].filter(Boolean).join(" ")}
          aria-label="Primary"
        >
          <NavLink to="/tickets" className={NAV_LINK_CLASS}>
            My Tickets
          </NavLink>
          <NavLink to="/tickets/new" className={NAV_LINK_CLASS}>
            Create Ticket
          </NavLink>
        </nav>

        <div className="zen-shell-requester">
          {requesterName ? (
            <>
              <span>{requesterName}</span>
              <button
                type="button"
                className="zen-btn zen-btn-tertiary"
                style={{ color: "#ffffff", minHeight: "auto", padding: 0 }}
                onClick={onChangeRequester}
              >
                Change Requester
              </button>
            </>
          ) : (
            <span>No Development Requester selected</span>
          )}
        </div>
      </header>

      <main className="zen-shell-main">{children}</main>
    </div>
  );
}
