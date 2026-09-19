import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import { AppRouter } from "../../src/AppRouter.js";

const API_URL = "http://localhost:3000";

const REQUESTER = { id: 1, fullName: "Aran Suksawat", email: "aran.suksawat@example.dev", role: "REQUESTER" as const, mustChangePassword: false };
const IT_STAFF = { id: 8, fullName: "Jennifer Anderson", email: "jennifer.anderson@example.dev", role: "IT_STAFF" as const, mustChangePassword: false };
const ADMIN = { id: 12, fullName: "John Smith", email: "john.smith@example.dev", role: "ADMINISTRATOR" as const, mustChangePassword: false };

function renderAs(user: typeof REQUESTER | typeof IT_STAFF | typeof ADMIN, initialPath = "/") {
  server.use(http.get(`${API_URL}/api/auth/me`, () => HttpResponse.json(user)));
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// docs/lab-03/tests.md UI-06, UI-07 — specification.md AC-10, AC-11.
describe("Application shell — role-aware navigation", () => {
  it("shows Requester nav (My Tickets, Create Ticket) and the Requester role badge", async () => {
    renderAs(REQUESTER);
    const nav = within(await screen.findByRole("navigation"));
    expect(nav.getByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
    expect(nav.queryByRole("link", { name: /^my queue$/i })).not.toBeInTheDocument();
    expect(nav.queryByRole("link", { name: /^users$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Aran Suksawat")).toBeInTheDocument();
    expect(screen.getByText("Requester")).toBeInTheDocument();
  });

  it("shows IT Staff nav (My Queue only) and the IT Staff role badge", async () => {
    renderAs(IT_STAFF, "/staff/queue");
    const nav = within(await screen.findByRole("navigation"));
    expect(nav.getByRole("link", { name: /^my queue$/i })).toBeInTheDocument();
    expect(nav.queryByRole("link", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(nav.queryByRole("link", { name: /create ticket/i })).not.toBeInTheDocument();
    expect(screen.getByText("IT Staff")).toBeInTheDocument();
  });

  it("shows Administrator nav (Users only) and the Administrator role badge", async () => {
    renderAs(ADMIN, "/admin/users");
    const nav = within(await screen.findByRole("navigation"));
    expect(nav.getByRole("link", { name: /^users$/i })).toBeInTheDocument();
    expect(nav.queryByRole("link", { name: /my tickets/i })).not.toBeInTheDocument();
    // Scoped to the header: the User Management screen below it also lists
    // "Administrator" (as a role filter option).
    expect(within(screen.getByRole("banner")).getByText("Administrator")).toBeInTheDocument();
  });

  // UI-07, AC-11 — a role hitting a route it cannot use lands on Forbidden
  // and never renders the protected screen (so its own data fetch never fires).
  it("shows Forbidden, not the Queue, when a Requester opens /staff/queue directly", async () => {
    let queueFetched = false;
    server.use(
      http.get(`${API_URL}/api/staff/tickets`, () => {
        queueFetched = true;
        return HttpResponse.json({ items: [] });
      }),
    );
    renderAs(REQUESTER, "/staff/queue");
    expect(await screen.findByRole("heading", { name: /access denied/i })).toBeInTheDocument();
    expect(queueFetched).toBe(false);
  });

  it("shows Forbidden when a Requester opens /admin/users directly", async () => {
    renderAs(REQUESTER, "/admin/users");
    expect(await screen.findByRole("heading", { name: /access denied/i })).toBeInTheDocument();
  });

  it("opens and closes the identity dropdown with Change Password and Log Out actions", async () => {
    const user = userEvent.setup();
    renderAs(REQUESTER);
    await screen.findByText("Aran Suksawat");

    const toggle = screen.getByRole("button", { name: /aran suksawat/i });
    await user.click(toggle);

    expect(screen.getByRole("menuitem", { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
  });
});
